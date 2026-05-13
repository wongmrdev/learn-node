# learn-node

A local-only monorepo for teaching Node.js and Fastify concepts through an interactive UI.

## Purpose

Every package, example, and lesson here exists to demonstrate a Node.js or Fastify concept. The UI is the entry point — users explore concepts (routing, streams, hooks, plugins, validation, etc.) by interacting with running examples backed by Fastify services. Keep examples small, isolated, and pedagogically clear over clever.

## Repo shape

- **Monorepo.** Workspaces are managed with pnpm. New code goes into a workspace package under `packages/` (or `apps/` for runnable apps), never at the root.
- **Local-first.** This app is never deployed. No cloud services, no managed databases, no remote APIs as hard dependencies. If something needs to run, it runs on the developer's machine.

## Tooling rules

### Package management
- Use **pnpm** for all installs (`pnpm add`, `pnpm add -D`, `pnpm -F <pkg> add`). Never `npm i` or `yarn`.
- Node 24 is pinned via `.nvmrc`, `.npmrc` (`use-node-version`), and `engines.node` in `package.json`.

### Dependencies
- Prefer **stable, widely-adopted npm packages** — the kind you'd see across the Node OSS ecosystem (Fastify plugins from `@fastify/*`, `zod`, `pino`, `vitest`, `tsx`, `tsup`, etc.).
- Avoid abandoned, pre-1.0 experimental, or single-maintainer-hobby packages unless there's no mainstream alternative.
- When picking between options, favor the one with active maintenance, broad usage, and TypeScript types shipped (or solid `@types/*`).

### TypeScript & modules
- **Everything is typed.** No `any` shortcuts, no untyped JS files in app/library code.
- Prefer packages that ship **their own types**. If a package needs `@types/*`, that's acceptable; if neither exists, prefer a different package.
- **ESM only.** `"type": "module"` in every `package.json`. Use `import`/`export`, not `require`.

### Persistence
- If a feature needs persistence (Postgres, Redis, SQLite-server, etc.), add a **Dockerfile** (or compose service) so it runs locally with one command.
- Keep a `docker-compose.yml` at the root (or per-package as needed) so `docker compose up` brings up the local stack.
- For ephemeral or in-memory examples, prefer no persistence at all — the lesson is the point.

## Current layout

- `apps/api` — Fastify server (`@learn-node/api`). Dev: `tsx watch`. Listens on `127.0.0.1:3000`. All HTTP routes live under `/api/*`.
- `apps/web` — Vite + React 19 UI (`@learn-node/web`). Dev: `vite` on `5173`. Proxies `/api` → `http://localhost:3000` so the browser never hits CORS in dev.
- `packages/*` — shared libraries (none yet).
- `skills/` — reusable patterns/playbooks for agents working in this repo.

## Conventions

- **Route prefix.** API routes are always under `/api/*` so the Vite proxy rule stays a single line.
- **TS runners.** Backend uses `tsx` for dev and `tsc` for typecheck/build. Frontend uses Vite + `tsc -b` for typecheck. No `ts-node`, no Babel.
- **Top-level await** is fine in `apps/api` (NodeNext + ESM).
- **React 19** with the `react-jsx` runtime — no need to import `React` for JSX.
- **ESM imports include the file extension** (`./foo.ts`, `./bar.tsx`). The API is NodeNext, the UI uses `allowImportingTsExtensions`. Don't drop the extension.

## Lesson pattern

The UI is a lesson catalog. To add a new lesson:

1. **Add the route** in [apps/api/src/server.ts](apps/api/src/server.ts) under `/api/...`. Keep it small — one concept per route. Use Fastify's schema option for any input validation.
2. **Create a lesson file** at `apps/web/src/lessons/NN-slug.tsx`. Default-export a `Lesson` (see [apps/web/src/lessons/types.ts](apps/web/src/lessons/types.ts)) with: `slug`, `number`, `title`, `summary`, `explanation` (JSX), `code` (string of the server snippet), `Interactive` (a React component that takes `LessonInteractiveProps`).
3. **Register it** in [apps/web/src/lessons/index.ts](apps/web/src/lessons/index.ts).
4. The `Interactive` component calls `runRequest` / `runStream` from `src/lib/runner.ts`, which pushes structured `LogEntry` rows into the shared request console — never `fetch` directly from a lesson.
5. If a lesson needs custom request headers (auth, content negotiation), pass them via the `headers` option on `runRequest` — don't bypass the runner.

### Server-side patterns the lessons rely on

- **Per-request typed state**: use `app.decorateRequest('foo', default)` plus `declare module 'fastify' { interface FastifyRequest { foo: T } }` to attach typed properties from a hook. See the `traceId` pattern in [apps/api/src/server.ts](apps/api/src/server.ts).
- **Encapsulation**: plugins registered with `app.register(plugin, { prefix })` get their own scope — hooks/decorators inside don't leak out. Use this for auth boundaries.
- **Errors**: throw custom error classes with `statusCode` and `errorCode` fields; route them in `setErrorHandler`. Don't `reply.code(...).send(...)` directly inside handlers — keep the error shape in one place.

### Visual system

Design tokens live in [apps/web/src/styles.css](apps/web/src/styles.css) under `:root`. Stay on the existing tokens (`--accent`, `--accent-2`, `--surface`, etc.) instead of hard-coding colors. The grid background, glow pulses, and live cursor are part of the look — don't strip them when adding components.

## Working in this repo

### When adding a new concept/lesson
1. Create a workspace package under `packages/` or `apps/`.
2. Keep its surface area minimal — one concept per package where possible.
3. Wire it into the UI so a user can run and observe it.
4. **Update this file (or `skills/`) if the change introduces a new pattern or design decision.**

### Keeping docs in sync
This file (`CLAUDE.md` / `AGENTS.md`) and the `skills/` directory are the source of truth for *how* we build here. **Upsert** them whenever:
- A new convention is introduced (e.g. "we use Zod for all route schemas").
- An existing pattern changes.
- A non-obvious design decision is made (write down the *why*).

Don't let drift accumulate — if you notice this file is stale while working on a task, fix it as part of the task.
