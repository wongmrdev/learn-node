import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export const QUEUE_KEY = 'learn-node:jobs';
export const COUNTER_KEY = 'learn-node:counter';
export const WORKER_COUNT = 500;

export type WorkerStatus = 'idle' | 'processing';
export type WorkMode = 'sleep' | 'cpu';

export type WorkerState = {
  id: number;
  status: WorkerStatus;
  currentMessageId: string | null;
  lastFinishedAt: number | null;
};

export type Message = {
  id: string;
  payload: string;
  mode: WorkMode;
  durationMs: number;
  enqueuedAt: number;
};

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

function makeRedis(): Redis {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

// Shared client for commands the routes initiate (enqueue, depth, reset).
export const redis = makeRedis();

// Each worker needs its own connection because BRPOP blocks the connection.
const workers: WorkerState[] = Array.from({ length: WORKER_COUNT }, (_, i) => ({
  id: i + 1,
  status: 'idle',
  currentMessageId: null,
  lastFinishedAt: null,
}));

let processedTotal = 0;

// Rolling throughput: bucketed counts over the last 1 second.
const THROUGHPUT_WINDOW_MS = 1000;
const processedTimestamps: number[] = [];

function recordProcessed(): void {
  processedTotal++;
  const now = Date.now();
  processedTimestamps.push(now);
  const cutoff = now - THROUGHPUT_WINDOW_MS;
  while (processedTimestamps.length > 0 && processedTimestamps[0] < cutoff) {
    processedTimestamps.shift();
  }
}

function currentThroughput(): number {
  const now = Date.now();
  const cutoff = now - THROUGHPUT_WINDOW_MS;
  while (processedTimestamps.length > 0 && processedTimestamps[0] < cutoff) {
    processedTimestamps.shift();
  }
  return processedTimestamps.length;
}

// SLEEP mode: yields to the event loop the whole time. Zero CPU.
async function sleepWork(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// CPU mode: blocks the thread with synchronous sha256 work for ~ms wall-clock.
// Nothing else on the Node thread can make progress while this runs.
function cpuWork(ms: number): void {
  const buf = Buffer.alloc(64, 0);
  const target = Date.now() + ms;
  while (Date.now() < target) {
    for (let i = 0; i < 500; i++) {
      createHash('sha256').update(buf).digest();
    }
  }
}

async function doWork(msg: Message): Promise<void> {
  if (msg.mode === 'cpu') {
    cpuWork(msg.durationMs);
  } else {
    await sleepWork(msg.durationMs);
  }
}

// --- Telemetry: event-loop lag and process CPU%, sampled in the background. ---
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

async function workerLoop(state: WorkerState): Promise<void> {
  const client = makeRedis();
  while (true) {
    try {
      // BRPOP blocks until a message arrives. Timeout 0 = wait forever.
      const result = await client.brpop(QUEUE_KEY, 0);
      if (!result) continue;
      const [, raw] = result;

      let parsed: Partial<Message>;
      try {
        parsed = JSON.parse(raw);
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

      await doWork(msg);

      recordProcessed();
      state.lastFinishedAt = Date.now();
      state.status = 'idle';
      state.currentMessageId = null;
    } catch (err) {
      // If Redis disconnects mid-loop, wait and try again.
      // ioredis will reconnect under the hood.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export function startWorkers(): void {
  for (const w of workers) {
    void workerLoop(w);
  }
}

export async function enqueueMany(
  count: number,
  payload: string,
  mode: WorkMode,
  durationMs: number,
): Promise<number> {
  // Use a pipeline for throughput; chunk to avoid one giant atomic command.
  const CHUNK = 1000;
  let nextSeq = await redis.incrby(COUNTER_KEY, count);
  const startSeq = nextSeq - count + 1;
  let pushed = 0;
  for (let offset = 0; offset < count; offset += CHUNK) {
    const size = Math.min(CHUNK, count - offset);
    const pipeline = redis.pipeline();
    for (let i = 0; i < size; i++) {
      const seq = startSeq + offset + i;
      const msg: Message = {
        id: `msg-${seq}`,
        payload,
        mode,
        durationMs,
        enqueuedAt: Date.now(),
      };
      pipeline.lpush(QUEUE_KEY, JSON.stringify(msg));
    }
    await pipeline.exec();
    pushed += size;
  }
  return pushed;
}

export async function resetQueue(): Promise<void> {
  await redis.del(QUEUE_KEY);
  await redis.set(COUNTER_KEY, 0);
  processedTotal = 0;
  processedTimestamps.length = 0;
  for (const w of workers) {
    if (w.status === 'idle') w.currentMessageId = null;
  }
}

export async function getSnapshot(): Promise<{
  depth: number;
  processed: number;
  throughput: number;
  eventLoopLagMs: number;
  cpuPercent: number;
  workers: WorkerState[];
}> {
  const depth = await redis.llen(QUEUE_KEY);
  return {
    depth,
    processed: processedTotal,
    throughput: currentThroughput(),
    eventLoopLagMs: cachedEventLoopLagMs,
    cpuPercent: cachedCpuPercent,
    workers: workers.map((w) => ({ ...w })),
  };
}
