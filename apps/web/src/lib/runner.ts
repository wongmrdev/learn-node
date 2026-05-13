import type { LogEntry, LogPusher } from './types.ts';

function nowTime(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function tryFormatJSON(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export async function runRequest(
  method: 'GET' | 'POST',
  path: string,
  body: unknown,
  push: LogPusher,
): Promise<void> {
  const id = newId();
  const ts = nowTime();
  const base: LogEntry = {
    id,
    ts,
    method,
    path,
    statusCode: null,
    status: 'pending',
    body: '',
    live: true,
  };
  push(base);
  try {
    const res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    push({
      ...base,
      statusCode: res.status,
      status: res.ok ? 'ok' : 'err',
      body: tryFormatJSON(text),
      live: false,
    });
  } catch (err) {
    push({
      ...base,
      status: 'err',
      error: err instanceof Error ? err.message : String(err),
      live: false,
    });
  }
}

export async function runStream(path: string, push: LogPusher): Promise<void> {
  const id = newId();
  const ts = nowTime();
  const base: LogEntry = {
    id,
    ts,
    method: 'STREAM',
    path,
    statusCode: null,
    status: 'pending',
    body: 'connecting...',
    live: true,
  };
  push(base);
  try {
    const res = await fetch(path);
    if (!res.body) throw new Error('no response body');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    let output = '';
    push({ ...base, statusCode: res.status, body: '' });

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk.split('\n').find((l) => l.startsWith('data: '));
        if (line) output += line.slice(6) + '\n';
      }
      push({ ...base, statusCode: res.status, body: output, live: true });
    }
    push({
      ...base,
      statusCode: res.status,
      status: res.ok ? 'ok' : 'err',
      body: output,
      live: false,
    });
  } catch (err) {
    push({
      ...base,
      status: 'err',
      error: err instanceof Error ? err.message : String(err),
      live: false,
    });
  }
}
