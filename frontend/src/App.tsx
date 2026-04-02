import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchDatasetTable,
  fetchForecastJobStatus,
  inspectDataset,
  runForecast,
  startAllFirmsForecastJob,
} from './api';
import './index.css';
import { AnalysisProgress } from './components/AnalysisProgress';
import { AnalysisSummaryPanel, type AnalysisHistoryEntry } from './components/AnalysisSummaryPanel';
import { AllFirmsPanel } from './components/AllFirmsPanel';
import { AllFirmsResultsTable } from './components/AllFirmsResultsTable';
import { ComparisonBoard } from './components/ComparisonBoard';
import { DataUploadPanel } from './components/DataUploadPanel';
import { PreviewTable } from './components/PreviewTable';
import { UploadPanel } from './components/UploadPanel';
import type {
  AllFirmsRunResponse,
  AllFirmsJobStatusResponse,
  DatasetInspectResponse,
  DatasetTableResponse,
  ExecutionLog,
  ForecastRunResponse,
} from './types';

const ANALYSIS_STEPS = [
  'Uploading and validating the selected spreadsheet',
  'Preparing the entity series and holdout split',
  'Running the native naive baseline',
  'Fitting the ARIMA model and intervals',
  'Running Chronos-Bolt from the local cache',
  'Computing metrics and building the comparison view',
];

const ANALYSIS_MIN_DURATION_MS = 6500;
const ANALYSIS_COMPLETE_PAUSE_MS = 900;
const DATASET_TABLE_PAGE_SIZE = 200;
const SINGLE_HISTORY_STORAGE_KEY = 'arima-chronos-single-history';
const ALL_HISTORY_STORAGE_KEY = 'arima-chronos-all-history';
const HISTORY_RESET_MARKER = 'arima-chronos-history-reset-20260402';
const MAX_HISTORY_ITEMS = 8;
type DashboardTab = 'upload' | 'all' | 'single';
type AnalysisScope = 'all' | 'single';
type AnalysisLogEntry = {
  id: string;
  timestamp: string;
  message: string;
  stepIndex: number;
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatLogTimestamp(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getEntityOptions(metadata: DatasetInspectResponse | null, entityColumn: string) {
  if (!metadata || !entityColumn) {
    return [];
  }

  if (metadata.entityValueOptions?.[entityColumn]) {
    return metadata.entityValueOptions[entityColumn];
  }

  if (metadata.defaults.entityColumn === entityColumn) {
    return metadata.entityValues ?? [];
  }

  return [];
}

function sanitizeStepIndex(stepIndex: number) {
  return Math.max(0, Math.min(stepIndex, ANALYSIS_STEPS.length - 1));
}

function createHistoryLog(message: string, stepIndex: number, timestamp = formatLogTimestamp()): AnalysisLogEntry {
  return {
    id: `${timestamp}-${stepIndex}-${message}`,
    timestamp,
    message,
    stepIndex: sanitizeStepIndex(stepIndex),
  };
}

function buildStepLogs() {
  return ANALYSIS_STEPS.map((step, index) => createHistoryLog(`Step ${index + 1}/${ANALYSIS_STEPS.length}: ${step}`, index));
}

function hasRestorableSavedView(entry: unknown): entry is AnalysisHistoryEntry {
  if (!entry || typeof entry !== 'object' || !('savedView' in entry)) {
    return false;
  }

  const savedView = (entry as { savedView: AnalysisHistoryEntry['savedView'] }).savedView;

  if (!savedView || typeof savedView !== 'object' || !('scope' in savedView)) {
    return false;
  }

  if (savedView.scope === 'single') {
    return (
      !!savedView.forecastResult &&
      Array.isArray(savedView.forecastResult.series?.labels) &&
      Array.isArray(savedView.forecastResult.series?.history) &&
      Array.isArray(savedView.forecastResult.series?.actual)
    );
  }

  if (savedView.scope === 'all') {
    return !!savedView.allFirmsResult && Array.isArray(savedView.allFirmsResult.rows);
  }

  return false;
}

function mapExecutionLogsForHistory(logs: ExecutionLog[] | undefined): AnalysisLogEntry[] {
  if (!logs) {
    return [];
  }

  return logs.map((entry) => createHistoryLog(`[backend] ${entry.message}`, entry.stepIndex, entry.timestamp));
}

function ensureHistoryStorageReady() {
  if (typeof window === 'undefined') {
    return;
  }

  if (window.localStorage.getItem(HISTORY_RESET_MARKER)) {
    return;
  }

  window.localStorage.removeItem(SINGLE_HISTORY_STORAGE_KEY);
  window.localStorage.removeItem(ALL_HISTORY_STORAGE_KEY);
  window.localStorage.setItem(HISTORY_RESET_MARKER, '1');
}

function readHistory(storageKey: string): AnalysisHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  ensureHistoryStorageReady();

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is AnalysisHistoryEntry => (
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.label === 'string' &&
      typeof entry.detail === 'string' &&
      typeof entry.elapsedMs === 'number' &&
      Array.isArray(entry.logs) &&
      hasRestorableSavedView(entry)
    ));
  } catch {
    return [];
  }
}

