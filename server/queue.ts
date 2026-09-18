import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { config } from './config.js'

export const queueName = 'queueflow-image-jobs'
export const connection = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null,
})
export const queue = new Queue(queueName, { connection })

export type ImageJobData = {
  filename: string
  inputPath: string
  outputPath: string
  workerId?: string
  demoFailureTriggered?: boolean
}
