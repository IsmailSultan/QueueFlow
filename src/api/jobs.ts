import { apiRequest, isMockMode } from './client'
import {
  createMockJobs,
  getMockJob,
  getMockJobResult,
  getMockJobs,
  retryMockJob,
} from './mock'

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export type Job = {
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

export async function createJobs(files: File[]): Promise<Job[]> {
  if (isMockMode()) {
    return createMockJobs(files)
  }

  const formData = new FormData()
  files.forEach((file) => formData.append('files', file))

  return apiRequest<Job[]>('/api/jobs', {
    method: 'POST',
    body: formData,
  })
}

export async function getJobs(): Promise<Job[]> {
  if (isMockMode()) {
    return getMockJobs()
  }

  return apiRequest<Job[]>('/api/jobs')
}

export async function getJob(jobId: string): Promise<Job> {
  if (isMockMode()) {
    const job = getMockJob(jobId)

    if (!job) {
      throw new Error('Job not found.')
    }

    return job
  }

  return apiRequest<Job>(`/api/jobs/${jobId}`)
}

export async function retryJob(jobId: string): Promise<Job> {
  if (isMockMode()) {
    const updated = retryMockJob(jobId)

    if (!updated) {
      throw new Error('Job not found.')
    }

    return updated
  }

  return apiRequest<Job>(`/api/jobs/${jobId}/retry`, {
    method: 'POST',
  })
}

export async function getJobResult(jobId: string): Promise<string> {
  if (isMockMode()) {
    return getMockJobResult(jobId)
  }

  const response = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/jobs/${jobId}/result`)

  if (!response.ok) {
    throw new Error('The processed image is not available.')
  }

  const blob = await response.blob()
  return URL.createObjectURL(blob)
}
