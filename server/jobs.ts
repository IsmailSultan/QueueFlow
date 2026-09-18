import type { Job as BullJob } from 'bullmq'
import { queue, type ImageJobData } from './queue.js'

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type ApiJob = {
  id: string
  filename: string
  status: JobStatus
  progress: number
  workerId: string | null
  attempt: number
  maxAttempts: number
  createdAt: string
  updatedAt: string
  resultUrl: string | null
  error: string | null
}

const asDate = (value: number | undefined) =>
  new Date(value ?? Date.now()).toISOString()

export async function toApiJob(job: BullJob<ImageJobData, string, string>): Promise<ApiJob> {
  const state = await job.getState()
  const progress = typeof job.progress === 'number' ? job.progress : 0
  const workerId = typeof job.data.workerId === 'string' ? job.data.workerId : null
  const resultUrl = typeof job.returnvalue === 'string' ? job.returnvalue : null
  const error = job.failedReason ?? null

  return {
    id: job.id ?? '',
    filename: job.data.filename,
    status: state === 'active' ? 'processing' : state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'queued',
    progress,
    workerId,
    attempt: job.attemptsMade,
    maxAttempts: 3,
    createdAt: asDate(job.timestamp),
    updatedAt: asDate(job.processedOn ?? job.finishedOn ?? job.timestamp),
    resultUrl,
    error,
  }
}

export async function findJob(jobId: string) {
  return queue.getJob(jobId)
}

export async function listApiJobs() {
  const jobs = await queue.getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'])
  const apiJobs = await Promise.all(jobs.map((job) => toApiJob(job)))
  return apiJobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
