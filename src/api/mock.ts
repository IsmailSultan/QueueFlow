import type { Job } from './jobs'

const sampleJobs: Job[] = [
  {
    id: 'job_demo_1',
    filename: 'sunset.jpg',
    status: 'completed',
    progress: 100,
    workerId: 'worker-1',
    attempt: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    resultUrl: 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22400%22 viewBox=%220 0 800 400%22%3E%3Crect width=%22800%22 height=%22400%22 fill=%22%23e5e7b%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 font-family=%22Arial%22 font-size=%2240%22 fill=%22%230f172a%22%3Esunset.jpg%3C/text%3E%3C/svg%3E',
    error: null,
  },
  {
    id: 'job_demo_2',
    filename: 'portrait.png',
    status: 'processing',
    progress: 72,
    workerId: 'worker-2',
    attempt: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    resultUrl: null,
    error: null,
  },
  {
    id: 'job_demo_3',
    filename: 'team.webp',
    status: 'queued',
    progress: 0,
    workerId: null,
    attempt: 0,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    resultUrl: null,
    error: null,
  },
  {
    id: 'job_demo_4',
    filename: 'broken.jpg',
    status: 'failed',
    progress: 0,
    workerId: 'worker-3',
    attempt: 2,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 63 * 60 * 1000).toISOString(),
    resultUrl: null,
    error: 'The image could not be processed because the source file was unreadable.',
  },
]

let jobs: Job[] = [...sampleJobs]

export function getMockJobs() {
  return [...jobs]
}

export function createMockJobs(files: File[]): Job[] {
  const createdJobs: Job[] = files.map((file, index) => ({
    id: `job_mock_${Date.now()}_${index}`,
    filename: file.name,
    status: 'queued',
    progress: 0,
    workerId: null,
    attempt: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resultUrl: null,
    error: null,
  }))

  jobs = [...createdJobs, ...jobs]
  return [...createdJobs]
}

export function getMockJob(jobId: string) {
  return jobs.find((job) => job.id === jobId) ?? null
}

export function retryMockJob(jobId: string) {
  jobs = jobs.map((job) =>
    job.id === jobId
      ? {
          ...job,
          status: 'queued',
          progress: 0,
          workerId: null,
          attempt: job.attempt + 1,
          updatedAt: new Date().toISOString(),
          error: null,
        }
      : job,
  )

  return getMockJob(jobId)
}

export function getMockJobResult(jobId: string) {
  const job = getMockJob(jobId)

  if (!job) {
    throw new Error('Job not found.')
  }

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <rect width="800" height="500" fill="#f8fafc"/>
      <text x="50%" y="48%" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" fill="#0f172a">${job.filename}</text>
      <text x="50%" y="56%" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" fill="#475569">processed preview</text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
