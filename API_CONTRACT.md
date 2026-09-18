# QueueFlow API Contract

The frontend expects a REST API backend for image processing jobs. The service layer is isolated behind `src/api` so the UI can be connected to a real backend without changing component logic.

## Base URL

Configure the backend with the environment variable:

```bash
VITE_API_URL=http://localhost:3000
```

If this variable is missing or set to `mock`, the app uses the built-in development mock layer for local UI testing.

## Resources

### POST /api/jobs

Creates background jobs from one or more images.

Request:
- Content-Type: multipart/form-data
- Form field: `files`
- Accepts multiple image files

Supported image types:
- image/jpeg
- image/png
- image/webp

Response:

```json
[
  {
    "id": "job_123",
    "filename": "cat.jpg",
    "status": "queued",
    "progress": 0,
    "workerId": null,
    "attempt": 0,
    "maxAttempts": 3,
    "createdAt": "2026-09-18T10:00:00.000Z",
    "updatedAt": "2026-09-18T10:00:00.000Z",
    "resultUrl": null,
    "error": null
  }
]
```

### GET /api/jobs

Returns the current list of jobs and their state.

Response:

```json
[
  {
    "id": "job_123",
    "filename": "cat.jpg",
    "status": "queued",
    "progress": 0,
    "workerId": null,
    "attempt": 0,
    "maxAttempts": 3,
    "createdAt": "2026-09-18T10:00:00.000Z",
    "updatedAt": "2026-09-18T10:00:00.000Z",
    "resultUrl": null,
    "error": null
  }
]
```

### GET /api/jobs/:id

Returns a single job.

### POST /api/jobs/:id/retry

Retries a failed job.

Response:
- Same job object with `status` reset to `queued`.

### GET /api/jobs/:id/result

Returns the processed image file for a completed job.

Response:
- Content-Type: image/jpeg | image/png | image/webp
- Or it can be a signed download URL depending on the backend implementation.

## Job shape

```ts
type JobStatus = 'queued' | 'processing' | 'completed' | 'failed'

type Job = {
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
```

## Notes

- The frontend does not perform resizing in the browser.
- Queue state and worker progress are backend-owned and should remain the source of truth.
- The frontend only renders the current job state and exposes actions such as retry and result viewing.
