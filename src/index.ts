import { loadConfig } from './config'
import { createServer } from './server'
import { logger } from './utils/logger'

// Entry point: load config, build the app, listen.
const main = (): void => {
  const config = loadConfig()
  const app = createServer(config)
  app.listen(config.port, config.host, () => {
    logger.info('free-llm-api listening', {
      host: config.host,
      port: config.port,
      endpoint: `http://${config.host}:${config.port}/v1/chat/completions`,
    })
  })
}

main()
