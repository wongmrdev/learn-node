import { useEffect, useState } from 'react';
import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `# docker-compose.yml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  worker:
    build: { context: ., dockerfile: apps/worker/Dockerfile }
    environment:
      REDIS_URL: redis://redis:6379
      WORKER_CONCURRENCY: "10"
    depends_on: { redis: { condition: service_healthy } }

# Run N worker containers:
$ docker compose up -d --scale worker=4

# apps/worker/src/index.ts
const PROCESS_ID = \`\${hostname()}.\${process.pid}\`;

// Each worker reports its state to a Redis hash so the api
// (running anywhere) can see what every container is doing.
async function publishWorker(state) {
  state.lastSeenAt = Date.now();
  await redis.hset(WORKERS_KEY, state.id, JSON.stringify(state));
}

async function workerLoop(slotId) {
  const state = { id: \`\${PROCESS_ID}.\${slotId}\`, ... };
  while (true) {
    const [, raw] = await client.brpop(QUEUE_KEY, 0);
    const msg = JSON.parse(raw);

    state.status = 'processing';
    state.currentMessageId = msg.id;
    await publishWorker(state);

    if (msg.mode === 'cpu') cpuWork(msg.durationMs);
    else await sleepWork(msg.durationMs);

    state.status = 'idle';
    await publishWorker(state);
    await redis.incr(PROCESSED_KEY);
  }
}`;

type WorkMode = 'sleep' | 'cpu';

type WorkerSnapshot = {
  id: string;
  processId: string;
  status: 'idle' | 'processing';
  currentMessageId: string | null;
  lastSeenAt: number;
};

type ProcessStats = {
  processId: string;
  cpuPercent: number;
  eventLoopLagMs: number;
  concurrency: number;
  startedAt: number;
  lastSeenAt: number;
};

type Snapshot = {
  depth: number;
  processed: number;
  throughput: number;
  apiEventLoopLagMs: number;
  apiCpuPercent: number;
  workers: WorkerSnapshot[];
  processes: ProcessStats[];
};

const EMPTY_SNAPSHOT: Snapshot = {
  depth: 0,
  processed: 0,
  throughput: 0,
  apiEventLoopLagMs: 0,
  apiCpuPercent: 0,
  workers: [],
  processes: [],
};

