# QueueFlow

QueueFlow is a React dashboard backed by an Express API, Redis/BullMQ, Sharp, and local image storage.

## Run locally

Install dependencies:

```bash
npm install
```

Start Redis, then copy `.env.example` to `.env` and adjust values if needed.

Start the API and autoscaler:

```bash
npm run server
```

The API listens on `http://127.0.0.1:3000`. The server starts at least `MIN_WORKERS` child processes and scales them up to `MAX_WORKERS` as waiting jobs increase.

The autoscaler only selects workers reporting `idle` for scale-down, and only after `WORKER_IDLE_COOLDOWN_MS`. A worker reporting `processing` is never terminated.

The frontend can use the real API by setting:

```bash
VITE_API_URL=http://127.0.0.1:3000
```

For manually launched workers, additional terminals can run:

```bash
npm run worker
```

All workers consume the same BullMQ queue and receive unique worker IDs.

## Demo failure

Set `DEMO_FAILURE_ENABLED=true`. Any uploaded filename containing `fail` fails deliberately on its first attempt with an unrecoverable demo error. Clicking Retry sends the failed BullMQ job back through the real queue, where it can complete successfully.

## API

The REST contract and autoscaler response are documented in [API_CONTRACT.md](./API_CONTRACT.md).
