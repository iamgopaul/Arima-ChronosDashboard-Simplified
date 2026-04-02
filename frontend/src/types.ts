export type DatasetInspectResponse = {
  rowCount: number;
  columns: string[];
  numericColumns: string[];
  dateColumns: string[];
  entityColumns: string[];
  defaults: {
    targetColumn: string | null;
    dateColumn: string | null;
    entityColumn: string | null;
    entityValue: string | null;
  };
  entityValues: string[];
  entityValueOptions?: Record<string, string[]>;
  entityValueCounts?: Record<string, Record<string, number>>;
  entityDisplayMap?: Record<string, Record<string, string>>;
  preview: Record<string, string | number | null>[];
};

export type DatasetTableResponse = {
  columns: string[];
  rows: Record<string, string | number | null>[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  searchColumns: string[];
  sortColumns: string[];
};

export type ModelMetrics = {
  mae: number;
  rmse: number;
  mape: number | null;
  mase: number | null;
};

export type ModelResult = {
  name: string;
  status: 'ok' | 'error';
  error?: string;
  mean: number[];
  lo80: number[] | null;
  hi80: number[] | null;
  lo95: number[] | null;
  hi95: number[] | null;
  metrics: ModelMetrics | null;
  order?: { p: number; d: number; q: number };
  model?: string;
};

export type ExecutionLog = {
  stepIndex: number;
  timestamp: string;
  message: string;
};

export type ForecastRunResponse = {
  series: {
    name: string;
    entity: string | null;
    history: number[];
    labels: string[];
    holdoutLabels: string[];
    actual: number[];
    holdout: number;
  };
  models: {
    naive: ModelResult;
    arima: ModelResult;
    chronos: ModelResult;
  };
  executionLogs?: ExecutionLog[];
};

export type AllFirmMetrics = {
  mae: number;
  rmse: number;
  mape: number | null;
  mase: number | null;
};

export type AllFirmsRunResponse = {
  summary: {
    entityColumn: string;
    targetColumn: string;
    holdout: number;
    totalEntities: number;
    processedEntities: number;
    skippedEntities: number;
  };
  executionLogs?: ExecutionLog[];
  rows: Array<{
    entityValue: string;
    gvkey: string | null;
    tic: string | null;
    conm: string | null;
    status: 'ok' | 'skipped';
    observations: number;
    bestModel: string | null;
    note?: string;
    models: {
      naive: AllFirmMetrics | null;
      arima: AllFirmMetrics | null;
      chronos: AllFirmMetrics | null;
    };
  }>;
};

export type ForecastJobStartResponse = {
  jobId: string;
};

export type AllFirmsJobStatusResponse = {
  jobId: string;
  kind: 'all-firms';
  status: 'queued' | 'running' | 'completed' | 'failed';
  currentStepIndex: number;
  logs: ExecutionLog[];
  result: AllFirmsRunResponse | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type EnvironmentResponse = {
  pythonVersion: string | null;
  rVersion: string | null;
  gretl: {
    installed: boolean;
    command: string | null;
    version: string | null;
  };
  packages: Record<string, string | null>;
};

export type GretlCompareResponse = {
  name: string;
  status: 'ok';
  labels: string[];
  actual: number[];
  forecast: number[];
  metrics: ModelMetrics;
};
