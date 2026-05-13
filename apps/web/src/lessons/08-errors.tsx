import { useState } from 'react';
import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly errorCode = 'RESOURCE_NOT_FOUND';
}

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof NotFoundError) {
    return reply.code(err.statusCode).send({
      error: err.message,
      code: err.errorCode,
    });
  }
  reply.send(err);
});

app.get<{ Params: { id: string } }>('/api/users/:id', async (req) => {
  const user = USERS[req.params.id];
  if (!user) throw new NotFoundError(\`No user with id "\${req.params.id}"\`);
  return user;
});`;

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const [id, setId] = useState('1');

  const run = async (target: string) => {
    setBusy(true);
    await runRequest('GET', `/api/users/${encodeURIComponent(target)}`, undefined, pushLog);
    setBusy(false);
  };

  return (
    <>
      <div className="runner-card">
        <span className="method-pill">GET</span>
        <span className="path">/api/users/:id</span>
        <input
          className="input"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <button className="btn" onClick={() => run(id)} disabled={busy || !id}>
          Lookup
        </button>
      </div>
      <div className="runner-card">
        <span className="runner-label">
          Quick try: only <code>1</code> and <code>2</code> exist. Anything else
          throws <code>NotFoundError</code>.
        </span>
        <button className="btn" onClick={() => run('1')} disabled={busy}>
          Get 1
        </button>
        <button className="btn" onClick={() => run('2')} disabled={busy}>
          Get 2
        </button>
        <button className="btn magenta" onClick={() => run('999')} disabled={busy}>
          Trigger 404
        </button>
      </div>
    </>
  );
}

const lesson: Lesson = {
  slug: 'errors',
  number: '08',
  title: 'Error Handling',
  summary:
    'Throw structured errors from anywhere. A single error handler turns them into clean, consistent HTTP responses.',
  explanation: (
    <>
      <p>
        Error handling in Fastify follows a simple rule: <strong>throw</strong>{' '}
        anywhere, and a single <code>setErrorHandler</code> decides what the
        client sees. Routes stay focused on the happy path; the error shape
        lives in one place.
      </p>
      <p>
        Custom error classes carry the status code and machine-readable code
        with them. <code>instanceof</code> in the handler dispatches to the
        right response. Anything you don't recognize falls through to Fastify's
        default 500.
      </p>
      <p>
        Validation errors from Lesson 03 flow through this same handler — try
        sending an invalid body again and you'll see the structured 400.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
