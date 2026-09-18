export const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_URL)

function normalizeBaseUrl(rawUrl?: string) {
  const value = rawUrl?.trim() ?? ''

  if (!value || value === 'mock' || value === 'MOCK') {
    return ''
  }

  return value.replace(/\/+$/, '')
}

export function isMockMode() {
  return !API_BASE_URL
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const headers = new Headers(init.headers ?? {})

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (!response.ok) {
    const responseText = await response.text()
    const message = responseText || response.statusText || 'Request failed.'
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}
