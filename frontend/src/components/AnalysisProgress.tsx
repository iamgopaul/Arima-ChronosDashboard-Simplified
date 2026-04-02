type Props = {
  running: boolean;
  currentStepIndex: number;
  steps: string[];
  logs: Array<{
    id: string;
    timestamp: string;
    message: string;
    stepIndex: number;
  }>;
  elapsedMs: number;
};

function formatElapsed(elapsedMs: number) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function AnalysisProgress({ running, currentStepIndex, steps, logs, elapsedMs }: Props) {
  if (!running) {
    return null;
  }

  const safeStepIndex = Math.min(currentStepIndex, steps.length - 1);
  const progress = ((safeStepIndex + 1) / steps.length) * 100;

  return (
    <div className="analysis-overlay" role="status" aria-live="polite" aria-label="Running analysis">
      <div className="analysis-modal">
        <div className="spinner-ring" aria-hidden="true" />
        <p className="eyebrow">Analysis in progress</p>
        <h2>Running forecasting models and preparing comparisons</h2>
        <div className="analysis-meta-row">
          <span className="status-chip">Elapsed {formatElapsed(elapsedMs)}</span>
          <span className="helper-copy">Timestamped run log</span>
        </div>

        <div className="progress-bar-shell" aria-hidden="true">
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>

        <ol className="progress-step-list">
          {steps.map((step, index) => {
            const state =
              index < safeStepIndex ? 'done' : index === safeStepIndex ? 'active' : 'pending';
            const stepLogs = logs.filter((entry) => entry.stepIndex === index);

            return (
              <li key={step} className={`progress-step ${state}`}>
                <span className="progress-step-marker">{index < safeStepIndex ? '✓' : index + 1}</span>
                <div className="progress-step-content">
                  <span className="progress-step-title">{step}</span>
                  {stepLogs.length > 0 ? (
                    <div className="progress-step-log-list" role="log" aria-live="polite">
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
      </div>
    </div>
  );
}
