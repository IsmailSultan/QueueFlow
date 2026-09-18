import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { createJobs, getJobs, getJobResult, retryJob, type Job, type JobStatus } from './api/jobs'

type SelectedFile = {
  id: string
  file: File
}

const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

const statusMeta: Record<
  JobStatus,
  { label: string; className: string }
> = {
  queued: { label: 'Queued', className: 'status-queued' },
  processing: { label: 'Processing', className: 'status-processing' },
  completed: { label: 'Completed', className: 'status-completed' },
  failed: { label: 'Failed', className: 'status-failed' },
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

const buildApiLabel = () => {
  const base = import.meta.env.VITE_API_URL?.trim()

  if (!base || base === 'mock') {
    return 'DEMO MODE'
  }

  return 'LIVE API'
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingJobs, setIsLoadingJobs] = useState(true)
  const [error, setError] = useState('')

  const apiMode = buildApiLabel()

  const refreshJobs = async () => {
    try {
      setIsLoadingJobs(true)
      const nextJobs = await getJobs()
      setJobs(nextJobs)
    } catch (jobError) {
      setError(
        jobError instanceof Error
          ? jobError.message
          : 'Unable to load jobs right now.',
      )
    } finally {
      setIsLoadingJobs(false)
    }
  }

  useEffect(() => {
    void refreshJobs()

    const intervalId = window.setInterval(() => {
      void refreshJobs()
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [])

  const summary = useMemo(() => {
    return {
      queued: jobs.filter((job) => job.status === 'queued').length,
      processing: jobs.filter((job) => job.status === 'processing').length,
      completed: jobs.filter((job) => job.status === 'completed').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
    }
  }, [jobs])

  const addFiles = (inputFiles: FileList | File[]) => {
    const fileList = Array.from(inputFiles)
    const validFiles: SelectedFile[] = []
    const nextErrors: string[] = []

    for (const file of fileList) {
      const isAllowedType = ALLOWED_FILE_TYPES.includes(file.type)
      const isAllowedSize = file.size <= MAX_FILE_SIZE_BYTES

      if (!isAllowedType) {
        nextErrors.push(`${file.name} is not a supported image type.`)
        continue
      }

      if (!isAllowedSize) {
        nextErrors.push(`${file.name} exceeds the 10 MB limit.`)
        continue
      }

      validFiles.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        file,
      })
    }

    if (nextErrors.length) {
      setError(nextErrors.join(' '))
    } else {
      setError('')
    }

    if (validFiles.length) {
      setSelectedFiles((current) => [...current, ...validFiles])
    }
  }

  const onFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      addFiles(event.target.files)
      event.target.value = ''
    }
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (event.dataTransfer.files) {
      addFiles(event.dataTransfer.files)
    }
  }

  const removeSelectedFile = (fileId: string) => {
    setSelectedFiles((current) => current.filter((item) => item.id !== fileId))
  }

  const handleProcessFiles = async () => {
    if (!selectedFiles.length) {
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const createdJobs = await createJobs(selectedFiles.map((item) => item.file))
      setJobs((current) => [...createdJobs, ...current])
      setSelectedFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : 'The jobs could not be submitted.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRetry = async (jobId: string) => {
    try {
      await retryJob(jobId)
      await refreshJobs()
    } catch (retryError) {
      setError(
        retryError instanceof Error
          ? retryError.message
          : 'Unable to retry the selected job.',
      )
    }
  }

  const handleResultOpen = async (job: Job) => {
    try {
      const resultUrl = await getJobResult(job.id)
      window.open(resultUrl, '_blank', 'noopener,noreferrer')
    } catch (resultError) {
      setError(
        resultError instanceof Error
          ? resultError.message
          : 'The processed image is not available yet.',
      )
    }
  }

  return (
    <div className="page-shell">
      <div className="dashboard">
        <header className="app-header">
          <div className="brand-wrap">
            <div className="brand-mark" aria-hidden="true">
              QF
            </div>
            <div>
              <div className="brand-name">QueueFlow</div>
              <div className="brand-subtitle">Background Processing</div>
            </div>
          </div>

          <div className="status-cluster">
            <div className="connection-pill">
              <span className="connection-dot" aria-hidden="true" />
              System Online
            </div>
            <div className="mode-pill">{apiMode}</div>
          </div>
        </header>

        <main className="main-panel">
          <section className="content-block intro-block">
            <div className="section-copy">
              <h1>Background Processing</h1>
              <p>
                Process files without blocking your users. The queue coordinates
                each job while workers resize images asynchronously.
              </p>
            </div>

            <label
              className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={onFileInputChange}
              />

              <div className="dropzone-inner">
                <div className="dropzone-icon" aria-hidden="true">
                  ↑
                </div>
                <div className="dropzone-title">Upload files</div>
                <div className="dropzone-copy">
                  Drag &amp; drop images here or click to browse.
                </div>
              </div>
            </label>

            <div className="upload-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!selectedFiles.length || isSubmitting}
                onClick={handleProcessFiles}
              >
                {isSubmitting ? 'Submitting...' : 'Process Files'}
              </button>
            </div>
          </section>

          {error ? <div className="inline-alert">{error}</div> : null}

          {selectedFiles.length > 0 ? (
            <section className="content-block selected-files-block">
              <div className="mini-header">
                <h2>Selected Files</h2>
              </div>

              <ul className="selected-files-list">
                {selectedFiles.map((item) => (
                  <li key={item.id} className="selected-file-item">
                    <div>
                      <div className="file-name">{item.file.name}</div>
                      <div className="file-meta">
                        {formatFileSize(item.file.size)}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => removeSelectedFile(item.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="content-block summary-block">
            <div className="mini-header">
              <h2>Queue Status</h2>
            </div>

            <div className="summary-grid">
              {[
                { label: 'Queued', value: summary.queued },
                { label: 'Processing', value: summary.processing },
                { label: 'Completed', value: summary.completed },
                { label: 'Failed', value: summary.failed },
              ].map((item) => (
                <div key={item.label} className="summary-card">
                  <div className="summary-label">{item.label}</div>
                  <div className="summary-value">{item.value}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="content-block jobs-block">
            <div className="mini-header">
              <h2>Jobs</h2>
            </div>

            <div className="jobs-table-wrap">
              {isLoadingJobs && jobs.length === 0 ? (
                <div className="empty-state">Loading jobs...</div>
              ) : jobs.length === 0 ? (
                <div className="empty-state">
                  No jobs yet. Upload an image to create the first processing task.
                </div>
              ) : (
                <table className="jobs-table">
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Status</th>
                      <th>Progress</th>
                      <th>Worker</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => {
                      const meta = statusMeta[job.status]

                      return (
                        <tr key={job.id}>
                          <td>
                            <div className="file-cell">
                              <div className="file-cell-name">{job.filename}</div>
                              <div className="file-cell-meta">
                                {new Date(job.createdAt).toLocaleString()}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`status-badge ${meta.className}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td>
                            {job.status === 'completed' || job.status === 'failed' ? (
                              <div className="progress-meta">
                                {job.status === 'completed' ? '100%' : '—'}
                              </div>
                            ) : (
                              <div className="progress-column">
                                <div className="progress-track" aria-label={`${job.progress}% complete`}>
                                  <span
                                    className="progress-fill"
                                    style={{ width: `${job.progress}%` }}
                                  />
                                </div>
                                <span className="progress-text">{job.progress}%</span>
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="worker-text">
                              {job.workerId ?? '—'}
                            </span>
                          </td>
                          <td>
                            <div className="job-actions">
                              {job.status === 'failed' ? (
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => handleRetry(job.id)}
                                >
                                  Retry
                                </button>
                              ) : null}

                              {job.status === 'completed' && job.resultUrl ? (
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => void handleResultOpen(job)}
                                >
                                  View
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

export default App
