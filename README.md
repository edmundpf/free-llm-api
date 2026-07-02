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
cp .env.example .env      # add whichever provider keys you have
npm run dev               # or: npm run build && npm start
```

Any provider without an API key is auto-disabled and skipped by the router, so
you can start with just one key.

## Usage

Point any OpenAI client at the gateway. Use `model: "auto"` to let the router
choose, or a provider id (`gemini`, `deepseek`, `mistral`, `openrouter`,
`local`) to force one (it still fails over if that one is limited).

```bash
curl http://localhost:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $GATEWAY_API_KEY' \
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

| Method | Path                   | Purpose                                  |
| ------ | ---------------------- | ---------------------------------------- |
| POST   | `/v1/chat/completions` | OpenAI-compatible chat, with routing     |
| GET    | `/v1/models`           | Lists `auto` + each enabled provider     |
| GET    | `/status`              | Provider config + live rate-limit state  |
| GET    | `/health`              | Liveness probe                           |

## Config

All knobs live in `.env` (see `.env.example`): per-provider `*_API_KEY`,
`*_MODEL`, `*_BASE_URL`, `*_WEIGHT`, `*_COMPLEXITY_WEIGHT`, `*_COOLDOWN_MS`,
plus gateway `PORT`, `GATEWAY_API_KEY`, `MAX_ATTEMPTS`, `REQUEST_TIMEOUT_MS`.

## Layout

```
src/
  index.ts                  entry
  server.ts                 express wiring + bearer auth
  config.ts                 env → provider registry
  types.ts                  shared types
  core/dispatcher.ts        top-level orchestration (score → select → failover)
  router/complexity.ts      heuristic complexity scorer
  router/selectProvider.ts  complexity-aware, rate-limit-aware ordering
  rateLimit/tracker.ts      in-memory cooldown tracker
  providers/openaiCompatible.ts  one adapter for every OpenAI-style endpoint
  routes/                   chat completions + models/status handlers
  utils/                    logger, error classification
```

Written in TypeScript, functional style. The local Qwen instance is expected to
be served with llama.cpp's OpenAI-compatible server (`llama-server`).
