import { Redis } from 'ioredis';

export const QUEUE_KEY = 'learn-node:jobs';
export const COUNTER_KEY = 'learn-node:counter';
export const WORKER_COUNT = 5;

export type WorkerStatus = 'idle' | 'processing';

export type WorkerState = {
  id: number;
  status: WorkerStatus;
  currentMessageId: string | null;
  lastFinishedAt: number | null;
};

export type Message = {
  id: string;
  payload: string;
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

async function simulateWork(): Promise<void> {
  // 5-50ms of "work" per message.
  const ms = 5 + Math.floor(Math.random() * 45);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function workerLoop(state: WorkerState): Promise<void> {
  const client = makeRedis();
  while (true) {
    try {
      // BRPOP blocks until a message arrives. Timeout 0 = wait forever.
      const result = await client.brpop(QUEUE_KEY, 0);
      if (!result) continue;
      const [, raw] = result;

      let msg: Message;
      try {
        msg = JSON.parse(raw) as Message;
      } catch {
        continue;
      }

      state.status = 'processing';
      state.currentMessageId = msg.id;

      await simulateWork();

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

export async function enqueueMany(count: number, payload: string): Promise<number> {
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
  workers: WorkerState[];
}> {
  const depth = await redis.llen(QUEUE_KEY);
  return {
    depth,
    processed: processedTotal,
    throughput: currentThroughput(),
    workers: workers.map((w) => ({ ...w })),
  };
}
