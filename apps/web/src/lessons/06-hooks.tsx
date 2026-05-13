import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `declare module 'fastify' {
  interface FastifyRequest {
    traceId: string;
  }
}

app.decorateRequest('traceId', '');

app.addHook('onRequest', async (req) => {
  req.traceId = crypto.randomUUID();
});

app.get('/api/whoami', async (req) => ({
  traceId: req.traceId,
  method: req.method,
  ip: req.ip,
  userAgent: req.headers['user-agent'] ?? null,
}));`;

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const run = async () => {
    setBusy(true);
    await runRequest('GET', '/api/whoami', undefined, pushLog);
    setBusy(false);
  };
  return (
    <div className="runner-card">
      <span className="method-pill">GET</span>
      <span className="path">/api/whoami</span>
      <span className="runner-label">
        Fire it twice — the <code>traceId</code> is fresh on every request.
      </span>
      <button className="btn" onClick={run} disabled={busy}>
        Inspect request
      </button>
    </div>
  );
}

const lesson: Lesson = {
  slug: 'hooks',
  number: '06',
  title: 'Lifecycle Hooks',
  summary:
    'Fastify lets you inject logic at fixed points in the request lifecycle — auth, logging, tracing — without polluting handlers.',
  explanation: (
    <>
      <p>
        A handler doesn't have to do everything itself. Fastify exposes the
        request lifecycle as a series of <strong>hooks</strong>:{' '}
        <code>onRequest</code>, <code>preParsing</code>,{' '}
        <code>preValidation</code>, <code>preHandler</code>,{' '}
        <code>onResponse</code>, and more. Each runs at a fixed point, and you
        can attach as many as you want.
      </p>
      <p>
        Combine hooks with <code>decorateRequest</code> to attach typed,
        per-request state — a trace id, the current user, a request timer.
        Handlers downstream read it as if it were always there. Module
        augmentation makes it type-safe.
      </p>
      <p>
        Below, an <code>onRequest</code> hook stamps every request with a fresh
        UUID. Fire it a few times and watch the <code>traceId</code> change.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
