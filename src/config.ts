import dotenv from 'dotenv'
import { ProviderConfig } from './types'
import { logger } from './utils/logger'

dotenv.config()

const num = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

const str = (raw: string | undefined, fallback: string): string =>
  raw && raw.trim().length > 0 ? raw : fallback

// Every remote here speaks the OpenAI chat-completions protocol, so a single
// generic adapter can drive all of them. Weights/complexityWeights encode the
// routing preference described in the design:
//   - complex refactors  -> Gemini first, then DeepSeek
//   - simple edits       -> Mistral / OpenRouter first
//   - local Qwen         -> only when every remote is rate-limited
const buildProviders = (): ProviderConfig[] => {
  const defs: ProviderConfig[] = [
    {
      id: 'gemini',
      label: 'Gemini (free)',
      baseUrl: str(process.env.GEMINI_BASE_URL, 'https://generativelanguage.googleapis.com/v1beta/openai'),
      apiKey: str(process.env.GEMINI_API_KEY, ''),
      model: str(process.env.GEMINI_MODEL, 'gemini-2.0-flash'),
      weight: num(process.env.GEMINI_WEIGHT, 40),
      complexityWeight: num(process.env.GEMINI_COMPLEXITY_WEIGHT, 60),
      isLocal: false,
      enabled: true,
      defaultCooldownMs: num(process.env.GEMINI_COOLDOWN_MS, 60_000),
    },
    {
      id: 'deepseek',
      label: 'DeepSeek (free)',
      baseUrl: str(process.env.DEEPSEEK_BASE_URL, 'https://api.deepseek.com/v1'),
      apiKey: str(process.env.DEEPSEEK_API_KEY, ''),
      model: str(process.env.DEEPSEEK_MODEL, 'deepseek-chat'),
      weight: num(process.env.DEEPSEEK_WEIGHT, 55),
      complexityWeight: num(process.env.DEEPSEEK_COMPLEXITY_WEIGHT, 35),
      isLocal: false,
      enabled: true,
      defaultCooldownMs: num(process.env.DEEPSEEK_COOLDOWN_MS, 60_000),
    },
    {
      id: 'mistral',
      label: 'Mistral (free)',
      baseUrl: str(process.env.MISTRAL_BASE_URL, 'https://api.mistral.ai/v1'),
      apiKey: str(process.env.MISTRAL_API_KEY, ''),
      model: str(process.env.MISTRAL_MODEL, 'mistral-small-latest'),
      weight: num(process.env.MISTRAL_WEIGHT, 60),
      complexityWeight: num(process.env.MISTRAL_COMPLEXITY_WEIGHT, 10),
      isLocal: false,
      enabled: true,
      defaultCooldownMs: num(process.env.MISTRAL_COOLDOWN_MS, 60_000),
    },
    {
      id: 'openrouter',
      label: 'OpenRouter (free)',
      baseUrl: str(process.env.OPENROUTER_BASE_URL, 'https://openrouter.ai/api/v1'),
      apiKey: str(process.env.OPENROUTER_API_KEY, ''),
      model: str(process.env.OPENROUTER_MODEL, 'deepseek/deepseek-chat-v3-0324:free'),
      weight: num(process.env.OPENROUTER_WEIGHT, 58),
      complexityWeight: num(process.env.OPENROUTER_COMPLEXITY_WEIGHT, 10),
      isLocal: false,
      enabled: true,
      defaultCooldownMs: num(process.env.OPENROUTER_COOLDOWN_MS, 60_000),
    },
    {
      id: 'local',
      label: 'Local Qwen Coder (llama.cpp)',
      baseUrl: str(process.env.LOCAL_BASE_URL, 'http://localhost:8080/v1'),
      // llama.cpp does not require a key; keep a harmless placeholder.
      apiKey: str(process.env.LOCAL_API_KEY, 'sk-local'),
      model: str(process.env.LOCAL_MODEL, 'qwen2.5-coder'),
      weight: num(process.env.LOCAL_WEIGHT, 10),
      complexityWeight: num(process.env.LOCAL_COMPLEXITY_WEIGHT, 0),
      isLocal: true,
      enabled: true,
      defaultCooldownMs: num(process.env.LOCAL_COOLDOWN_MS, 15_000),
    },
  ]

  // A remote with no API key can't be used; disable it so routing skips it.
  return defs.map((p) =>
    !p.isLocal && p.apiKey.length === 0 ? { ...p, enabled: false } : p,
  )
}

export interface AppConfig {
  port: number
  host: string
  // A bearer token clients must present to this gateway. Empty = open.
  apiKey: string
  providers: ProviderConfig[]
  // Cap on how many providers the dispatcher will try for one request.
  maxAttempts: number
  requestTimeoutMs: number
}

export const loadConfig = (): AppConfig => {
  const providers = buildProviders()
  const active = providers.filter((p) => p.enabled)
  logger.info('providers loaded', {
    enabled: active.map((p) => p.id),
    disabled: providers.filter((p) => !p.enabled).map((p) => p.id),
  })
  if (active.filter((p) => !p.isLocal).length === 0) {
    logger.warn('no remote providers configured; only the local fallback is available')
  }
  return {
    port: num(process.env.PORT, 8787),
    host: str(process.env.HOST, '0.0.0.0'),
    apiKey: str(process.env.GATEWAY_API_KEY, ''),
    providers,
    maxAttempts: num(process.env.MAX_ATTEMPTS, providers.length),
    requestTimeoutMs: num(process.env.REQUEST_TIMEOUT_MS, 120_000),
  }
}
