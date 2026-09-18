# QueueFlow

> A cloud-native image processing demo that makes asynchronous work visible.

QueueFlow accepts image uploads, places them on a BullMQ queue, processes them with independent Sharp workers, and center-crops them into fixed 500x500 outputs so the transformation is obvious during a demo.

![QueueFlow dashboard](https://dummyimage.com/1200x630/f4f7fb/0f172a&text=QueueFlow+Background+Processing)

## Why QueueFlow?

Image resizing is a simple example of a problem that should not block a web request. QueueFlow separates the request from the work:

```text
React dashboard
      |
      v
Express API + Multer
      |
      v
Redis + BullMQ
      |
      v
Autoscaled Sharp workers
      |
      v
uploads/  -->  processed/
```

The dashboard shows the actual backend state: queued jobs, processing progress, worker IDs, completed results, failures, retries, queue depth, and worker fleet status.

## Features

- Multi-file drag-and-drop uploads
- JPG, PNG, and WEBP validation
- BullMQ queue backed by Redis
- Real progress reported by Sharp workers
- Noticeable fixed-size center-cropping with Sharp
- Local `uploads/` and `processed/` storage
- Multiple worker processes consuming one shared queue
- Deterministic queue-depth autoscaling
- Safe scale-down: only idle workers after a cooldown are stopped
- Deliberate first-attempt failure for a reliable retry demo
- REST API documented in [API_CONTRACT.md](./API_CONTRACT.md)
- Repeatable Windows demo script in [scripts/demo.ps1](./scripts/demo.ps1)

## Stack

| Layer | Technology |
| --- | --- |
| UI | React, TypeScript, Vite |
| API | Node.js, Express, Multer |
| Queue | Redis, BullMQ |
| Processing | Sharp |
| Runtime | TypeScript via `tsx` |
| Storage | Local filesystem |

## Quick start on Windows

QueueFlow needs a Redis-compatible service. For a Windows hackathon setup, [Memurai](https://www.memurai.com/) is the simplest option. Docker is not required.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```env
REDIS_URL=redis://127.0.0.1:6379
PORT=3000
FRONTEND_URL=http://127.0.0.1:4173
DEMO_FAILURE_ENABLED=true
MIN_WORKERS=1
MAX_WORKERS=4
AUTOSCALE_INTERVAL_MS=1000
WORKER_IDLE_COOLDOWN_MS=5000
PROCESSING_DELAY_MS=750
SLOW_PROCESSING=true
```

For the frontend, create `.env.local`:

```env
VITE_API_URL=http://127.0.0.1:3000
```

### 3. Start the app

Terminal 1:

```bash
npm run server
```

Terminal 2:

```bash
npm run dev
```

Open `http://127.0.0.1:5173` (or the port printed by Vite).

The API autoscaler starts at least one worker and scales up to `MAX_WORKERS` as the queue grows. You can also run extra workers manually:

```bash
npm run worker
```

## Run the demonstration

The script supports focused scenarios or the complete presentation flow:

```bash
npm run demo
```

PowerShell scenario commands:

```powershell
# Reset queue history and local files
npm run demo -- -Scenario reset

# Process one normal image and verify the result
npm run demo -- -Scenario basic

# Demonstrate autoscaling and scale-down
npm run demo -- -Scenario scale -BatchSize 20

# Demonstrate deliberate failure and manual retry
npm run demo -- -Scenario failure

# Run every scenario in one presentation
npm run demo -- -Scenario all -BatchSize 12
```

`BatchSize` controls how many images are uploaded in the `scale` and `all` scenarios. Use a larger value, such as `20` or `40`, if the queue drains too quickly to see the fleet grow.

`SLOW_PROCESSING` is the presentation switch. Set it to `true` to add pauses between real worker progress updates, or `false` for normal throughput. `PROCESSING_DELAY_MS` controls the pause length when the switch is enabled. Restart `npm run server` after changing either value.

Expected autoscaling pattern:

```text
baseline           queue=0   active=0  workers=1
sample 01          queue=8   active=1  workers=4
sample 08          queue=0   active=0  workers=4
after drain        queue=0   active=0  workers=1
```

The exact numbers depend on machine speed. A worker with `processing` status is never selected for scale-down.

## Reset job history

To clear BullMQ jobs and local image files:

```bash
npm run reset
```

This removes the contents of `uploads/` and `processed/` and obliterates the QueueFlow BullMQ queue. Run it before a clean presentation demo.

## Deliberate failure demo

With `DEMO_FAILURE_ENABLED=true`, any filename containing `fail` fails on its first attempt:

```text
demo-fail.png
processing -> failed
Retry
failed -> queued -> processing -> completed
```

This is deterministic and isolated to the demo flag; it is disabled by setting `DEMO_FAILURE_ENABLED=false`.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/jobs` | Upload one or more images |
| `GET` | `/api/jobs` | List current jobs |
| `GET` | `/api/jobs/:id` | Read one job |
| `POST` | `/api/jobs/:id/retry` | Retry a failed job |
| `GET` | `/api/jobs/:id/result` | Download the processed image |
| `GET` | `/api/system` | Read queue and worker fleet state |

See [API_CONTRACT.md](./API_CONTRACT.md) for request and response shapes.

## Project structure

```text
src/
  api/             Frontend API client and mock adapter
  App.tsx          QueueFlow dashboard
server/
  server.ts        Express API
  queue.ts         Shared BullMQ queue and Redis connection
  worker.ts        Sharp image worker process
  autoscaler.ts    Local worker supervisor
  reset.ts         Demo cleanup command
scripts/
  demo.ps1         Repeatable Windows presentation script
uploads/           Original files (generated, ignored)
processed/         Resized files (generated, ignored)
```

## Architecture notes

- Redis stores queue metadata and job state, never image files.
- The frontend polls the API; it does not simulate progress.
- The API pauses intake briefly while a batch's worker capacity becomes ready, making worker distribution visible and deterministic.
- Autoscaler scale-down is guarded by worker-reported status and cooldown time.
- This is intentionally a hackathon MVP: no authentication, database, WebSockets, S3, or Kubernetes.
