import { runStream } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `app.get('/api/stream', async (_req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.hijack();

  for (let i = 1; i <= 10; i++) {
    reply.raw.write(\`data: tick \${i}/10\\n\\n\`);
    await new Promise((r) => setTimeout(r, 350));
  }
  reply.raw.write('data: [DONE]\\n\\n');
  reply.raw.end();
});`;

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const run = async () => {
    setBusy(true);
    await runStream('/api/stream', pushLog);
    setBusy(false);
  };
  return (
    <div className="runner-card">
      <span className="method-pill STREAM">SSE</span>
      <span className="path">/api/stream</span>
      <span className="runner-label">
        Watch ticks arrive one at a time over a long-lived connection.
      </span>
      <button className="btn" onClick={run} disabled={busy}>
        Open stream
      </button>
    </div>
  );
}

const lesson: Lesson = {
  slug: 'streaming',
  number: '04',
  title: 'Streaming Responses',
  summary:
    'Send data as it becomes available. Server-Sent Events keep a connection open and push one chunk at a time.',
  explanation: (
    <>
      <p>
        Most APIs return a single payload. But some workloads — long jobs, log
        tails, AI token streams — benefit from sending results as they're ready.
        HTTP has had this capability all along: a single response that the server
        keeps writing to.
      </p>
      <p>
        Server-Sent Events (SSE) is the simplest streaming protocol: a stream of{' '}
        <code>data: ...</code> lines separated by blank lines, with{' '}
        <code>Content-Type: text/event-stream</code>. Fastify lets you bypass its
        normal response handling with <code>reply.hijack()</code> and write
        straight to the raw socket.
      </p>
      <p>
        Open the stream below — the console live-updates as each tick arrives.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
