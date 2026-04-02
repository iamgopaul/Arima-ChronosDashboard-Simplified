import type { DatasetInspectResponse } from '../types';

type Props = {
  file: File | null;
  metadata: DatasetInspectResponse | null;
  actualColumn: string;
  forecastColumn: string;
  dateColumn: string;
  loading: boolean;
  onFileChange: (file: File | null) => void;
  onActualColumnChange: (value: string) => void;
  onForecastColumnChange: (value: string) => void;
  onDateColumnChange: (value: string) => void;
  onRun: () => void;
};

export function GretlPanel({
  file,
  metadata,
  actualColumn,
  forecastColumn,
  dateColumn,
  loading,
  onFileChange,
  onActualColumnChange,
  onForecastColumnChange,
  onDateColumnChange,
  onRun,
}: Props) {
  return (
    <section className="panel stack-gap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Optional</p>
          <h2>5. Import Gretl outputs</h2>
        </div>
        <span className="status-chip">Manual compare mode</span>
      </div>

      <label className="upload-box compact">
        <input type="file" accept=".csv,.xls,.xlsx" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
        <span className="upload-title">Upload Gretl output file</span>
        <span className="upload-subtitle">{file ? file.name : 'Pick a Gretl export with actual and forecast columns.'}</span>
      </label>

      {metadata ? (
        <>
          <div className="control-grid compact-grid">
            <label>
              <span>Actual column</span>
              <select value={actualColumn} onChange={(event) => onActualColumnChange(event.target.value)}>
                {metadata.numericColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Forecast column</span>
              <select value={forecastColumn} onChange={(event) => onForecastColumnChange(event.target.value)}>
                {metadata.numericColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Date column</span>
              <select value={dateColumn} onChange={(event) => onDateColumnChange(event.target.value)}>
                <option value="">Use row order</option>
                {metadata.dateColumns.map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="secondary-button" onClick={onRun} disabled={loading || !file}>
            {loading ? 'Comparing Gretl...' : 'Compare Gretl results'}
          </button>
        </>
      ) : (
        <p className="helper-copy">Upload a Gretl result file if you want the dashboard to place it beside the automated models.</p>
      )}
    </section>
  );
}
