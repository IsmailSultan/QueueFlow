import fs from 'node:fs/promises'
import os from 'node:os'
import { UnrecoverableError, Worker } from 'bullmq'
import sharp from 'sharp'
import { config } from './config.js'
import { connection, queueName, type ImageJobData } from './queue.js'

const workerId = process.env.QUEUEFLOW_WORKER_ID ?? `worker-${os.hostname()}`
let processing = false
const pauseForDemo = () =>
  config.slowProcessing && config.processingDelayMs > 0
    ? new Promise<void>((resolve) => setTimeout(resolve, config.processingDelayMs))
    : Promise.resolve()

const announce = (status: 'idle' | 'processing') => {
  processing = status === 'processing'
  process.send?.({ status })
}

const worker = new Worker<ImageJobData, string>(
  queueName,
  async (job) => {
    announce('processing')
    await job.updateProgress(5)
    await pauseForDemo()
    job.data.workerId = workerId
    await job.updateData(job.data)

    if (
      config.demoFailureEnabled &&
      job.data.filename.toLowerCase().includes('fail') &&
      job.attemptsMade === 0 &&
      !job.data.demoFailureTriggered
    ) {
      job.data.demoFailureTriggered = true
      await job.updateData(job.data)
      throw new UnrecoverableError('Deliberate demo failure for first attempt.')
    }

    await fs.mkdir(config.processedDir, { recursive: true })
    await job.updateProgress(25)
    await pauseForDemo()
    await sharp(job.data.inputPath)
      .resize(500, 500, { fit: 'cover', position: 'centre' })
      .toFile(job.data.outputPath)
    await job.updateProgress(90)
    await pauseForDemo()
    await fs.access(job.data.outputPath)
    await job.updateProgress(100)
    return `/api/jobs/${job.id}/result`
  },
  { connection, concurrency: 1 },
)

worker.on('completed', () => announce('idle'))
worker.on('failed', () => announce('idle'))
worker.on('error', (error) => console.error(`${workerId} error:`, error))
announce('idle')
worker.on('ready', () => process.send?.({ ready: true }))

const shutdown = async () => {
  if (processing) {
    setTimeout(() => void shutdown(), 250)
    return
  }
  await worker.close()
  await connection.quit()
  process.exit(0)
}

process.on('message', (message: unknown) => {
  if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'shutdown') {
    void shutdown()
  }
})
