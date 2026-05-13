# learn-node

## Run locally

### Prerequisites

- Node.js 24 (pinned via `.nvmrc`)
- [pnpm](https://pnpm.io/) 10
- Docker (for Redis and the worker containers)

### Install

```bash
pnpm install
```

### Start the stack

Open four terminals from the repo root.

**1. Redis** (required for lessons 09+):

```bash
docker compose up -d redis
```

**2. Workers** (required for lessons 09+):

```bash
docker compose up -d --scale worker=4
```

> Or run a single worker outside Docker: `pnpm -F @learn-node/worker dev`

**3. API** (`http://localhost:3000`):

```bash
pnpm -F @learn-node/api dev
```

**4. Web UI** (`http://localhost:5173`):

```bash
pnpm -F @learn-node/web dev
```

Open <http://localhost:5173> in your browser.

### Stop the stack

```bash
docker compose down
```

(Stop the API and Web processes with `Ctrl+C`.)
