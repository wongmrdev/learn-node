import { useEffect, useState } from 'react';

type HelloResponse = { message: string };

export function App() {
  const [message, setMessage] = useState<string>('loading...');

  useEffect(() => {
    fetch('/api/hello')
      .then((r) => r.json() as Promise<HelloResponse>)
      .then((d) => setMessage(d.message))
      .catch((e: unknown) => setMessage(`error: ${String(e)}`));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>learn-node</h1>
      <p>
        API says: <strong>{message}</strong>
      </p>
    </main>
  );
}
