import { useEffect, useRef, useState } from 'react';
import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `import { Redis } from 'ioredis';

const QUEUE_KEY = 'learn-node:jobs';
const WORKER_COUNT = 5;

// Producer: routes call this to push work.
async function enqueueMany(count: number, payload: string) {
  const pipeline = redis.pipeline();
  for (let i = 0; i < count; i++) {
    const msg = { id: \`msg-\${nextSeq()}\`, payload, enqueuedAt: Date.now() };
    pipeline.lpush(QUEUE_KEY, JSON.stringify(msg));
  }
  await pipeline.exec();
}

// Worker: 5 of these run in parallel, each on its own connection.
async function workerLoop(state) {
  const client = new Redis();
  while (true) {
    // BRPOP blocks until a message arrives. The atomic pop is what makes
    // multiple workers safe: Redis guarantees one consumer per message.
    const result = await client.brpop(QUEUE_KEY, 0);
    if (!result) continue;
    const msg = JSON.parse(result[1]);

    state.status = 'processing';
    state.currentMessageId = msg.id;

    await doWork(msg); // simulate 5-50ms of work

    state.status = 'idle';
    state.currentMessageId = null;
  }
}`;

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
  workers: WorkerSnapshot[];
};

const EMPTY_SNAPSHOT: Snapshot = {
  depth: 0,
  processed: 0,
  throughput: 0,
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

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const { snapshot, connected } = useQueueSnapshot();
  const [count, setCount] = useState('10000');
  const peakDepthRef = useRef(0);
  peakDepthRef.current = Math.max(peakDepthRef.current, snapshot.depth);

  const enqueue = async () => {
    setBusy(true);
    await runRequest('POST', '/api/queue/enqueue', { count: Number(count) }, pushLog);
    setBusy(false);
  };

  const reset = async () => {
    setBusy(true);
    peakDepthRef.current = 0;
    await runRequest('POST', '/api/queue/reset', undefined, pushLog);
    setBusy(false);
  };

  return (
    <div className="queue-dash">
      <div className="queue-status-bar">
        <span className={`live-dot ${connected ? '' : 'idle'}`} />
        <span className="queue-status-label">
          {connected ? 'Connected to /api/queue/stream' : 'Reconnecting...'}
        </span>
      </div>

      <div className="queue-stats">
        <StatCard label="Queue depth" value={formatNumber(snapshot.depth)} accent="cyan" />
        <StatCard label="Processed" value={formatNumber(snapshot.processed)} accent="green" />
        <StatCard label="Throughput" value={`${formatNumber(snapshot.throughput)} /s`} accent="magenta" />
      </div>

      <div className="queue-progress">
        <div
          className="queue-progress-bar"
          style={{
            width: `${peakDepthRef.current > 0 ? Math.max(2, (snapshot.depth / peakDepthRef.current) * 100) : 0}%`,
          }}
        />
      </div>

      {snapshot.workers.length > 0 ? (
        <div className="worker-grid">
          {snapshot.workers.map((w) => (
            <WorkerCard key={w.id} worker={w} />
          ))}
        </div>
      ) : (
        <div className="worker-grid-empty">Waiting for workers...</div>
      )}

      <div className="runner-card queue-controls">
        <span className="runner-label">Push messages onto the queue:</span>
        <input
          className="input"
          type="number"
          value={count}
          min={1}
          max={100000}
          onChange={(e) => setCount(e.target.value)}
        />
        <button className="btn" onClick={enqueue} disabled={busy || !count}>
          Enqueue
        </button>
        <button className="btn magenta" onClick={reset} disabled={busy}>
          Reset
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'cyan' | 'green' | 'magenta';
}) {
  return (
    <div className={`stat-card stat-${accent}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function WorkerCard({ worker }: { worker: WorkerSnapshot }) {
  const busy = worker.status === 'processing';
  return (
    <div className={`worker-card ${busy ? 'busy' : ''}`}>
      <div className="worker-header">
        <span className="worker-id">Worker {String(worker.id).padStart(2, '0')}</span>
        <span className={`worker-status ${busy ? 'busy' : 'idle'}`}>
          <span className="worker-dot" />
          {busy ? 'processing' : 'idle'}
        </span>
      </div>
      <div className="worker-msg">
        {worker.currentMessageId ?? <span className="worker-msg-empty">—</span>}
      </div>
    </div>
  );
}

const lesson: Lesson = {
  slug: 'queues',
  number: '09',
  title: 'Message Queues with Redis',
  summary:
    'Decouple work from requests. Producers push messages onto a Redis list, a pool of workers atomically pops and processes them in parallel.',
  explanation: (
    <>
      <p>
        When a request triggers work that's slow, flaky, or expensive — sending
        email, generating a thumbnail, calling a third-party API — you don't
        want the user waiting. Push a <strong>message</strong> onto a queue,
        return immediately, and let a separate pool of workers drain it.
      </p>
      <p>
        Redis is the simplest production-grade queue you can run. The pattern is
        two commands: <code>LPUSH</code> to enqueue (the producer), and{' '}
        <code>BRPOP</code> to dequeue (the worker). <code>BRPOP</code>{' '}
        blocks until a message is available and pops atomically — Redis
        guarantees that exactly one worker receives each message, no matter
        how many are competing for the list.
      </p>
      <p>
        Below, the Fastify server runs 5 worker loops in parallel, each with its
        own Redis connection (a blocking pop holds the connection, so you can't
        share). Hit <strong>Enqueue</strong> and watch the queue depth drop as
        the workers light up. The dashboard updates over SSE — same pattern as
        Lesson 04, polling Redis every 200ms.
      </p>
      <p>
        <strong>Heads up:</strong> Redis needs to be running. From the repo root:{' '}
        <code>docker compose up -d redis</code>.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