function App() {
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<DashboardTab>('upload');

  const [file, setFile] = useState<File | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<DatasetInspectResponse | null>(null);
  const [tableData, setTableData] = useState<DatasetTableResponse | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [tableSearch, setTableSearch] = useState('');
  const [tableSearchColumn, setTableSearchColumn] = useState('all');
  const [tableSortColumn, setTableSortColumn] = useState('gvkey');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('asc');
  const [tablePage, setTablePage] = useState(1);
  const [holdout, setHoldout] = useState(8);
  const [targetColumn, setTargetColumn] = useState('');
  const [dateColumn, setDateColumn] = useState('');
  const [entityColumn, setEntityColumn] = useState('');
  const [entityValue, setEntityValue] = useState('');
  const [forecastResult, setForecastResult] = useState<ForecastRunResponse | null>(null);
  const [allFirmsResult, setAllFirmsResult] = useState<AllFirmsRunResponse | null>(null);
  const [allFirmsLoading, setAllFirmsLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [analysisStepIndex, setAnalysisStepIndex] = useState(0);
  const [analysisLogs, setAnalysisLogs] = useState<AnalysisLogEntry[]>([]);
  const [analysisElapsedMs, setAnalysisElapsedMs] = useState(0);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [singleRunHistory, setSingleRunHistory] = useState<AnalysisHistoryEntry[]>(() => readHistory(SINGLE_HISTORY_STORAGE_KEY));
  const [allRunHistory, setAllRunHistory] = useState<AnalysisHistoryEntry[]>(() => readHistory(ALL_HISTORY_STORAGE_KEY));
  const [selectedSingleHistoryId, setSelectedSingleHistoryId] = useState<string | null>(null);
  const [selectedAllHistoryId, setSelectedAllHistoryId] = useState<string | null>(null);
  const lastLoggedStepRef = useRef(-1);
  const loggedStepIndicesRef = useRef<Set<number>>(new Set());
  const seenExecutionLogsRef = useRef<Set<string>>(new Set());

  const appendAnalysisLog = useCallback((message: string, stepIndex = Math.max(lastLoggedStepRef.current, 0)) => {
    setAnalysisLogs((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        timestamp: formatLogTimestamp(),
        message,
        stepIndex,
      },
    ]);
  }, []);

  const markAnalysisStep = useCallback((stepIndex: number) => {
    if (loggedStepIndicesRef.current.has(stepIndex)) {
      return;
    }

    loggedStepIndicesRef.current.add(stepIndex);
    lastLoggedStepRef.current = Math.max(lastLoggedStepRef.current, stepIndex);
    appendAnalysisLog(`Step ${stepIndex + 1}/${ANALYSIS_STEPS.length}: ${ANALYSIS_STEPS[stepIndex]}`, stepIndex);
  }, [appendAnalysisLog]);

  const backfillAnalysisSteps = useCallback((finalStepIndex: number) => {
    for (let stepIndex = 0; stepIndex <= finalStepIndex; stepIndex += 1) {
      markAnalysisStep(stepIndex);
    }
  }, [markAnalysisStep]);

  const appendExecutionLogs = useCallback((logs: ExecutionLog[] | undefined) => {
    if (!logs || logs.length === 0) {
      return;
    }

    const unseenLogs = logs.filter((entry) => {
      const key = `${entry.stepIndex}-${entry.timestamp}-${entry.message}`;
      if (seenExecutionLogsRef.current.has(key)) {
        return false;
      }
      seenExecutionLogsRef.current.add(key);
      return true;
    });

    if (unseenLogs.length === 0) {
      return;
    }

    setAnalysisLogs((current) => [
      ...current,
      ...unseenLogs.map((entry, index) => ({
        id: `backend-${entry.timestamp}-${entry.stepIndex}-${index}-${current.length}`,
        timestamp: entry.timestamp,
        message: `[backend] ${entry.message}`,
        stepIndex: sanitizeStepIndex(entry.stepIndex),
      })),
    ]);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SINGLE_HISTORY_STORAGE_KEY, JSON.stringify(singleRunHistory));
  }, [singleRunHistory]);

  useEffect(() => {
    window.localStorage.setItem(ALL_HISTORY_STORAGE_KEY, JSON.stringify(allRunHistory));
  }, [allRunHistory]);

  useEffect(() => {
    if (!selectedSingleHistoryId && singleRunHistory.length > 0) {
      setSelectedSingleHistoryId(singleRunHistory[0].id);
    }
  }, [singleRunHistory, selectedSingleHistoryId]);

  useEffect(() => {
    if (!selectedAllHistoryId && allRunHistory.length > 0) {
      setSelectedAllHistoryId(allRunHistory[0].id);
    }
  }, [allRunHistory, selectedAllHistoryId]);

  useEffect(() => {
    if (!selectedSingleHistoryId) {
      return;
    }

    const selectedHistory = singleRunHistory.find((history) => history.id === selectedSingleHistoryId);
    if (!selectedHistory || selectedHistory.savedView.scope !== 'single') {
      return;
    }

    setForecastResult(selectedHistory.savedView.forecastResult);
    setTargetColumn(selectedHistory.savedView.targetColumn);
    setDateColumn(selectedHistory.savedView.dateColumn);
    setEntityColumn(selectedHistory.savedView.entityColumn);
    setEntityValue(selectedHistory.savedView.entityValue);
    setHoldout(selectedHistory.savedView.holdout);
  }, [selectedSingleHistoryId, singleRunHistory]);

  useEffect(() => {
    if (!selectedAllHistoryId) {
      return;
    }

    const selectedHistory = allRunHistory.find((history) => history.id === selectedAllHistoryId);
    if (!selectedHistory || selectedHistory.savedView.scope !== 'all') {
      return;
    }

    setAllFirmsResult(selectedHistory.savedView.allFirmsResult);
    setTargetColumn(selectedHistory.savedView.targetColumn);
    setDateColumn(selectedHistory.savedView.dateColumn);
    setEntityColumn(selectedHistory.savedView.entityColumn);
    setHoldout(selectedHistory.savedView.holdout);
  }, [selectedAllHistoryId, allRunHistory]);

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    setAnalysisStepIndex(0);
    setAnalysisElapsedMs(0);
    setAnalysisStartedAt(Date.now());
    setAnalysisLogs([
      {
        id: `start-${Date.now()}`,
        timestamp: formatLogTimestamp(),
        message: 'Analysis started.',
        stepIndex: 0,
      },
    ]);
    lastLoggedStepRef.current = -1;
    loggedStepIndicesRef.current = new Set();
    seenExecutionLogsRef.current = new Set();
    return undefined;
  }, [running]);

  useEffect(() => {
    if (!running || analysisStartedAt === null) {
      return undefined;
    }

    setAnalysisElapsedMs(Date.now() - analysisStartedAt);

    const interval = window.setInterval(() => {
      setAnalysisElapsedMs(Date.now() - analysisStartedAt);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [running, analysisStartedAt]);

  useEffect(() => {
    if (!running) {
      lastLoggedStepRef.current = -1;
      return;
    }

    if (analysisStepIndex === lastLoggedStepRef.current) {
      return;
    }

    markAnalysisStep(analysisStepIndex);
  }, [running, analysisStepIndex, markAnalysisStep]);

  useEffect(() => {
    if (!file || !metadata) {
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      setTableLoading(true);
      try {
        const response = await fetchDatasetTable({
          file,
          page: tablePage,
          pageSize: DATASET_TABLE_PAGE_SIZE,
          search: tableSearch || undefined,
          searchColumn: tableSearchColumn,
          sortColumn: tableSortColumn,
          sortDirection: tableSortDirection,
        });
        setTableData((current) => {
          if (tablePage === 1 || !current) {
            return response;
          }

          return {
            ...response,
            rows: [...current.rows, ...response.rows],
          };
        });
      } catch (tableError) {
        setError((tableError as Error).message);
      } finally {
        setTableLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [file, metadata, tablePage, tableSearch, tableSearchColumn, tableSortColumn, tableSortDirection]);

  useEffect(() => {
    if (!metadata || !entityColumn) {
      return;
    }

    const nextOptions = getEntityOptions(metadata, entityColumn);
    setEntityValue((currentValue) => {
      if (nextOptions.length === 0) {
        return '';
      }

      if (!currentValue || !nextOptions.includes(currentValue)) {
        return nextOptions[0];
      }

      return currentValue;
    });
  }, [metadata, entityColumn]);

  const saveAnalysisHistory = useCallback((scope: AnalysisScope, entry: AnalysisHistoryEntry) => {
    const updateHistory = (current: AnalysisHistoryEntry[]) => [entry, ...current].slice(0, MAX_HISTORY_ITEMS);

    if (scope === 'single') {
      setSingleRunHistory((current) => updateHistory(current));
      setSelectedSingleHistoryId(entry.id);
      return;
    }

    setAllRunHistory((current) => updateHistory(current));
    setSelectedAllHistoryId(entry.id);
  }, []);

  const clearAnalysisHistory = useCallback((scope: AnalysisScope) => {
    if (scope === 'single') {
      setSingleRunHistory([]);
      setSelectedSingleHistoryId(null);
      window.localStorage.removeItem(SINGLE_HISTORY_STORAGE_KEY);
      return;
    }

    setAllRunHistory([]);
    setSelectedAllHistoryId(null);
    window.localStorage.removeItem(ALL_HISTORY_STORAGE_KEY);
  }, []);

  async function handleFileChange(nextFile: File | null) {
    setPendingFile(nextFile);
    if (!nextFile) {
      setFile(null);
    }
  }

  async function handleLoadDataset() {
    if (!pendingFile) {
      setError('Choose a file before loading the dataset.');
      return;
    }

    setDatasetLoading(true);
    setFile(pendingFile);
    setMetadata(null);
    setTableData(null);
    setForecastResult(null);
    setAllFirmsResult(null);
    setError('');
    setTableSearch('');
    setTableSearchColumn('all');
    setTableSortColumn('gvkey');
    setTableSortDirection('asc');
    setTablePage(1);

    try {
      const nextMetadata = await inspectDataset(pendingFile);
      setMetadata(nextMetadata);
      setTargetColumn(nextMetadata.defaults.targetColumn ?? '');
      setDateColumn(nextMetadata.defaults.dateColumn ?? '');
      setEntityColumn(nextMetadata.defaults.entityColumn ?? '');
      setEntityValue(nextMetadata.defaults.entityValue ?? '');
      setTableSortColumn(nextMetadata.defaults.entityColumn ?? 'gvkey');
    } catch (inspectError) {
      setError((inspectError as Error).message);
      setFile(null);
    } finally {
      setDatasetLoading(false);
    }
  }

  async function handleRunAllFirms() {
    if (!file || !targetColumn || !entityColumn) {
      setError('Upload a dataset and choose the firm identifier field before running all-firm analysis.');
      return;
    }

    const startedAt = Date.now();
    setAllFirmsLoading(true);
    setRunning(true);
    setAnalysisStepIndex(0);
    setError('');

    try {
      appendAnalysisLog(`Submitting all-firms forecast request for target "${targetColumn}" grouped by "${entityColumn}".`, 0);
      const { jobId } = await startAllFirmsForecastJob({
        file,
        targetColumn,
        holdout,
        entityColumn,
        dateColumn: dateColumn || undefined,
      });
      appendAnalysisLog(`Started background batch job ${jobId.slice(0, 8)} for all-firms forecasting.`, 0);

      let jobStatus: AllFirmsJobStatusResponse | null = null;
      while (!jobStatus || jobStatus.status === 'queued' || jobStatus.status === 'running') {
        jobStatus = await fetchForecastJobStatus(jobId);
        setAnalysisStepIndex(sanitizeStepIndex(jobStatus.currentStepIndex));
        appendExecutionLogs(jobStatus.logs);

        if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
          break;
        }

        await wait(1000);
      }

      if (!jobStatus) {
        throw new Error('The all-firms job did not return a status.');
      }

      if (jobStatus.status === 'failed') {
        throw new Error(jobStatus.error ?? 'The all-firms job failed.');
      }

      if (!jobStatus.result) {
        throw new Error('The all-firms job finished without a result payload.');
      }

      setAllFirmsResult(jobStatus.result);
      backfillAnalysisSteps(ANALYSIS_STEPS.length - 1);
      setAnalysisStepIndex(ANALYSIS_STEPS.length - 1);
      appendAnalysisLog(
        `All-firms forecast response received. Processed ${jobStatus.result.summary.processedEntities} firm(s), skipped ${jobStatus.result.summary.skippedEntities}.`,
        ANALYSIS_STEPS.length - 1,
      );

      const elapsed = Date.now() - startedAt;
      const historyLogs = [
        createHistoryLog('Analysis started.', 0),
        ...buildStepLogs(),
        createHistoryLog(`Submitting all-firms forecast request for target "${targetColumn}" grouped by "${entityColumn}".`, 0),
        createHistoryLog(`Started background batch job ${jobId.slice(0, 8)} for all-firms forecasting.`, 0),
        ...mapExecutionLogsForHistory(jobStatus.logs),
        createHistoryLog(
          `All-firms forecast response received. Processed ${jobStatus.result.summary.processedEntities} firm(s), skipped ${jobStatus.result.summary.skippedEntities}.`,
          ANALYSIS_STEPS.length - 1,
        ),
      ];
      saveAnalysisHistory('all', {
        id: `all-${Date.now()}`,
        label: `${targetColumn} by ${entityColumn}`,
        detail: `${jobStatus.result.summary.processedEntities}/${jobStatus.result.summary.totalEntities} firms processed, ${jobStatus.result.summary.skippedEntities} skipped`,
        elapsedMs: elapsed,
        logs: historyLogs,
        savedView: {
          scope: 'all',
          allFirmsResult: jobStatus.result,
          targetColumn,
          dateColumn,
          entityColumn,
          holdout,
        },
      });
      const remaining = Math.max(ANALYSIS_MIN_DURATION_MS - elapsed, 0);
      await wait(remaining + ANALYSIS_COMPLETE_PAUSE_MS);
    } catch (runError) {
      appendAnalysisLog(`Run failed: ${(runError as Error).message}`);
      setError((runError as Error).message);
    } finally {
      setRunning(false);
      setAllFirmsLoading(false);
      setAnalysisStartedAt(null);
    }
  }

  async function handleRun() {
    if (!file || !targetColumn || !entityColumn || !entityValue) {
      setError('Choose a single firm before running the model comparison.');
      return;
    }
    const startedAt = Date.now();
    setRunning(true);
    setAnalysisStepIndex(0);
    setError('');
    try {
      appendAnalysisLog(`Submitting single-firm forecast request for ${entityColumn}=${entityValue} using target "${targetColumn}".`, 0);
      const response = await runForecast({
        file,
        targetColumn,
        holdout,
        dateColumn: dateColumn || undefined,
        entityColumn: entityColumn || undefined,
        entityValue: entityValue || undefined,
      });
      setForecastResult(response);
      backfillAnalysisSteps(ANALYSIS_STEPS.length - 1);
      setAnalysisStepIndex(ANALYSIS_STEPS.length - 1);
      appendExecutionLogs(response.executionLogs);
      appendAnalysisLog(
        `Forecast response received. Statuses: Naive=${response.models.naive.status}, ARIMA=${response.models.arima.status}, Chronos=${response.models.chronos.status}.`,
        ANALYSIS_STEPS.length - 1,
      );
      if (response.models.chronos.status === 'error' && response.models.chronos.error) {
        appendAnalysisLog(`Chronos error: ${response.models.chronos.error}`, ANALYSIS_STEPS.length - 1);
      }

      const elapsed = Date.now() - startedAt;
      const entityLabel = response.series.entity ?? entityValue;
      const completionMessage = `Forecast response received. Statuses: Naive=${response.models.naive.status}, ARIMA=${response.models.arima.status}, Chronos=${response.models.chronos.status}.`;
      const historyLogs = [
        createHistoryLog('Analysis started.', 0),
        ...buildStepLogs(),
        createHistoryLog(`Submitting single-firm forecast request for ${entityColumn}=${entityValue} using target "${targetColumn}".`, 0),
        ...mapExecutionLogsForHistory(response.executionLogs),
        createHistoryLog(completionMessage, ANALYSIS_STEPS.length - 1),
        ...(response.models.chronos.status === 'error' && response.models.chronos.error
          ? [createHistoryLog(`Chronos error: ${response.models.chronos.error}`, ANALYSIS_STEPS.length - 1)]
          : []),
      ];
      saveAnalysisHistory('single', {
        id: `single-${Date.now()}`,
        label: `${entityColumn}: ${entityLabel}`,
        detail: `${targetColumn} holdout ${response.series.holdout} periods`,
        elapsedMs: elapsed,
        logs: historyLogs,
        savedView: {
          scope: 'single',
          forecastResult: response,
          targetColumn,
          dateColumn,
          entityColumn,
          entityValue,
          holdout,
        },
      });
      const remaining = Math.max(ANALYSIS_MIN_DURATION_MS - elapsed, 0);
      await wait(remaining + ANALYSIS_COMPLETE_PAUSE_MS);
    } catch (runError) {
      appendAnalysisLog(`Run failed: ${(runError as Error).message}`);
      setError((runError as Error).message);
    } finally {
      setRunning(false);
      setAnalysisStartedAt(null);
      loggedStepIndicesRef.current = new Set();
    }
  }

  const canShowPreview = useMemo(() => Boolean(metadata), [metadata]);

  return (
    <main className="app-shell">
      <AnalysisProgress
        running={running}
        currentStepIndex={analysisStepIndex}
        steps={ANALYSIS_STEPS}
        logs={analysisLogs}
        elapsedMs={analysisElapsedMs}
      />

      <section className="hero-panel">
        <div>
          <p className="eyebrow">Arima · Chronos</p>
          <h1>Arima/Chronos Forecasting Dashboard</h1>
          <p className="hero-copy">
            Upload a spreadsheet or CSV, select a firm series such as ROA or ROE, compare Naive, ARIMA,
            and Chronos forecasts with side-by-side holdout metrics and forecast charts.
          </p>
        </div>
      </section>

      <section className="tab-bar" aria-label="Dashboard mode">
        <button
          type="button"
          className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          Data Upload
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Firms
        </button>
        <button
          type="button"
          className={`tab-button ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          Single Firm
        </button>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      {activeTab === 'upload' ? (
        <div className="stack-gap">
          <DataUploadPanel
            file={pendingFile}
            metadata={metadata}
            loading={datasetLoading}
            tableReady={Boolean(tableData)}
            onFileSelect={handleFileChange}
            onLoadData={handleLoadDataset}
          />

          {canShowPreview ? (
            tableData ? (
              <PreviewTable
                tableData={tableData}
                search={tableSearch}
                searchColumn={tableSearchColumn}
                sortColumn={tableSortColumn}
                sortDirection={tableSortDirection}
                loading={tableLoading}
                onSearchChange={(value) => {
                  setTableSearch(value);
                  setTablePage(1);
                }}
                onSearchColumnChange={(value) => {
                  setTableSearchColumn(value);
                  setTablePage(1);
                }}
                onSortColumnChange={(value) => {
                  setTableSortColumn(value);
                  setTablePage(1);
                }}
                onSortDirectionChange={(value) => {
                  setTableSortDirection(value);
                  setTablePage(1);
                }}
                onLoadMore={() => {
                  if (!tableLoading && tableData && tableData.page < tableData.totalPages) {
                    setTablePage(tableData.page + 1);
                  }
                }}
              />
            ) : (
              <section className="panel stack-gap">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Dataset browser</p>
                    <h2>2. Explore the full uploaded table</h2>
                  </div>
                  <span className="status-chip">Loading</span>
                </div>
                <p className="helper-copy">
                  The dataset metadata is loaded. Building the full table preview now...
                </p>
              </section>
            )
          ) : null}
        </div>
      ) : activeTab === 'all' ? (
        <div className="layout-grid">
          <div className="main-column stack-gap">
            <AllFirmsPanel
              metadata={metadata}
              holdout={holdout}
              targetColumn={targetColumn}
              dateColumn={dateColumn}
              entityColumn={entityColumn}
              loading={allFirmsLoading}
              onHoldoutChange={setHoldout}
              onTargetColumnChange={setTargetColumn}
              onDateColumnChange={setDateColumn}
              onEntityColumnChange={setEntityColumn}
              onRun={handleRunAllFirms}
            />

            <AllFirmsResultsTable result={allFirmsResult} />
          </div>

          <aside className="side-column stack-gap">
            {!running ? (
              <AnalysisSummaryPanel
                steps={ANALYSIS_STEPS}
                histories={allRunHistory}
                selectedHistoryId={selectedAllHistoryId}
                onSelectHistory={setSelectedAllHistoryId}
                onClearHistory={() => clearAnalysisHistory('all')}
              />
            ) : null}
          </aside>
        </div>
      ) : (
        <div className="layout-grid">
          <div className="main-column stack-gap">
            <UploadPanel
              metadata={metadata}
              holdout={holdout}
              targetColumn={targetColumn}
              dateColumn={dateColumn}
              entityColumn={entityColumn}
              entityValue={entityValue}
              loading={running}
              onHoldoutChange={setHoldout}
              onTargetColumnChange={setTargetColumn}
              onDateColumnChange={setDateColumn}
              onEntityColumnChange={setEntityColumn}
              onEntityValueChange={setEntityValue}
              onRun={handleRun}
            />

            {forecastResult ? <ComparisonBoard forecast={forecastResult} /> : null}
          </div>

          <aside className="side-column stack-gap">
            {!running ? (
              <AnalysisSummaryPanel
                steps={ANALYSIS_STEPS}
                histories={singleRunHistory}
                selectedHistoryId={selectedSingleHistoryId}
                onSelectHistory={setSelectedSingleHistoryId}
                onClearHistory={() => clearAnalysisHistory('single')}
              />
            ) : null}

          </aside>
        </div>
      )}
    </main>
  );
}

export default App;
