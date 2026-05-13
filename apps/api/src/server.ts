import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get('/api/hello', async () => {
  return { message: 'Hello from Fastify!' };
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '127.0.0.1' });
