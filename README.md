# Serverless Personal Knowledge Pipeline

This project runs on Cloudflare Workers to sync Raindrop.io bookmarks, archive readable content, generate AI summaries and embeddings, and publish a daily podcast feed.

## Key Components
- **Cron Ingestion:** Polls Raindrop.io every 30 minutes and pushes new bookmarks to a Cloudflare Queue.
- **Queue Consumer:** Uses Browser Rendering + Readability to extract article content, stores HTML in KV, metadata in D1, vectors in Vectorize, and audio in R2.
- **Frontend:** React + Vite (Shadcn dark theme) served from the `frontend/` folder and built into Worker assets.

## Setup
1. Configure bindings in `wrangler.jsonc` (D1, KV, R2, Queue, Vectorize, AI). Set `migrations_dir` to `./migrations` for Drizzle-generated D1 migrations.
2. Use `schema.sql` for initial setup or `pnpm run drizzle:generate` to create migrations, then `pnpm run drizzle:migrate:remote` to apply them.
3. Set the `RAINDROP_TOKEN` secret in your Worker environment.
4. Copy `.dev.vars.example` to `.dev.vars`, update values, then run `wrangler secret bulk .dev.vars` and `wrangler types`.

## Development
- `npm run lint` runs the TypeScript type-checker.
- `pnpm run drizzle:generate` generates migrations in `./migrations`.
- `pnpm run drizzle:migrate:remote` applies migrations to the remote D1 database.
- `pnpm --filter frontend dev` runs the frontend dev server.
- `pnpm --filter frontend build` builds the frontend to `dist/` for Worker assets.
