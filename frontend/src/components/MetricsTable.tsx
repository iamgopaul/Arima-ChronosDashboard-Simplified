import type { ModelResult } from '../types';

type Props = {
  models: ModelResult[];
};

export function MetricsTable({ models }: Props) {
  const rows = models.map((model) => ({ name: model.name, metrics: model.metrics, status: model.status, error: model.error }));

  const validMaes = rows.filter((row) => row.metrics).map((row) => row.metrics!.mae);
  const bestMae = validMaes.length ? Math.min(...validMaes) : null;

  function getNote(row: (typeof rows)[number]) {
    if (row.error) {
      return row.error;
    }

    const isBest = row.metrics && bestMae !== null && row.metrics.mae === bestMae;

    if (row.name === 'Naive') {
      return isBest
        ? 'Last-value baseline is currently the most accurate on this holdout.'
        : 'Last-value persistence baseline for quick comparison.';
    }

    if (row.name === 'ARIMA') {
      return isBest
        ? 'Best holdout MAE among the automated forecasting models.'
        : 'Statistical time-series benchmark using autoregressive structure.';
    }

    if (row.name === 'Chronos') {
      return isBest
        ? 'Best holdout MAE using the Chronos-Bolt foundation model.'
        : 'Foundation-model forecast capturing broader time-series patterns.';
    }

    return 'Model result included in the current comparison.';
  }

  return (
    <section className="panel stack-gap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Side by side</p>
          <h2>4. Compare result quality</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Status</th>
              <th>MAE</th>
              <th>RMSE</th>
              <th>MAPE</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              return (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.status}</td>
                  <td>{row.metrics ? row.metrics.mae.toFixed(4) : '—'}</td>
                  <td>{row.metrics ? row.metrics.rmse.toFixed(4) : '—'}</td>
                  <td>{row.metrics?.mape != null ? row.metrics.mape.toFixed(4) : '—'}</td>
                  <td>{getNote(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
