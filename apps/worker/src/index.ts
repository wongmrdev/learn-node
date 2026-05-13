import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? '10');

const PROCESS_ID = `${hostname()}.${process.pid}`;

const QUEUE_KEY = 'learn-node:jobs';
const PROCESSED_KEY = 'learn-node:processed';
const WORKERS_KEY = 'learn-node:workers';
const PROCESSES_KEY = 'learn-node:processes';

type WorkMode = 'sleep' | 'cpu';

type Message = {
  id: string;
  payload: string;
  mode: WorkMode;
  durationMs: number;
  enqueuedAt: number;
};

type WorkerState = {
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

const stateRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

async function publishWorker(state: WorkerState): Promise<void> {
  state.lastSeenAt = Date.now();
  await stateRedis.hset(WORKERS_KEY, state.id, JSON.stringify(state));
}

function cpuWork(ms: number): void {
  const buf = Buffer.alloc(64, 0);
  const target = Date.now() + ms;
  while (Date.now() < target) {
    for (let i = 0; i < 500; i++) {
      createHash('sha256').update(buf).digest();
    }
  }
}

async function sleepWork(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const workerStates: WorkerState[] = [];

async function workerLoop(slotId: number): Promise<void> {
  const client = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const state: WorkerState = {
    id: `${PROCESS_ID}.${slotId}`,
    processId: PROCESS_ID,
    status: 'idle',
    currentMessageId: null,
    lastSeenAt: Date.now(),
  };
  workerStates.push(state);
  await publishWorker(state);

  while (true) {
    try {
      const result = await client.brpop(QUEUE_KEY, 0);
      if (!result) continue;
      let parsed: Partial<Message>;
      try {
        parsed = JSON.parse(result[1]);
      } catch {
        continue;
      }
      const msg: Message = {
        id: parsed.id ?? 'unknown',
        payload: parsed.payload ?? '',
        mode: parsed.mode === 'cpu' ? 'cpu' : 'sleep',
        durationMs: typeof parsed.durationMs === 'number' ? parsed.durationMs : 20,
        enqueuedAt: parsed.enqueuedAt ?? Date.now(),
      };

      state.status = 'processing';
      state.currentMessageId = msg.id;
      await publishWorker(state);

      if (msg.mode === 'cpu') cpuWork(msg.durationMs);
      else await sleepWork(msg.durationMs);

      state.status = 'idle';
      state.currentMessageId = null;
      await publishWorker(state);
      await stateRedis.incr(PROCESSED_KEY);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

// --- Process telemetry: CPU% and event-loop lag, published once per second ---
const elHist = monitorEventLoopDelay({ resolution: 10 });
elHist.enable();

let cachedEventLoopLagMs = 0;
setInterval(() => {
  cachedEventLoopLagMs = elHist.percentile(99) / 1e6;
  elHist.reset();
}, 1000);

let cachedCpuPercent = 0;
let prevCpu = process.cpuUsage();
let prevWallMs = Date.now();
setInterval(() => {
  const wallNow = Date.now();
  const delta = process.cpuUsage(prevCpu);
  const wallElapsedMs = wallNow - prevWallMs;
  prevCpu = process.cpuUsage();
  prevWallMs = wallNow;
  if (wallElapsedMs > 0) {
    const cpuMs = (delta.user + delta.system) / 1000;
    cachedCpuPercent = Math.min(100 * (cpuMs / wallElapsedMs), 999);
  }
}, 500);

const startedAt = Date.now();
setInterval(async () => {
  // Heartbeat the per-worker states so idle workers don't expire.
  const now = Date.now();
  const pipeline = stateRedis.pipeline();
  for (const state of workerStates) {
    state.lastSeenAt = now;
    pipeline.hset(WORKERS_KEY, state.id, JSON.stringify(state));
  }
  // Publish this process's aggregated stats.
  const stats: ProcessStats = {
    processId: PROCESS_ID,
    cpuPercent: cachedCpuPercent,
    eventLoopLagMs: cachedEventLoopLagMs,
    concurrency: CONCURRENCY,
    startedAt,
    lastSeenAt: now,
  };
  pipeline.hset(PROCESSES_KEY, PROCESS_ID, JSON.stringify(stats));
  await pipeline.exec();
}, 1000);

// --- Graceful shutdown: deregister ourselves from the state registry ---
async function shutdown(): Promise<void> {
  console.log(`[${PROCESS_ID}] shutting down`);
  const pipeline = stateRedis.pipeline();
  for (const state of workerStates) {
    pipeline.hdel(WORKERS_KEY, state.id);
  }
  pipeline.hdel(PROCESSES_KEY, PROCESS_ID);
  await pipeline.exec();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`[${PROCESS_ID}] starting ${CONCURRENCY} worker slot(s), redis=${REDIS_URL}`);
for (let i = 0; i < CONCURRENCY; i++) {
  void workerLoop(i);
}
