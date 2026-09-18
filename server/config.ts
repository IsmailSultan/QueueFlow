import 'dotenv/config'
import path from 'node:path'

const numberFromEnv = (name: string, fallback: number) => {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const config = {
  port: numberFromEnv('PORT', 3000),
  redisUrl: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://127.0.0.1:4173',
  demoFailureEnabled: process.env.DEMO_FAILURE_ENABLED === 'true',
  minWorkers: numberFromEnv('MIN_WORKERS', 1),
  maxWorkers: numberFromEnv('MAX_WORKERS', 8),
  autoscaleIntervalMs: numberFromEnv('AUTOSCALE_INTERVAL_MS', 1500),
  workerIdleCooldownMs: numberFromEnv('WORKER_IDLE_COOLDOWN_MS', 10000),
  uploadsDir: path.resolve(process.cwd(), 'uploads'),
  processedDir: path.resolve(process.cwd(), 'processed'),
}

if (config.maxWorkers < config.minWorkers) {
  throw new Error('MAX_WORKERS must be greater than or equal to MIN_WORKERS.')
}
