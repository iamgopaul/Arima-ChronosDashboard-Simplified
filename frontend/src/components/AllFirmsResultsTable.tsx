import type { AllFirmsRunResponse } from '../types';

type Props = {
  result: AllFirmsRunResponse | null;
};

function renderMetric(value: number | null | undefined) {
  return value == null ? '—' : value.toFixed(4);
}

export function AllFirmsResultsTable({ result }: Props) {
  if (!result) {
    return null;
  }

  return (
    <section className="panel stack-gap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Batch results</p>
          <h2>All-firm analysis summary</h2>
        </div>
        <span className="status-chip">
          {result.summary.processedEntities} processed / {result.summary.totalEntities} total
        </span>
      </div>

      <div className="subtle-grid">
        <div className="meta-card">
          <strong>{result.summary.totalEntities}</strong>
          <span>total firms</span>
        </div>
        <div className="meta-card">
          <strong>{result.summary.processedEntities}</strong>
          <span>processed firms</span>
        </div>
        <div className="meta-card">
          <strong>{result.summary.skippedEntities}</strong>
          <span>skipped firms</span>
        </div>
        <div className="meta-card">
          <strong>{result.summary.targetColumn}</strong>
          <span>target metric</span>
        </div>
      </div>

      <div className="table-wrap dataset-table-wrap">
        <table>
          <thead>
            <tr>
              <th>gvkey</th>
              <th>tic</th>
              <th>Company</th>
              <th>Status</th>
              <th>Obs.</th>
              <th>Best model</th>
              <th>Naive MAE</th>
              <th>ARIMA MAE</th>
              <th>Chronos MAE</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row) => (
              <tr key={`${row.entityValue}-${row.gvkey ?? row.tic ?? row.conm ?? 'firm'}`}>
                <td>{row.gvkey ?? '—'}</td>
                <td>{row.tic ?? '—'}</td>
                <td>{row.conm ?? row.entityValue}</td>
                <td>{row.status}</td>
                <td>{row.observations}</td>
                <td>{row.bestModel ?? '—'}</td>
                <td>{renderMetric(row.models.naive?.mae)}</td>
                <td>{renderMetric(row.models.arima?.mae)}</td>
                <td>{renderMetric(row.models.chronos?.mae)}</td>
                <td>{row.note ?? 'Metrics calculated successfully.'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
