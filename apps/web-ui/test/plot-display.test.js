import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLOT_METRIC_CODES,
  orderedPlotMetrics,
  plotMetricValue,
  reconcilePlotOrder,
  stablePlotSort
} from '../js/plot-display.js';

test('plot cards use a deterministic fallback order and preserve saved order', () => {
  const plots = [
    { plotId: 'plot-b02', name: 'B02' },
    { plotId: 'plot-a10', name: 'A10' },
    { plotId: 'plot-a02', name: 'A02' }
  ];
  assert.deepEqual(stablePlotSort(plots).map((plot) => plot.plotId), ['plot-a02', 'plot-a10', 'plot-b02']);
  assert.deepEqual(reconcilePlotOrder(plots, ['plot-b02', 'plot-a02', 'removed']), [
    plots[0], plots[2], plots[1]
  ]);
  assert.deepEqual(reconcilePlotOrder(plots, ['plot-b02']).map((plot) => plot.plotId), ['plot-b02', 'plot-a02', 'plot-a10']);
});

test('all standard metric slots stay fixed and unavailable values render as a dash', () => {
  const ordered = orderedPlotMetrics({
    metrics: {
      POTASSIUM: { value: 18, unit: 'mg/kg', status: 'NORMAL' },
      SOIL_MOISTURE: { value: 32, unit: '%' },
      CUSTOM_INDEX: { value: 7, unit: 'x' }
    }
  });
  assert.deepEqual(ordered.slice(0, PLOT_METRIC_CODES.length).map((metric) => metric.code), [...PLOT_METRIC_CODES]);
  assert.equal(ordered[1].code, 'AIR_TEMPERATURE');
  assert.equal(ordered[1].available, false);
  assert.equal(plotMetricValue(ordered[1]), '—');
  assert.equal(ordered.at(-1).code, 'CUSTOM_INDEX');
  assert.equal(plotMetricValue(ordered.at(-1)), 7);
});

test('metric ordering does not depend on backend object insertion order', () => {
  const first = orderedPlotMetrics({ metrics: { PH: { value: 6 }, LIGHT: { value: 100 }, CO2: { value: 500 } } });
  const second = orderedPlotMetrics({ metrics: { CO2: { value: 500 }, PH: { value: 6 }, LIGHT: { value: 100 } } });
  assert.deepEqual(first.map((metric) => metric.code), second.map((metric) => metric.code));
});
