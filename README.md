# free-llm-api

One OpenAI-style API in front of several **free** LLMs. It scores each coding
prompt's complexity, routes it to the best provider, and automatically fails
over to the next provider in the stack when a rate limit is hit — all behind a
single `/v1/chat/completions` endpoint.

```
                 ┌────────────────────────────────────────────┐
  OpenAI client  │  complexity scorer → weighted selection →   │
  ───────────►   │  dispatcher (rate-limit failover)           │
   /v1/chat/...  └───────┬───────┬────────┬──────────┬─────────┘
                         ▼       ▼        ▼          ▼
                      Gemini  DeepSeek  Mistral   OpenRouter   ──► Local Qwen
                     (complex) (2nd)   (simple)   (simple)      (fallback only)
```

## How routing works

1. **Complexity score (0..1)** — a fast local heuristic (`src/router/complexity.ts`)
   from prompt length, token estimate, code blocks, file mentions, turn count
   and refactor/architecture keywords (minus "typo/rename/simple" language).
   A caller can override it with a `complexity` field on the request.
2. **Weighted selection** — each provider has `score = weight + complexity * complexityWeight`
   (`src/router/selectProvider.ts`). This makes **Gemini** win on complex
   refactors, **DeepSeek** second, and **Mistral/OpenRouter** win on simple
   edits. All weights are env-tunable.
3. **Rate-limit failover** — the dispatcher (`src/core/dispatcher.ts`) tries
   providers in order. A `429` (or `402/403`) cools that provider down
   (respecting `Retry-After`) via the in-memory tracker and moves to the next.
   Because a rate limit arrives as an HTTP status *before* any body, this works
   for streaming too — no partial output is ever sent to the wrong provider.
4. **Local last** — the local Qwen Coder (llama.cpp) is only used once **every**
   remote is rate-limited.

## Quick start

```bash
npm install
cp .env.example .env      # add provider keys + PWA_EMAIL / PWA_PASS / JWT_SECRET

# build the PWA (served by the gateway)
npm --prefix web install
npm --prefix web run build

npm run dev               # or: npm run build && npm start
```

Then open `http://<gateway-host>:8787` on your phone and log in. Any provider
without an API key is auto-disabled and skipped by the router, so you can start
with just one key.

## Auth (JWT)

The gateway has a single user. `POST /auth/login` checks `email === PWA_EMAIL`
and `password === base64.decode(PWA_PASS)` and returns a long-lived JWT. That
JWT is then **required on every API call** (`Authorization: Bearer <jwt>`). The
PWA stores it in `localStorage`, so the session persists.

Encode your password once:

```bash
node -e "console.log(require('base-64').encode('your-password'))"   # -> PWA_PASS
```

## The PWA

An installable React app (Vite + Tailwind + shadcn/ui) lives in `web/` and is
served by the gateway. It's a mobile-first chat with a Miami-sunset dark theme;
each assistant reply carries a small footnote naming the provider/model that
served it (from the `X-LLM-Provider` header). Build it with
`npm --prefix web run build`; in dev, `npm --prefix web run dev` proxies the API
to the gateway on `:8787`.

## Sharing context with Claude

Use Claude for the heavy tasks and this API for the lighter ones — and let Claude
see what you offloaded. In the PWA's settings, pick a folder **on the gateway
machine** (the folder picker is server-side, since the phone's browser can't
reach that filesystem). The gateway then writes every interaction into
`<folder>/llm-context/`:

- `HISTORY.md` — the most recent prompts/replies, human- and Claude-readable
- `history.jsonl` — append-only durable log

Point that at a repo Claude works in and it picks up the recent free-API context.

## Usage (raw API)

Point any OpenAI client at the gateway. Use `model: "auto"` to let the router
choose, or a provider id (`gemini`, `deepseek`, `mistral`, `openrouter`,
`local`) to force one (it still fails over if that one is limited).

```bash
TOKEN=$(curl -s http://localhost:8787/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your-password"}' | jq -r .token)

curl http://localhost:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "model": "auto",
    "messages": [{"role": "user", "content": "Refactor this module to use dependency injection across all files"}]
  }'
```

Streaming:

```bash
curl -N http://localhost:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"auto","stream":true,"messages":[{"role":"user","content":"fix this typo"}]}'
```

Responses include `X-LLM-Provider` and `X-LLM-Complexity` headers so you can see
what served each request.

### Endpoints

| Method | Path                   | Auth | Purpose                                     |
| ------ | ---------------------- | ---- | ------------------------------------------- |
| POST   | `/auth/login`          | —    | email + password → session JWT              |
| GET    | `/auth/me`             | JWT  | validate a stored token                     |
| POST   | `/v1/chat/completions` | JWT  | OpenAI-compatible chat, with routing        |
| GET    | `/v1/models`           | JWT  | lists `auto` + each enabled provider        |
| GET    | `/status`              | JWT  | provider config + live rate-limit state     |
| GET    | `/fs/list?path=`       | JWT  | browse gateway directories (folder picker)  |
| GET    | `/config/context`      | JWT  | current context folder + on/off             |
| POST   | `/config/context`      | JWT  | set the context folder / toggle             |
| GET    | `/health`              | —    | liveness probe                              |

## Config

All knobs live in `.env` (see `.env.example`): per-provider `*_API_KEY`,
`*_MODEL`, `*_BASE_URL`, `*_WEIGHT`, `*_COMPLEXITY_WEIGHT`, `*_COOLDOWN_MS`;
auth `PWA_EMAIL`, `PWA_PASS`, `JWT_SECRET`, `JWT_EXPIRES_IN`; context
`STATE_FILE`, `CONTEXT_DIR`, `CONTEXT_MAX_ENTRIES`; and gateway `PORT`, `HOST`,
`MAX_ATTEMPTS`, `REQUEST_TIMEOUT_MS`.

## Layout

```
src/
  index.ts                  entry
  server.ts                 express wiring (static PWA + JWT-guarded API)
  config.ts                 env → provider registry + auth + context config
  core/dispatcher.ts        top-level orchestration (score → select → failover)
  router/                   heuristic complexity scorer + provider ordering
  rateLimit/tracker.ts      in-memory cooldown tracker
  providers/openaiCompatible.ts  one adapter for every OpenAI-style endpoint
  auth/                     credentials (base-64) + JWT sign/verify
  middleware/auth.ts        requireAuth (Bearer JWT)
  fs/browse.ts              server-side directory listing (folder picker)
  context/                  chosen-folder store + transcript writer
  routes/                   chat, models/status, auth, fs, context handlers
  utils/                    logger, error classification
web/
  React + Vite + Tailwind + shadcn/ui PWA (login, chat, folder picker)
```

Written in TypeScript, functional style. The local Qwen instance is expected to
be served with llama.cpp's OpenAI-compatible server (`llama-server`).
