import { useEffect, useState } from 'react';
import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `import { createHash } from 'node:crypto';

// SLEEP mode: yields to the event loop the whole time. Zero CPU.
async function sleepWork(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// CPU mode: blocks the thread with sha256 for ~ms wall-clock.
// Nothing else on the Node thread can make progress while this runs.
function cpuWork(ms: number) {
  const buf = Buffer.alloc(64, 0);
  const target = Date.now() + ms;
  while (Date.now() < target) {
    for (let i = 0; i < 500; i++) {
      createHash('sha256').update(buf).digest();
    }
  }
}

async function workerLoop(state) {
  while (true) {
    const result = await client.brpop(QUEUE_KEY, 0);
    const msg = JSON.parse(result[1]);

    state.status = 'processing';
    state.currentMessageId = msg.id;

    // Same single thread — only ONE of these can run at a time.
    if (msg.mode === 'cpu') cpuWork(msg.durationMs);
    else await sleepWork(msg.durationMs);

    state.status = 'idle';
  }
}`;

type WorkMode = 'sleep' | 'cpu';

type WorkerSnapshot = {
  id: number;
  status: 'idle' | 'processing';
  currentMessageId: string | null;
  lastFinishedAt: number | null;
};

type Snapshot = {
  depth: number;
  processed: number;
  throughput: number;
  eventLoopLagMs: number;
  cpuPercent: number;
  workers: WorkerSnapshot[];
};

const EMPTY_SNAPSHOT: Snapshot = {
  depth: 0,
  processed: 0,
  throughput: 0,
  eventLoopLagMs: 0,
  cpuPercent: 0,
  workers: [],
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

function lagSeverity(ms: number): 'ok' | 'warn' | 'danger' {
  if (ms >= 100) return 'danger';
  if (ms >= 20) return 'warn';
  return 'ok';
}

function cpuSeverity(percent: number): 'ok' | 'warn' | 'danger' {
  if (percent >= 90) return 'danger';
  if (percent >= 60) return 'warn';
  return 'ok';
}

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const { snapshot, connected } = useQueueSnapshot();
  const [mode, setMode] = useState<WorkMode>('sleep');
  const [count, setCount] = useState('1000');
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

  return (
    <div className="queue-dash">
      <div className="queue-status-bar">
        <span className={`live-dot ${connected ? '' : 'idle'}`} />
        <span className="queue-status-label">
          {connected ? 'Live · /api/queue/stream' : 'Reconnecting...'}
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
        <div className={`stat-card stat-gauge stat-${lagSeverity(snapshot.eventLoopLagMs)}`}>
          <span className="stat-label">Loop lag p99</span>
          <span className="stat-value">{fmtMs(snapshot.eventLoopLagMs)}</span>
        </div>
        <div className={`stat-card stat-gauge stat-${cpuSeverity(snapshot.cpuPercent)}`}>
          <span className="stat-label">Node CPU</span>
          <span className="stat-value">{Math.round(snapshot.cpuPercent)}<small>%</small></span>
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
            Sleep <small>(fake — setTimeout)</small>
          </button>
          <button
            className={`mode-btn magenta ${mode === 'cpu' ? 'active' : ''}`}
            onClick={() => setMode('cpu')}
            disabled={busy}
          >
            CPU <small>(real — sha256)</small>
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

      <p className="prose" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        Try this: enqueue 10,000 with <code>Sleep</code> mode — throughput soars,
        loop lag stays near zero, CPU barely moves. Now switch to <code>CPU</code>,
        enqueue another 1,000 — throughput collapses to roughly one thread's
        worth, loop lag explodes, CPU pins at 100%. Adding more workers
        (queue.ts) will not help.
      </p>
    </div>
  );
}

const lesson: Lesson = {
  slug: 'ceiling',
  number: '10',
  title: 'The Single-Thread Ceiling',
  summary:
    'Node runs your JavaScript on one OS thread. Real CPU work makes that ceiling visible — and adding workers no longer helps.',
  explanation: (
    <>
      <p>
        Lesson 09's setup is the shape of a real queue, but the "work" each
        worker does — <code>setTimeout</code> — doesn't actually use the CPU.
        It just registers a timer with libuv and yields. That's why bumping
        workers from 5 to 500 multiplied throughput by ~100×: nothing was
        competing for the thread.
      </p>
      <p>
        Real work — JSON.parse on a fat body, a sha256, a regex match, a
        synchronous file read — actually <strong>uses</strong> the Node thread.
        And there's only one. Every CPU-bound message blocks the loop for its
        full duration before the next message can be dequeued.
      </p>
      <p>
        Flip the mode toggle below to <code>CPU</code> and watch what happens:
      </p>
      <ul>
        <li>
          <strong>Throughput plateaus</strong> around{' '}
          <code>1 / durationMs × 1000</code> messages per second — one thread's
          worth, no matter how many workers there are.
        </li>
        <li>
          <strong>Event-loop lag explodes.</strong> Every CPU block starves the
          loop. Other requests (including the SSE stream rendering this
          dashboard) get delayed by tens to hundreds of ms.
        </li>
        <li>
          <strong>Node CPU pins at ~100%.</strong> One core is fully busy.
          (You'd need a second OS thread to push past 100% — coming in Lesson 11.)
        </li>
        <li>
          The dashboard itself updates more slowly, and worker cards may stay
          stuck on "processing" because the thread is too busy to mark them
          idle.
        </li>
      </ul>
      <p>
        That's the single-thread ceiling. To break it you need real OS
        parallelism: <code>node:worker_threads</code> (more threads inside one
        process), <code>node:cluster</code> (multiple processes on one machine),
        or — what we'll do in Lesson 11 — multiple Node containers all
        consuming the same Redis queue.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
