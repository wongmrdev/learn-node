import { useState } from 'react';
import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `app.post<{ Body: { a: number; b: number } }>(
  '/api/sum',
  {
    schema: {
      body: {
        type: 'object',
        required: ['a', 'b'],
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
        },
        additionalProperties: false,
      },
    },
  },
  async (req) => ({
    a: req.body.a,
    b: req.body.b,
    sum: req.body.a + req.body.b,
  }),
);`;

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const [a, setA] = useState('2');
  const [b, setB] = useState('40');

  const runValid = async () => {
    setBusy(true);
    await runRequest('POST', '/api/sum', { a: Number(a), b: Number(b) }, pushLog);
    setBusy(false);
  };
  const runInvalid = async () => {
    setBusy(true);
    await runRequest('POST', '/api/sum', { a: 'two', b: 40 }, pushLog);
    setBusy(false);
  };

  return (
    <>
      <div className="runner-card">
        <span className="method-pill POST">POST</span>
        <span className="path">/api/sum</span>
        <input
          className="input"
          type="number"
          value={a}
          onChange={(e) => setA(e.target.value)}
        />
        <span className="runner-label" style={{ flex: 'none' }}>
          +
        </span>
        <input
          className="input"
          type="number"
          value={b}
          onChange={(e) => setB(e.target.value)}
        />
        <button className="btn" onClick={runValid} disabled={busy}>
          Send valid
        </button>
      </div>
      <div className="runner-card">
        <span className="method-pill POST">POST</span>
        <span className="path">/api/sum</span>
        <span className="runner-label">
          Try a bad body: <code>{`{ a: 'two', b: 40 }`}</code>. The schema rejects it
          with 400.
        </span>
        <button className="btn magenta" onClick={runInvalid} disabled={busy}>
          Send invalid
        </button>
      </div>
    </>
  );
}

const lesson: Lesson = {
  slug: 'validation',
  number: '03',
  title: 'Body Validation',
  summary:
    'Never trust input. Attach a JSON schema and Fastify rejects malformed requests before your handler runs.',
  explanation: (
    <>
      <p>
        Every public route is an attack surface. Fastify treats validation as a
        first-class concern: attach a <code>schema</code> to the route and the
        framework validates the body, params, query, and headers <em>before</em>{' '}
        your handler ever sees them.
      </p>
      <p>
        If the request doesn't match, the client gets a structured <code>400</code>{' '}
        with a clear error message — and your handler stays simple, because the
        types are already guaranteed. Two birds, one schema.
      </p>
      <p>
        Try sending a valid pair, then send the deliberately broken one and watch
        the validator do its job.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
