import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ForecastRunResponse } from '../types';
import { MetricsTable } from './MetricsTable';

type Props = {
  forecast: ForecastRunResponse;
};

export function ComparisonBoard({ forecast }: Props) {
  const { series, models } = forecast;
  const start = series.labels.length - series.holdout;

  const chartData = series.labels.map((label, index) => {
    const inHoldout = index >= start;
    const holdoutIndex = index - start;
    const arimaLo80 = inHoldout && models.arima.lo80 ? models.arima.lo80[holdoutIndex] : null;
    const arimaHi80 = inHoldout && models.arima.hi80 ? models.arima.hi80[holdoutIndex] : null;
    const arimaLo95 = inHoldout && models.arima.lo95 ? models.arima.lo95[holdoutIndex] : null;
    const arimaHi95 = inHoldout && models.arima.hi95 ? models.arima.hi95[holdoutIndex] : null;
    const chronosLo80 =
      inHoldout && models.chronos.status === 'ok' && models.chronos.lo80 ? models.chronos.lo80[holdoutIndex] : null;
    const chronosHi80 =
      inHoldout && models.chronos.status === 'ok' && models.chronos.hi80 ? models.chronos.hi80[holdoutIndex] : null;
    const chronosLo95 =
      inHoldout && models.chronos.status === 'ok' && models.chronos.lo95 ? models.chronos.lo95[holdoutIndex] : null;
    const chronosHi95 =
      inHoldout && models.chronos.status === 'ok' && models.chronos.hi95 ? models.chronos.hi95[holdoutIndex] : null;

    return {
      label,
      history: series.history[index],
      actual: inHoldout ? series.actual[holdoutIndex] : null,
      naive: inHoldout ? models.naive.mean[holdoutIndex] : null,
      arima: inHoldout ? models.arima.mean[holdoutIndex] : null,
      chronos: inHoldout && models.chronos.status === 'ok' ? models.chronos.mean[holdoutIndex] : null,
      arima80Base: arimaLo80,
      arima80Band: arimaLo80 != null && arimaHi80 != null ? arimaHi80 - arimaLo80 : null,
      arima95Base: arimaLo95,
      arima95Band: arimaLo95 != null && arimaHi95 != null ? arimaHi95 - arimaLo95 : null,
      chronos80Base: chronosLo80,
      chronos80Band: chronosLo80 != null && chronosHi80 != null ? chronosHi80 - chronosLo80 : null,
      chronos95Base: chronosLo95,
      chronos95Band: chronosLo95 != null && chronosHi95 != null ? chronosHi95 - chronosLo95 : null,
    };
  });

  return (
    <div className="stack-gap">
      <section className="panel stack-gap">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Forecast board</p>
            <h2>3. Run and inspect the model outputs</h2>
          </div>
          <span className="status-chip">{series.name}{series.entity ? ` · ${series.entity}` : ''}</span>
        </div>

        <div className="subtle-grid">
          <div className="meta-card">
            <strong>{series.holdout}</strong>
            <span>holdout periods</span>
          </div>
          <div className="meta-card">
            <strong>{series.history.length}</strong>
            <span>observations used</span>
          </div>
          <div className="meta-card">
            <strong>{models.arima.order ? `(${models.arima.order.p},${models.arima.order.d},${models.arima.order.q})` : 'n/a'}</strong>
            <span>best ARIMA order</span>
          </div>
          <div className="meta-card">
            <strong>{models.chronos.status === 'ok' ? 'Ready' : 'Needs setup'}</strong>
            <span>Chronos status</span>
          </div>
        </div>

        <div className="chart-shell">
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={chartData}>
              <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="4 4" />
              <XAxis dataKey="label" minTickGap={24} />
              <YAxis />
              <Tooltip />
              <Legend />
              <ReferenceLine
                x={series.labels[start]}
                stroke="rgba(244, 114, 182, 0.55)"
                strokeDasharray="6 6"
                label={{ value: 'Holdout start', fill: '#f9a8d4', position: 'insideTopRight' }}
              />

              <Area dataKey="arima95Base" stackId="arima95" stroke="none" fill="transparent" activeDot={false} />
              <Area
                dataKey="arima95Band"
                stackId="arima95"
                stroke="none"
                fill="rgba(37, 99, 235, 0.12)"
                name="ARIMA 95%"
                activeDot={false}
              />
              <Area dataKey="arima80Base" stackId="arima80" stroke="none" fill="transparent" activeDot={false} />
              <Area
                dataKey="arima80Band"
                stackId="arima80"
                stroke="none"
                fill="rgba(59, 130, 246, 0.22)"
                name="ARIMA 80%"
                activeDot={false}
              />
              <Area dataKey="chronos95Base" stackId="chronos95" stroke="none" fill="transparent" activeDot={false} />
              <Area
                dataKey="chronos95Band"
                stackId="chronos95"
                stroke="none"
                fill="rgba(147, 51, 234, 0.12)"
                name="Chronos 95%"
                activeDot={false}
              />
              <Area dataKey="chronos80Base" stackId="chronos80" stroke="none" fill="transparent" activeDot={false} />
              <Area
                dataKey="chronos80Band"
                stackId="chronos80"
                stroke="none"
                fill="rgba(168, 85, 247, 0.24)"
                name="Chronos 80%"
                activeDot={false}
              />

              <Line type="monotone" dataKey="history" stroke="#94a3b8" dot={false} strokeWidth={2} name="Training Data" />
              <Line type="monotone" dataKey="actual" stroke="#2dd4bf" dot={false} strokeWidth={3} strokeDasharray="5 5" name="Actual (Ground Truth)" />
              <Line type="monotone" dataKey="naive" stroke="#f59e0b" dot={false} strokeWidth={2} strokeDasharray="8 6" name="Naive" />
              <Line type="monotone" dataKey="arima" stroke="#60a5fa" dot={false} strokeWidth={2.5} name="ARIMA" />
              <Line type="monotone" dataKey="chronos" stroke="#c084fc" dot={false} strokeWidth={2.5} name="Chronos-Bolt" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <MetricsTable models={[models.naive, models.arima, models.chronos]} />
    </div>
  );
}
