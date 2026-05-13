import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get('/api/hello', async () => ({
  message: 'Hello from Fastify!',
  timestamp: new Date().toISOString(),
}));

app.get<{ Params: { msg: string } }>('/api/echo/:msg', async (req) => ({
  echo: req.params.msg,
  length: req.params.msg.length,
}));

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

app.get('/api/stream', async (_req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.hijack();

  const ticks = 10;
  for (let i = 1; i <= ticks; i++) {
    reply.raw.write(`data: tick ${i}/${ticks}\n\n`);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  reply.raw.write('data: [DONE]\n\n');
  reply.raw.end();
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '127.0.0.1' });
