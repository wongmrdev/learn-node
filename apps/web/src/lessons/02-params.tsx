import { useState } from 'react';
import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `app.get<{ Params: { msg: string } }>(
  '/api/echo/:msg',
  async (req) => ({
    echo: req.params.msg,
    length: req.params.msg.length,
  }),
);`;

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const [value, setValue] = useState('hello-world');
  const run = async () => {
    setBusy(true);
    await runRequest('GET', `/api/echo/${encodeURIComponent(value)}`, undefined, pushLog);
    setBusy(false);
  };
  return (
    <div className="runner-card">
      <span className="method-pill">GET</span>
      <span className="path">/api/echo/:msg</span>
      <input
        className="input text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="msg"
      />
      <button className="btn" onClick={run} disabled={busy || !value}>
        Execute
      </button>
    </div>
  );
}

const lesson: Lesson = {
  slug: 'params',
  number: '02',
  title: 'Route Parameters',
  summary:
    'Anything after a colon in the path becomes a parameter, available on req.params with full TypeScript inference.',
  explanation: (
    <>
      <p>
        Use parameters to identify <em>which</em> resource — a user id, a post slug, a
        message to echo. Fastify pulls them out of the URL and hands them to your
        handler as <code>req.params</code>.
      </p>
      <p>
        Two things to remember: parameters always arrive as <strong>strings</strong>{' '}
        (cast them yourself if you expect a number), and they're meant for
        identifiers, not filters or input — use the query string or request body for
        those.
      </p>
      <p>
        Change the value in the input below and watch the URL — and the response —
        change with it.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
