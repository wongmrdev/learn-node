import { useState } from 'react';
import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `app.get<{ Querystring: { q?: string; limit?: number } }>(
  '/api/search',
  {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
  },
  async (req) => {
    const q = (req.query.q ?? '').toLowerCase();
    const limit = req.query.limit ?? 5;
    const filtered = q ? CATALOG.filter((i) => i.includes(q)) : CATALOG;
    return { q, limit, results: filtered.slice(0, limit) };
  },
);`;

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const [q, setQ] = useState('t');
  const [limit, setLimit] = useState('3');

  const run = async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (limit) params.set('limit', limit);
    setBusy(true);
    await runRequest('GET', `/api/search?${params}`, undefined, pushLog);
    setBusy(false);
  };

  return (
    <div className="runner-card">
      <span className="method-pill">GET</span>
      <span className="path">/api/search</span>
      <input
        className="input text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="q"
      />
      <input
        className="input"
        type="number"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        min={1}
        max={50}
      />
      <button className="btn" onClick={run} disabled={busy}>
        Search
      </button>
    </div>
  );
}

const lesson: Lesson = {
  slug: 'query',
  number: '05',
  title: 'Query Strings',
  summary:
    'Query strings carry the "how" of a request — filters, pagination, sort. Schema-typed, just like the body.',
  explanation: (
    <>
      <p>
        Use route parameters to identify <em>what</em>, and query strings to
        describe <em>how</em> to return it. Fastify exposes the parsed query as{' '}
        <code>req.query</code>.
      </p>
      <p>
        Like the body, the query string can carry a schema. Set the type to{' '}
        <code>integer</code> and Fastify will coerce <code>?limit=3</code> from
        the URL string into a real number for you — and reject{' '}
        <code>?limit=abc</code> with a 400.
      </p>
      <p>Try searching with a short term, then crank the limit up to 12.</p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
