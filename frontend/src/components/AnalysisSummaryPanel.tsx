type AnalysisLogEntry = {
  id: string;
  timestamp: string;
  message: string;
  stepIndex: number;
};

type SavedSingleRunView = {
  scope: 'single';
  forecastResult: import('../types').ForecastRunResponse;
  targetColumn: string;
  dateColumn: string;
  entityColumn: string;
  entityValue: string;
  holdout: number;
};

type SavedAllFirmsRunView = {
  scope: 'all';
  allFirmsResult: import('../types').AllFirmsRunResponse;
  targetColumn: string;
  dateColumn: string;
  entityColumn: string;
  holdout: number;
};

export type AnalysisHistoryEntry = {
  id: string;
  label: string;
  detail: string;
  elapsedMs: number;
  logs: AnalysisLogEntry[];
  savedView: SavedSingleRunView | SavedAllFirmsRunView;
};

type Props = {
  steps: string[];
  histories: AnalysisHistoryEntry[];
  selectedHistoryId: string | null;
  onSelectHistory: (historyId: string) => void;
  onClearHistory: () => void;
};

function formatElapsed(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function AnalysisSummaryPanel({ steps, histories, selectedHistoryId, onSelectHistory, onClearHistory }: Props) {
  const selectedHistory =
    histories.find((history) => history.id === selectedHistoryId) ??
    histories[0] ??
    null;

  return (
    <section className="panel stack-gap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Run history</p>
          <h2>Analysis summary</h2>
        </div>
        <div className="summary-actions">
          <span className="status-chip">
            {selectedHistory ? `Elapsed ${formatElapsed(selectedHistory.elapsedMs)}` : 'No saved runs'}
          </span>
          <button
            type="button"
            className="secondary-button history-clear-button"
            onClick={onClearHistory}
            disabled={histories.length === 0}
          >
            Clear history
          </button>
        </div>
      </div>

      {histories.length > 0 && selectedHistory ? (
        <>
          <div className="history-list" role="list" aria-label="Saved analysis runs">
            {histories.map((history) => (
              <button
                key={history.id}
                type="button"
                className={`history-item ${history.id === selectedHistory.id ? 'active' : ''}`}
                onClick={() => onSelectHistory(history.id)}
              >
                <strong>{history.label}</strong>
                <span>{history.detail}</span>
              </button>
            ))}
          </div>

          <ol className="progress-step-list sidebar-step-list">
            {steps.map((step, index) => {
              const stepLogs = selectedHistory.logs.filter((entry) => entry.stepIndex === index);

              return (
                <li key={step} className="progress-step done">
                  <span className="progress-step-marker">✓</span>
                  <div className="progress-step-content">
                    <span className="progress-step-title">{step}</span>
                    {stepLogs.length > 0 ? (
                      <div className="progress-step-log-list">
                        {stepLogs.map((entry) => (
                          <div key={entry.id} className="progress-step-log-entry">
                            <span className="progress-step-log-time">{entry.timestamp}</span>
                            <span className="progress-step-log-message">{entry.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="helper-copy">
          No restorable history is saved right now. Run a new analysis and it will appear here with the full results.
        </p>
      )}
    </section>
  );
}
