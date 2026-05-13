import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `app.get('/api/hello', async () => ({
  message: 'Hello from Fastify!',
  timestamp: new Date().toISOString(),
}));`;

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const run = async () => {
    setBusy(true);
    await runRequest('GET', '/api/hello', undefined, pushLog);
    setBusy(false);
  };
  return (
    <div className="runner-card">
      <span className="method-pill">GET</span>
      <span className="path">/api/hello</span>
      <span className="runner-label">Fire the route and see the JSON come back.</span>
      <button className="btn" onClick={run} disabled={busy}>
        Execute
      </button>
    </div>
  );
}

const lesson: Lesson = {
  slug: 'routes',
  number: '01',
  title: 'Your First Route',
  summary:
    'A Fastify route is a function bound to a URL. Return a value, and Fastify serializes it to JSON for you.',
  explanation: (
    <>
      <p>
        At its core, an HTTP API is a set of functions sitting behind URLs. In Fastify
        you wire one up with <code>app.get(path, handler)</code> — there is no
        controller class, no decorator, no framework ritual.
      </p>
      <p>
        Whatever the handler returns becomes the response body. Return an object and
        Fastify serializes it to JSON and sets the right <code>Content-Type</code>{' '}
        header. Return a string and you get <code>text/plain</code>. The framework
        gets out of your way.
      </p>
      <p>
        Hit Execute and watch the request travel through the Vite dev proxy
        (port <code>5173</code>) to the Fastify server (port <code>3000</code>) and back.
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
