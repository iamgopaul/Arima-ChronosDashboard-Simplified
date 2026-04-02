import type {
  AllFirmsJobStatusResponse,
  AllFirmsRunResponse,
  DatasetInspectResponse,
  DatasetTableResponse,
  EnvironmentResponse,
  ForecastJobStartResponse,
  ForecastRunResponse,
  GretlCompareResponse,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SINGLE_FIRM_TIMEOUT_MS = 90_000;
const ALL_FIRMS_TIMEOUT_MS = 10 * 60_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`The request took longer than ${Math.ceil(timeoutMs / 1000)} seconds. Please try again.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function ensureJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ detail: 'Request failed.' }));
    throw new Error(payload.detail ?? 'Request failed.');
  }
  return response.json() as Promise<T>;
}

export async function fetchEnvironment(): Promise<EnvironmentResponse> {
  const response = await fetchWithTimeout(`${API_BASE}/api/environment`);
  return ensureJson<EnvironmentResponse>(response);
}

export async function inspectDataset(file: File): Promise<DatasetInspectResponse> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetchWithTimeout(`${API_BASE}/api/datasets/inspect`, { method: 'POST', body: form });
  return ensureJson<DatasetInspectResponse>(response);
}

export async function fetchDatasetTable(payload: {
  file: File;
  page: number;
  pageSize: number;
  search?: string;
  searchColumn?: string;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
}): Promise<DatasetTableResponse> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('page', String(payload.page));
  form.append('page_size', String(payload.pageSize));
  if (payload.search) form.append('search', payload.search);
  if (payload.searchColumn && payload.searchColumn !== 'all') form.append('search_column', payload.searchColumn);
  if (payload.sortColumn) form.append('sort_column', payload.sortColumn);
  if (payload.sortDirection) form.append('sort_direction', payload.sortDirection);

  const response = await fetchWithTimeout(`${API_BASE}/api/datasets/table`, { method: 'POST', body: form });
  return ensureJson<DatasetTableResponse>(response);
}

export async function runForecast(payload: {
  file: File;
  targetColumn: string;
  holdout: number;
  dateColumn?: string;
  entityColumn?: string;
  entityValue?: string;
}): Promise<ForecastRunResponse> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('target_column', payload.targetColumn);
  form.append('holdout', String(payload.holdout));
  if (payload.dateColumn) form.append('date_column', payload.dateColumn);
  if (payload.entityColumn) form.append('entity_column', payload.entityColumn);
  if (payload.entityValue) form.append('entity_value', payload.entityValue);

  const response = await fetchWithTimeout(
    `${API_BASE}/api/forecasts/run`,
    { method: 'POST', body: form },
    SINGLE_FIRM_TIMEOUT_MS,
  );
  return ensureJson<ForecastRunResponse>(response);
}

export async function runAllFirmsForecast(payload: {
  file: File;
  targetColumn: string;
  holdout: number;
  entityColumn: string;
  dateColumn?: string;
}): Promise<AllFirmsRunResponse> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('target_column', payload.targetColumn);
  form.append('holdout', String(payload.holdout));
  form.append('entity_column', payload.entityColumn);
  if (payload.dateColumn) form.append('date_column', payload.dateColumn);

  const response = await fetchWithTimeout(
    `${API_BASE}/api/forecasts/run-all`,
    { method: 'POST', body: form },
    ALL_FIRMS_TIMEOUT_MS,
  );
  return ensureJson<AllFirmsRunResponse>(response);
}

export async function startAllFirmsForecastJob(payload: {
  file: File;
  targetColumn: string;
  holdout: number;
  entityColumn: string;
  dateColumn?: string;
}): Promise<ForecastJobStartResponse> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('target_column', payload.targetColumn);
  form.append('holdout', String(payload.holdout));
  form.append('entity_column', payload.entityColumn);
  if (payload.dateColumn) form.append('date_column', payload.dateColumn);

  const response = await fetchWithTimeout(`${API_BASE}/api/forecasts/run-all/start`, { method: 'POST', body: form });
  return ensureJson<ForecastJobStartResponse>(response);
}

export async function fetchForecastJobStatus(jobId: string): Promise<AllFirmsJobStatusResponse> {
  const response = await fetchWithTimeout(
    `${API_BASE}/api/forecasts/jobs/${jobId}`,
    { method: 'GET' },
    ALL_FIRMS_TIMEOUT_MS,
  );
  return ensureJson<AllFirmsJobStatusResponse>(response);
}

export async function inspectGretl(file: File): Promise<DatasetInspectResponse> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetchWithTimeout(`${API_BASE}/api/gretl/inspect`, { method: 'POST', body: form });
  return ensureJson<DatasetInspectResponse>(response);
}

export async function compareGretl(payload: {
  file: File;
  actualColumn: string;
  forecastColumn: string;
  dateColumn?: string;
}): Promise<GretlCompareResponse> {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('actual_column', payload.actualColumn);
  form.append('forecast_column', payload.forecastColumn);
  if (payload.dateColumn) form.append('date_column', payload.dateColumn);

  const response = await fetchWithTimeout(`${API_BASE}/api/gretl/compare`, { method: 'POST', body: form });
  return ensureJson<GretlCompareResponse>(response);
}
