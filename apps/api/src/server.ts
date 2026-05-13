import Fastify, { type FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';

declare module 'fastify' {
  interface FastifyRequest {
    traceId: string;
  }
}

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Global hook (Lesson 06): tag every request with a trace id.
app.decorateRequest('traceId', '');
app.addHook('onRequest', async (req) => {
  req.traceId = crypto.randomUUID();
});

// Custom error (Lesson 08).
class NotFoundError extends Error {
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

// 01: hello
app.get('/api/hello', async () => ({
  message: 'Hello from Fastify!',
  timestamp: new Date().toISOString(),
}));

// 02: params
app.get<{ Params: { msg: string } }>('/api/echo/:msg', async (req) => ({
  echo: req.params.msg,
  length: req.params.msg.length,
}));

// 03: body validation
app.post<{ Body: { a: number; b: number } }>(
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
);

// 04: streaming
app.get('/api/stream', async (_req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.hijack();

  const ticks = 100;
  for (let i = 1; i <= ticks; i++) {
    reply.raw.write(`data: tick ${i}/${ticks}\n\n`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  reply.raw.write('data: [DONE]\n\n');
  reply.raw.end();
});

// 05: query strings
const CATALOG = [
  'fastify', 'pino', 'zod', 'vite', 'react', 'tsx',
  'node', 'pnpm', 'typescript', 'eslint', 'vitest', 'esbuild',
];

app.get<{ Querystring: { q?: string; limit?: number } }>(
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
);

// 06: hooks — whoami uses the trace id attached by the global onRequest hook
app.get('/api/whoami', async (req) => ({
  traceId: req.traceId,
  method: req.method,
  ip: req.ip,
  userAgent: req.headers['user-agent'] ?? null,
}));

// 07: plugins — encapsulated admin scope guarded by a header check
const adminPlugin: FastifyPluginAsync = async (instance) => {
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

await app.register(adminPlugin, { prefix: '/api/admin' });

// 08: error handling
const USERS: Record<string, { id: string; name: string }> = {
  '1': { id: '1', name: 'Ada Lovelace' },
  '2': { id: '2', name: 'Alan Turing' },
};

app.get<{ Params: { id: string } }>('/api/users/:id', async (req) => {
  const user = USERS[req.params.id];
  if (!user) throw new NotFoundError(`No user with id "${req.params.id}"`);
  return user;
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '127.0.0.1' });