function useQueueSnapshot(): { snapshot: Snapshot; connected: boolean } {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    let cancelled = false;

    (async () => {
      while (!cancelled) {
        try {
          const res = await fetch('/api/queue/stream', { signal: abort.signal });
          if (!res.body) throw new Error('no body');
          setConnected(true);
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buffer = '';
          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += dec.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() ?? '';
            for (const chunk of chunks) {
              const line = chunk.split('\n').find((l) => l.startsWith('data: '));
              if (!line) continue;
              try {
                setSnapshot(JSON.parse(line.slice(6)) as Snapshot);
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          setConnected(false);
          if (cancelled) return;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
    };
  }, []);

  return { snapshot, connected };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtMs(n: number): string {
  if (n < 1) return `${n.toFixed(2)}ms`;
  if (n < 10) return `${n.toFixed(1)}ms`;
  return `${Math.round(n)}ms`;
}

function shortProcessId(id: string): string {
  // hostname.pid -> trim long hostnames to first segment
  const dot = id.indexOf('.');
  const host = dot > 0 ? id.slice(0, dot) : id;
  const pid = dot > 0 ? id.slice(dot + 1) : '';
  const shortHost = host.slice(0, 12);
  return pid ? `${shortHost}·${pid}` : shortHost;
}

function cpuSeverity(percent: number): 'ok' | 'warn' | 'danger' {
  if (percent >= 90) return 'danger';
  if (percent >= 60) return 'warn';
  return 'ok';
}

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const { snapshot, connected } = useQueueSnapshot();
  const [mode, setMode] = useState<WorkMode>('cpu');
  const [count, setCount] = useState('5000');
  const [durationMs, setDurationMs] = useState('20');

  const enqueue = async () => {
    setBusy(true);
    await runRequest(
      'POST',
      '/api/queue/enqueue',
      { count: Number(count), mode, durationMs: Number(durationMs) },
      pushLog,
    );
    setBusy(false);
  };

  const reset = async () => {
    setBusy(true);
    await runRequest('POST', '/api/queue/reset', undefined, pushLog);
    setBusy(false);
  };

  const totalWorkers = snapshot.workers.length;
  const busyWorkers = snapshot.workers.filter((w) => w.status === 'processing').length;

  // Group workers by processId for display
  const workersByProcess = new Map<string, WorkerSnapshot[]>();
  for (const w of snapshot.workers) {
    const list = workersByProcess.get(w.processId) ?? [];
    list.push(w);
    workersByProcess.set(w.processId, list);
  }
  const processList = [...snapshot.processes].sort((a, b) =>
    a.processId.localeCompare(b.processId),
  );

  return (
    <div className="queue-dash">
      <div className="queue-status-bar">
        <span className={`live-dot ${connected ? '' : 'idle'}`} />
        <span className="queue-status-label">
          {connected ? 'Live · /api/queue/stream' : 'Reconnecting...'}
        </span>
        <span className="queue-status-spacer" />
        <span className="queue-status-label">
          {processList.length} container{processList.length === 1 ? '' : 's'} · {totalWorkers} workers · {busyWorkers} busy
        </span>
      </div>

      <div className="queue-stats five">
        <div className="stat-card stat-cyan">
          <span className="stat-label">Queue depth</span>
          <span className="stat-value">{fmt(snapshot.depth)}</span>
        </div>
        <div className="stat-card stat-green">
          <span className="stat-label">Processed</span>
          <span className="stat-value">{fmt(snapshot.processed)}</span>
        </div>
        <div className="stat-card stat-magenta">
          <span className="stat-label">Throughput</span>
          <span className="stat-value">{fmt(snapshot.throughput)} <small>/s</small></span>
        </div>
        <div className={`stat-card stat-gauge stat-${snapshot.apiEventLoopLagMs >= 20 ? 'warn' : 'ok'}`}>
          <span className="stat-label">API loop lag</span>
          <span className="stat-value">{fmtMs(snapshot.apiEventLoopLagMs)}</span>
        </div>
        <div className={`stat-card stat-gauge stat-${cpuSeverity(snapshot.apiCpuPercent)}`}>
          <span className="stat-label">API CPU</span>
          <span className="stat-value">{Math.round(snapshot.apiCpuPercent)}<small>%</small></span>
        </div>
      </div>

      <div className="runner-card">
        <span className="runner-label" style={{ flex: 'none' }}>Work mode</span>
        <div className="mode-toggle">
          <button
            className={`mode-btn ${mode === 'sleep' ? 'active' : ''}`}
            onClick={() => setMode('sleep')}
            disabled={busy}
          >
            Sleep <small>(setTimeout)</small>
          </button>
          <button
            className={`mode-btn magenta ${mode === 'cpu' ? 'active' : ''}`}
            onClick={() => setMode('cpu')}
            disabled={busy}
          >
            CPU <small>(sha256)</small>
          </button>
        </div>
      </div>

      <div className="runner-card">
        <span className="runner-label" style={{ flex: 'none' }}>Count</span>
        <input
          className="input"
          type="number"
          value={count}
          min={1}
          max={100000}
          onChange={(e) => setCount(e.target.value)}
        />
        <span className="runner-label" style={{ flex: 'none' }}>Duration</span>
        <input
          className="input"
          type="number"
          value={durationMs}
          min={1}
          max={500}
          onChange={(e) => setDurationMs(e.target.value)}
        />
        <span className="runner-label" style={{ flex: 'none', color: 'var(--text-dim)' }}>ms / msg</span>
        <button className="btn" onClick={enqueue} disabled={busy || !count || !durationMs}>
          Enqueue
        </button>
        <button className="btn magenta" onClick={reset} disabled={busy}>
          Reset
        </button>
      </div>

      {processList.length === 0 ? (
        <div className="worker-grid-empty">
          No worker processes registered. Start them with{' '}
          <code>docker compose up -d --scale worker=4</code> or{' '}
          <code>pnpm -F @learn-node/worker dev</code>.
        </div>
      ) : (
        <div className="process-list">
          {processList.map((proc) => {
            const procWorkers = workersByProcess.get(proc.processId) ?? [];
            const procBusy = procWorkers.filter((w) => w.status === 'processing').length;
            const severity = cpuSeverity(proc.cpuPercent);
            return (
              <div key={proc.processId} className="process-card">
                <div className="process-header">
                  <span className="process-id">{shortProcessId(proc.processId)}</span>
                  <span className="process-meta">
                    {procBusy}/{proc.concurrency} busy · loop {fmtMs(proc.eventLoopLagMs)}
                  </span>
                  <span className={`process-cpu stat-${severity}`}>
                    <span className="process-cpu-label">CPU</span>
                    <span className="process-cpu-value">{Math.round(proc.cpuPercent)}%</span>
                    <span className="process-cpu-bar">
                      <span
                        className="process-cpu-bar-fill"
                        style={{ width: `${Math.min(100, proc.cpuPercent)}%` }}
                      />
                    </span>
                  </span>
                </div>
                <div className="worker-grid">
                  {procWorkers.length === 0 ? (
                    <div className="worker-msg-empty">no workers</div>
                  ) : (
                    procWorkers.map((w) => (
                      <div
                        key={w.id}
                        className={`worker-card ${w.status === 'processing' ? 'busy' : ''}`}
                      >
                        <div className="worker-header">
                          <span className="worker-id">
                            slot {w.id.slice(w.id.lastIndexOf('.') + 1)}
                          </span>
                          <span
                            className={`worker-status ${w.status === 'processing' ? 'busy' : 'idle'}`}
                          >
                            <span className="worker-dot" />
                            {w.status}
                          </span>
                        </div>
                        <div className="worker-msg">
                          {w.currentMessageId ?? (
                            <span className="worker-msg-empty">—</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="prose" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Try this: <code>docker compose up -d --scale worker=4</code>, then enqueue
        5,000 in <code>CPU</code> mode. Watch four containers all pin to ~100%
        in parallel — and notice the <strong>API CPU stays near 0%</strong>
        because no work runs in this process anymore. Throughput is now ~4×
        Lesson 10's single-thread ceiling.
      </p>
    </div>
  );
}

const lesson: Lesson = {
  slug: 'distributed',
  number: '11',
  title: 'Distributed Workers via Docker',
  summary:
    'Move workers out of the API process into their own containers. Same Redis queue, real OS-level parallelism, and the API stays responsive under load.',
  explanation: (
    <>
      <p>
        Lesson 10 showed that all the JavaScript on a Node process runs on{' '}
        <strong>one</strong> OS thread. The way past that ceiling is to run
        more processes — ideally one per CPU core. Redis's atomic{' '}
        <code>BRPOP</code> already guarantees safe sharing across any number of
        consumers, so we don't need any new coordination — just more workers.
      </p>
      <p>
        We've split the worker loop out of <code>apps/api</code> into a new
        workspace, <code>apps/worker</code>. It does nothing but{' '}
        <code>BRPOP</code> messages from Redis and report its state into two
        Redis hashes (<code>learn-node:workers</code> for per-slot status,{' '}
        <code>learn-node:processes</code> for per-container CPU and loop lag).
        The API reads those hashes when it builds the dashboard snapshot — so
        the producer and the monitor don't need to know <em>where</em> the
        workers live. Local process, Docker container, another machine — it's
        all the same wire protocol.
      </p>
      <p>
        Scale the worker service with{' '}
        <code>docker compose up -d --scale worker=N</code>. Each container
        registers under a unique <code>hostname.pid</code> process id and runs{' '}
        <code>WORKER_CONCURRENCY</code> in-process slots (10 by default).
        Drainage now genuinely happens in parallel: N processes × M
        slots = N × M concurrent messages, and CPU-bound work uses N full cores
        instead of one.
      </p>
      <p>
        <strong>The producer/monitor stays responsive.</strong> Look at the{' '}
        <em>API CPU</em> and <em>API loop lag</em> stats: they hover near zero
        while the worker containers are pinned. Compare with Lesson 10, where
        CPU work in the same process froze the dashboard.
      </p>
      <p>
        <strong>Prereqs:</strong> Redis is already in <code>docker-compose.yml</code>.
        Bring up workers with <code>docker compose up -d --scale worker=4</code>{' '}
        (or run a single one outside Docker with{' '}
        <code>pnpm -F @learn-node/worker dev</code>). The previous lessons (09,
        10) also need worker processes now — they used to spawn workers
        in-process; that's gone.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
