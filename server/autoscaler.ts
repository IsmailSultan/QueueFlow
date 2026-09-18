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

type ManagedWorker = WorkerSnapshot & { process: ChildProcess }

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
  }
  workers.set(id, worker)
  child.on('message', (message: unknown) => {
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
  return [...workers.values()].map(({ process: _process, ...snapshot }) => snapshot)
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
