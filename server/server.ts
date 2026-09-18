import fs from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { config } from './config.js'
import { queue, type ImageJobData } from './queue.js'
import { findJob, listApiJobs, toApiJob } from './jobs.js'
import {
  ensureWorkerCapacity,
  getAutoscalerState,
  startAutoscaler,
  stopAutoscaler,
} from './autoscaler.js'

await Promise.all([
  fs.mkdir(config.uploadsDir, { recursive: true }),
  fs.mkdir(config.processedDir, { recursive: true }),
])

const app = express()
const upload = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => callback(null, config.uploadsDir),
    filename: (_request, file, callback) =>
      callback(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${file.originalname}`),
  }),
  limits: { files: 50, fileSize: 10 * 1024 * 1024 },
})

app.use(cors({ origin: config.frontendUrl }))
app.use(express.json())

app.get('/api/jobs', async (_request, response) => {
  response.json(await listApiJobs())
})

app.get('/api/jobs/:id', async (request, response) => {
  const job = await findJob(request.params.id)
  if (!job) {
    response.status(404).json({ error: 'Job not found.' })
    return
  }
  response.json(await toApiJob(job))
})

app.get('/api/system', async (_request, response) => {
  response.json(await getAutoscalerState())
})

app.post('/api/jobs', upload.array('files', 50), async (request, response) => {
  const files = (request.files as Express.Multer.File[] | undefined) ?? []
  if (!files.length) {
    response.status(400).json({ error: 'At least one image file is required.' })
    return
  }

  await queue.pause()
  try {
    await ensureWorkerCapacity(files.length)
    const jobs = await Promise.all(
      files.map(async (file) => {
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const outputPath = path.join(config.processedDir, `${jobId}-${file.originalname}`)
        const data: ImageJobData = {
          filename: file.originalname,
          inputPath: file.path,
          outputPath,
        }
        return queue.add('resize-image', data, {
          jobId,
          // Demo failures must remain failed until the user explicitly retries.
          attempts:
            config.demoFailureEnabled && file.originalname.toLowerCase().includes('fail')
              ? 1
              : 3,
          backoff: { type: 'fixed', delay: 500 },
          removeOnComplete: false,
          removeOnFail: false,
        })
      }),
    )
    await queue.resume()
    response.status(202).json(await Promise.all(jobs.map((job) => toApiJob(job))))
  } catch (error) {
    await queue.resume()
    throw error
  }
})

app.post('/api/jobs/:id/retry', async (request, response) => {
  const job = await findJob(request.params.id)
  if (!job) {
    response.status(404).json({ error: 'Job not found.' })
    return
  }
  if ((await job.getState()) !== 'failed') {
    response.status(409).json({ error: 'Only failed jobs can be retried.' })
    return
  }
  await job.retry('failed')
  response.status(202).json(await toApiJob(job))
})

app.get('/api/jobs/:id/result', async (request, response) => {
  const job = await findJob(request.params.id)
  if (!job || (await job.getState()) !== 'completed') {
    response.status(404).json({ error: 'Processed image is not available.' })
    return
  }
  response.sendFile(job.data.outputPath)
})

const server = app.listen(config.port, () => {
  console.log(`QueueFlow API listening on http://127.0.0.1:${config.port}`)
  startAutoscaler()
})

const shutdown = async () => {
  await stopAutoscaler()
  await queue.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
void server
