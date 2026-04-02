import type { DatasetInspectResponse } from '../types';

type Props = {
  metadata: DatasetInspectResponse | null;
  holdout: number;
  targetColumn: string;
  dateColumn: string;
  entityColumn: string;
  loading: boolean;
  onHoldoutChange: (value: number) => void;
  onTargetColumnChange: (value: string) => void;
  onDateColumnChange: (value: string) => void;
  onEntityColumnChange: (value: string) => void;
  onRun: () => void;
};

export function AllFirmsPanel({
  metadata,
  holdout,
  targetColumn,
  dateColumn,
  entityColumn,
  loading,
  onHoldoutChange,
  onTargetColumnChange,
  onDateColumnChange,
  onEntityColumnChange,
  onRun,
}: Props) {
  if (!metadata) {
    return (
      <section className="panel">
        <p className="helper-copy">Upload a dataset in the Data Upload tab first, then return here to run all-firm analysis.</p>
      </section>
    );
  }

  const preferredEntityColumns = metadata.entityColumns.filter((column) => column === 'tic' || column === 'conm' || column === 'gvkey');
  const visibleEntityColumns = preferredEntityColumns.length > 0 ? preferredEntityColumns : metadata.entityColumns;

  function getEntityColumnLabel(column: string) {
    if (column === 'tic') return 'Ticker';
    if (column === 'conm') return 'Company name';
    if (column === 'gvkey') return 'GVKEY';
    return column;
  }

  return (
    <section className="panel stack-gap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">All firms workflow</p>
          <h2>Run Naive, ARIMA, and Chronos across all firms</h2>
        </div>
        <span className="status-chip">Batch analysis</span>
      </div>

      <div className="control-grid">
        <label>
          <span>Holdout window</span>
          <select value={holdout} onChange={(event) => onHoldoutChange(Number(event.target.value))}>
            <option value={4}>4 periods</option>
            <option value={8}>8 periods</option>
            <option value={12}>12 periods</option>
          </select>
        </label>
        <label>
          <span>Target metric</span>
          <select value={targetColumn} onChange={(event) => onTargetColumnChange(event.target.value)}>
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
            <option value="">Use current row order</option>
            {metadata.dateColumns.map((column) => (
              <option key={column} value={column}>
                {column}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Group firms by</span>
          <select value={entityColumn} onChange={(event) => onEntityColumnChange(event.target.value)}>
            <option value="">Select ticker, company name, or GVKEY</option>
            {visibleEntityColumns.map((column) => (
              <option key={column} value={column}>
                {getEntityColumnLabel(column)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="helper-copy">
        This runs the same comparison logic across every firm in the uploaded dataset and summarizes the
        holdout metrics by firm using the selected grouping field.
      </p>

      <div className="subtle-grid">
        <div className="meta-card">
          <strong>{targetColumn || '—'}</strong>
          <span>selected target metric</span>
        </div>
        <div className="meta-card">
          <strong>{holdout}</strong>
          <span>holdout periods</span>
        </div>
        <div className="meta-card">
          <strong>{entityColumn ? getEntityColumnLabel(entityColumn) : '—'}</strong>
          <span>firm grouping field</span>
        </div>
        <div className="meta-card">
          <strong>{dateColumn || 'Current row order'}</strong>
          <span>{dateColumn ? 'date ordering column' : 'using current row order'}</span>
        </div>
      </div>

      <p className="helper-copy">
        The batch summary below will show how many firms were processed, skipped, and which model performed
        best for each firm.
      </p>

      <button className="primary-button" type="button" disabled={!targetColumn || !entityColumn || loading} onClick={onRun}>
        {loading ? 'Running all firms...' : 'Run All Firms Analysis'}
      </button>
    </section>
  );
}
