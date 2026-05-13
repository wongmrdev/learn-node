import { runRequest } from '../lib/runner.ts';
import type { LessonInteractiveProps } from '../lib/types.ts';
import type { Lesson } from './types.ts';

const code = `const adminPlugin: FastifyPluginAsync = async (instance) => {
  // This hook is scoped to the plugin — it does NOT run for routes
  // registered on the outer app.
  instance.addHook('onRequest', async (req, reply) => {
    if (req.headers['x-admin-key'] !== 'secret') {
      return reply.code(401).send({ error: 'Missing or invalid x-admin-key' });
    }
  });

  instance.get('/stats', async () => ({
    uptimeSeconds: Math.floor(process.uptime()),
    pid: process.pid,
    node: process.version,
  }));
};

await app.register(adminPlugin, { prefix: '/api/admin' });`;

function Interactive({ pushLog, busy, setBusy }: LessonInteractiveProps) {
  const runNoKey = async () => {
    setBusy(true);
    await runRequest('GET', '/api/admin/stats', undefined, pushLog);
    setBusy(false);
  };
  const runWithKey = async () => {
    setBusy(true);
    await runRequest('GET', '/api/admin/stats', undefined, pushLog, {
      headers: { 'x-admin-key': 'secret' },
    });
    setBusy(false);
  };
  return (
    <>
      <div className="runner-card">
        <span className="method-pill">GET</span>
        <span className="path">/api/admin/stats</span>
        <span className="runner-label">
          Without the header — the plugin's hook rejects with 401.
        </span>
        <button className="btn magenta" onClick={runNoKey} disabled={busy}>
          Send without key
        </button>
      </div>
      <div className="runner-card">
        <span className="method-pill">GET</span>
        <span className="path">/api/admin/stats</span>
        <span className="runner-label">
          With <code>x-admin-key: secret</code> — the same route now succeeds.
        </span>
        <button className="btn" onClick={runWithKey} disabled={busy}>
          Send with key
        </button>
      </div>
    </>
  );
}

const lesson: Lesson = {
  slug: 'plugins',
  number: '07',
  title: 'Plugins & Encapsulation',
  summary:
    'Plugins are the Fastify unit of modularity. Each register call creates an isolated scope — hooks, decorators, and schemas only apply inside it.',
  explanation: (
    <>
      <p>
        A Fastify plugin is just an async function that takes a scoped{' '}
        <code>instance</code>. When you <code>register</code> it, Fastify creates
        a fresh scope: hooks added inside the plugin only run for routes
        registered inside it.
      </p>
      <p>
        This is how you build auth boundaries, versioned APIs, feature flags —
        without leaking middleware into routes that shouldn't care. The admin
        plugin below adds an <code>onRequest</code> guard that rejects requests
        missing <code>x-admin-key</code>. Every other route in the app is
        completely unaffected.
      </p>
      <p>
        (If you ever need to break encapsulation — share state across plugins —
        wrap your plugin with the <code>fastify-plugin</code> npm package.
        That's a different lesson.)
      </p>
    </>
  ),
  code,
  Interactive,
};

export default lesson;
