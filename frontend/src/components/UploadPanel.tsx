import type { DatasetInspectResponse } from '../types';

type Props = {
  metadata: DatasetInspectResponse | null;
  holdout: number;
  targetColumn: string;
  dateColumn: string;
  entityColumn: string;
  entityValue: string;
  loading: boolean;
  onHoldoutChange: (value: number) => void;
  onTargetColumnChange: (value: string) => void;
  onDateColumnChange: (value: string) => void;
  onEntityColumnChange: (value: string) => void;
  onEntityValueChange: (value: string) => void;
  onRun: () => void;
};

export function UploadPanel({
  metadata,
  holdout,
  targetColumn,
  dateColumn,
  entityColumn,
  entityValue,
  loading,
  onHoldoutChange,
  onTargetColumnChange,
  onDateColumnChange,
  onEntityColumnChange,
  onEntityValueChange,
  onRun,
}: Props) {
  const canRunSingleFirm = Boolean(targetColumn && entityColumn && entityValue);
  const entityOptions = entityColumn
    ? metadata?.entityValueOptions?.[entityColumn] ??
      (metadata?.defaults.entityColumn === entityColumn ? metadata.entityValues ?? [] : [])
    : [];
  const preferredEntityColumns = metadata
    ? metadata.entityColumns.filter((column) => column === 'tic' || column === 'conm')
    : [];
  const visibleEntityColumns = preferredEntityColumns.length > 0 ? preferredEntityColumns : metadata?.entityColumns ?? [];
  const normalizedQuery = entityValue.trim().toLowerCase();
  const entityDisplayMap = entityColumn ? metadata?.entityDisplayMap?.[entityColumn] ?? {} : {};
  const filteredEntityOptions = entityOptions
    .filter((value) => {
      const label = entityDisplayMap[value] ?? value;
      return !normalizedQuery || value.toLowerCase().includes(normalizedQuery) || label.toLowerCase().includes(normalizedQuery);
    });
  const exactMatch = entityOptions.find((value) => value.toLowerCase() === normalizedQuery) ?? '';
  const selectedFirmDisplay = exactMatch ? entityDisplayMap[exactMatch] ?? exactMatch : '';
  const typedFirmDisplay = entityValue.trim();
  const selectedFirmRows = exactMatch ? metadata?.entityValueCounts?.[entityColumn]?.[exactMatch] ?? null : null;
  const activeDateDisplay = dateColumn || 'Current row order';

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
          <p className="eyebrow">Single firm workflow</p>
          <h2>Configure one firm for analysis</h2>
        </div>
        <span className="status-chip">Single firm</span>
      </div>

      {metadata ? (
        <>
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
          </div>

          <div className="firm-selection-grid">
            <label>
              <span>Choose firms by</span>
              <select value={entityColumn} onChange={(event) => onEntityColumnChange(event.target.value)}>
                <option value="">Select ticker or company name</option>
                {visibleEntityColumns.map((column) => (
                  <option key={column} value={column}>
                    {getEntityColumnLabel(column)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{entityColumn === 'conm' ? 'Company name' : 'Ticker'}</span>
              <div className="firm-picker-stack">
                <input
                  value={entityValue}
                  onChange={(event) => onEntityValueChange(event.target.value)}
                  placeholder={entityColumn === 'conm' ? 'Type a company name or pick one below' : 'Type a ticker or pick one below'}
                  disabled={!entityColumn}
                />
                <select
                  size={Math.min(Math.max(filteredEntityOptions.length, 4), 8)}
                  value=""
                  onChange={(event) => {
                    if (event.target.value) {
                      onEntityValueChange(event.target.value);
                    }
                  }}
                  disabled={!entityColumn || filteredEntityOptions.length === 0}
                  className="firm-options-list"
                >
                  {filteredEntityOptions.length > 0 ? (
                    filteredEntityOptions.map((value) => (
                      <option key={value} value={value}>
                        {entityDisplayMap[value] ?? value}
                      </option>
                    ))
                  ) : (
                    <option value="" disabled>
                      No matching firms
                    </option>
                  )}
                </select>
              </div>
            </label>
          </div>

          <p className="helper-copy">
            {selectedFirmDisplay
              ? `${getEntityColumnLabel(entityColumn)} currently selected: ${selectedFirmDisplay}`
              : typedFirmDisplay
                ? `Current ${getEntityColumnLabel(entityColumn).toLowerCase()} input: ${typedFirmDisplay}. Pick a matching firm from the list below to confirm it.`
              : 'Pick a firm by ticker or company name before running the model comparison. You can type to filter the list or click a matching firm below.'}
          </p>

          <div className="subtle-grid">
            <div className="meta-card">
              <strong>{selectedFirmDisplay || typedFirmDisplay || 'None'}</strong>
              <span>{selectedFirmDisplay ? 'confirmed firm' : 'current firm input'}</span>
            </div>
            <div className="meta-card">
              <strong>{selectedFirmRows?.toLocaleString() ?? '—'}</strong>
              <span>{selectedFirmDisplay ? 'rows for selected firm' : 'firm rows will appear after a confirmed match'}</span>
            </div>
            <div className="meta-card">
              <strong>{targetColumn || '—'}</strong>
              <span>selected target metric</span>
            </div>
            <div className="meta-card">
              <strong>{activeDateDisplay}</strong>
              <span>
                {dateColumn ? 'date ordering column' : 'using current row order'}
              </span>
            </div>
          </div>

          <button className="primary-button" onClick={onRun} disabled={!canRunSingleFirm || loading}>
            {loading ? 'Running models...' : 'Run Naive, ARIMA, and Chronos'}
          </button>
        </>
      ) : (
        <p className="helper-copy">Upload a file to unlock the series configuration step.</p>
      )}
    </section>
  );
}
