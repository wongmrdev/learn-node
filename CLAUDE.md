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
