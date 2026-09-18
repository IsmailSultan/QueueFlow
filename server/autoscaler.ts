import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { queue } from './queue.js'
import { config } from './config.js'

export type WorkerStatus = 'idle' | 'processing'
export type WorkerSnapshot = {
  id: string
  status: WorkerStatus
  startedAt: string
  lastStateChangeAt: string
}

type ManagedWorker = WorkerSnapshot & { process: ChildProcess; ready: boolean }

const workerScript = fileURLToPath(new URL('./worker.ts', import.meta.url))
const workers = new Map<string, ManagedWorker>()
let timer: NodeJS.Timeout | undefined
let nextWorkerNumber = 1

const updateStatus = (id: string, status: WorkerStatus) => {
  const worker = workers.get(id)
  if (worker) {
    worker.status = status
    worker.lastStateChangeAt = new Date().toISOString()
  }
}

const spawnWorker = () => {
  if (workers.size >= config.maxWorkers) return
  const id = `worker-${nextWorkerNumber++}`
  const child = fork(workerScript, [], {
    execArgv: ['--import', 'tsx/esm'],
    env: { ...process.env, QUEUEFLOW_WORKER_ID: id },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  const now = new Date().toISOString()
  const worker: ManagedWorker = {
    id,
    status: 'idle',
    startedAt: now,
    lastStateChangeAt: now,
    process: child,
    ready: false,
  }
  workers.set(id, worker)
  child.on('message', (message: unknown) => {
    if (typeof message === 'object' && message !== null && 'ready' in message && message.ready === true) {
      const current = workers.get(id)
      if (current) current.ready = true
    }
    if (
      typeof message === 'object' &&
      message !== null &&
      'status' in message &&
      (message.status === 'idle' || message.status === 'processing')
    ) {
      updateStatus(id, message.status)
    }
  })
  child.on('exit', () => workers.delete(id))
}

const waitForWorkers = async (targetCount: number) => {
  while (workers.size < targetCount) {
    spawnWorker()
  }

  while ([...workers.values()].some((worker) => !worker.ready)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const stopIdleWorker = () => {
  const cutoff = Date.now() - config.workerIdleCooldownMs
  const candidate = [...workers.values()]
    .filter((worker) => worker.status === 'idle')
    .filter((worker) => Date.parse(worker.lastStateChangeAt) <= cutoff)
    .sort((a, b) => Date.parse(a.lastStateChangeAt) - Date.parse(b.lastStateChangeAt))[0]

  if (candidate) {
    candidate.process.send?.({ type: 'shutdown' })
  }
}

const reconcile = async () => {
  const waiting = await queue.getWaitingCount()
  const active = await queue.getActiveCount()
  const capacity = [...workers.values()].filter((worker) => worker.status === 'idle').length
  const desired = Math.min(config.maxWorkers, Math.max(config.minWorkers, active + waiting))

  while (workers.size < desired) spawnWorker()
  if (waiting === 0 && active === 0 && workers.size > config.minWorkers && capacity > 0) {
    stopIdleWorker()
  }
}

export function getWorkerSnapshots() {
  return [...workers.values()].map(({ process: _process, ready: _ready, ...snapshot }) => snapshot)
}

export async function getAutoscalerState() {
  const [waiting, active] = await Promise.all([queue.getWaitingCount(), queue.getActiveCount()])
  return {
    queueDepth: waiting,
    activeWorkerCount: [...workers.values()].filter((worker) => worker.status === 'processing').length,
    workerCount: workers.size,
    workers: getWorkerSnapshots(),
    activeJobs: active,
  }
}

export function startAutoscaler() {
  while (workers.size < config.minWorkers) spawnWorker()
  timer = setInterval(() => {
    void reconcile().catch((error: unknown) => console.error('Autoscaler error:', error))
  }, config.autoscaleIntervalMs)
  void reconcile()
}

export async function ensureWorkerCapacity(jobCount: number) {
  const target = Math.min(config.maxWorkers, Math.max(config.minWorkers, jobCount))
  await waitForWorkers(target)
}

export async function stopAutoscaler() {
  if (timer) clearInterval(timer)
  await Promise.all(
    [...workers.values()].map(
      (worker) =>
        new Promise<void>((resolve) => {
          worker.process.once('exit', () => resolve())
          worker.process.send?.({ type: 'shutdown' })
        }),
    ),
  )
}
