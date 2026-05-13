import { Redis } from 'ioredis';
import { monitorEventLoopDelay } from 'node:perf_hooks';

export const QUEUE_KEY = 'learn-node:jobs';
export const COUNTER_KEY = 'learn-node:counter';
export const PROCESSED_KEY = 'learn-node:processed';
export const WORKERS_KEY = 'learn-node:workers';
export const PROCESSES_KEY = 'learn-node:processes';

export type WorkMode = 'sleep' | 'cpu';

export type Message = {
  id: string;
  payload: string;
  mode: WorkMode;
  durationMs: number;
  enqueuedAt: number;
};

export type WorkerState = {
  id: string;
  processId: string;
  status: 'idle' | 'processing';
  currentMessageId: string | null;
  lastSeenAt: number;
};

export type ProcessStats = {
  processId: string;
  cpuPercent: number;
  eventLoopLagMs: number;
  concurrency: number;
  startedAt: number;
  lastSeenAt: number;
};

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
export const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// --- API process telemetry (separate from worker telemetry) ---
const elHist = monitorEventLoopDelay({ resolution: 10 });
elHist.enable();

let apiEventLoopLagMs = 0;
setInterval(() => {
  apiEventLoopLagMs = elHist.percentile(99) / 1e6;
  elHist.reset();
}, 1000);

let apiCpuPercent = 0;
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
    apiCpuPercent = Math.min(100 * (cpuMs / wallElapsedMs), 999);
  }
}, 500);

// --- Throughput: sampled deltas of the shared PROCESSED counter ---
type Sample = { ts: number; processed: number };
const samples: Sample[] = [];

function recordSample(processed: number): void {
  const now = Date.now();
  samples.push({ ts: now, processed });
  const cutoff = now - 2000;
  while (samples.length > 0 && samples[0].ts < cutoff) samples.shift();
}

function throughput(processed: number): number {
  const now = Date.now();
  const targetTs = now - 1000;
  let baseline: Sample | undefined;
  for (const s of samples) {
    if (s.ts >= targetTs) break;
    baseline = s;
  }
  if (!baseline) return 0;
  return Math.max(0, processed - baseline.processed);
}

// --- Producer ---
export async function enqueueMany(
  count: number,
  payload: string,
  mode: WorkMode,
  durationMs: number,
): Promise<number> {
  const CHUNK = 1000;
  const nextSeq = await redis.incrby(COUNTER_KEY, count);
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
  await Promise.all([
    redis.del(QUEUE_KEY),
    redis.set(COUNTER_KEY, 0),
    redis.set(PROCESSED_KEY, 0),
  ]);
  samples.length = 0;
}

// --- Snapshot: aggregates state from Redis (workers may be remote) ---
const STALE_AFTER_MS = 3000;

export async function getSnapshot(): Promise<{
  depth: number;
  processed: number;
  throughput: number;
  apiEventLoopLagMs: number;
  apiCpuPercent: number;
  workers: WorkerState[];
  processes: ProcessStats[];
}> {
  const [depthStr, processedStr, workersRaw, processesRaw] = await Promise.all([
    redis.llen(QUEUE_KEY).then((n) => String(n)),
    redis.get(PROCESSED_KEY).then((v) => v ?? '0'),
    redis.hgetall(WORKERS_KEY),
    redis.hgetall(PROCESSES_KEY),
  ]);

  const depth = Number(depthStr);
  const processed = Number(processedStr);
  recordSample(processed);

  const now = Date.now();
  const cutoff = now - STALE_AFTER_MS;

  const workers: WorkerState[] = [];
  const staleWorkerIds: string[] = [];
  for (const [id, json] of Object.entries(workersRaw)) {
    try {
      const w = JSON.parse(json) as WorkerState;
      if (w.lastSeenAt < cutoff) staleWorkerIds.push(id);
      else workers.push(w);
    } catch {
      staleWorkerIds.push(id);
    }
  }

  const processes: ProcessStats[] = [];
  const staleProcessIds: string[] = [];
  for (const [id, json] of Object.entries(processesRaw)) {
    try {
      const p = JSON.parse(json) as ProcessStats;
      if (p.lastSeenAt < cutoff) staleProcessIds.push(id);
      else processes.push(p);
    } catch {
      staleProcessIds.push(id);
    }
  }

  if (staleWorkerIds.length > 0) {
    void redis.hdel(WORKERS_KEY, ...staleWorkerIds);
  }
  if (staleProcessIds.length > 0) {
    void redis.hdel(PROCESSES_KEY, ...staleProcessIds);
  }

  workers.sort((a, b) => a.id.localeCompare(b.id));
  processes.sort((a, b) => a.processId.localeCompare(b.processId));

  return {
    depth,
    processed,
    throughput: throughput(processed),
    apiEventLoopLagMs,
    apiCpuPercent,
    workers,
    processes,
  };
}
