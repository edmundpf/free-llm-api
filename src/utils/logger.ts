// Tiny structured logger. Kept dependency-free and functional; log level is
// controlled by the LOG_LEVEL env var (debug | info | warn | error).

type Level = 'debug' | 'info' | 'warn' | 'error'

const order: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const threshold = (): number => {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase() as Level
  return order[raw] ?? order.info
}

const emit = (level: Level, msg: string, meta?: Record<string, unknown>): void => {
  if (order[level] < threshold()) return
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta || {}),
  }
  const sink = level === 'error' || level === 'warn' ? console.error : console.log
  sink(JSON.stringify(line))
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
}
