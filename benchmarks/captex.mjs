import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const sourceFile = new URL('../data/noaa/captex2_meas.txt', import.meta.url);
const sourceText = readFileSync(sourceFile, 'utf8');
const rows = sourceText.trim().split(/\r?\n/).slice(2).map((line) => {
  const fields = line.trim().split(/\s+/);
  return {
    date: new Date(`${fields[0]}-${fields[1]}-${fields[2]}T${fields[3].slice(0, 2)}:${fields[3].slice(2)}:00Z`),
    lat: +fields[5],
    lon: +fields[6],
    measured: +fields[7],
    station: fields[8],
  };
}).filter((row) => Number.isFinite(row.measured) && Number.isFinite(row.lat) && Number.isFinite(row.lon));

const release = new Date('1983-09-25T17:00:00Z');
const source = { lat: 39.90, lon: -84.22 };
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const rmse = (actual, predicted) => Math.sqrt(mean(actual.map((value, index) => (value - predicted[index]) ** 2)));

function footprint(row, bearing, speed, crosswindGrowth) {
  const eastKm = (row.lon - source.lon) * 85;
  const northKm = (row.lat - source.lat) * 111;
  const radians = bearing * Math.PI / 180;
  const downwindKm = eastKm * Math.sin(radians) + northKm * Math.cos(radians);
  const crosswindKm = eastKm * Math.cos(radians) - northKm * Math.sin(radians);
  const hours = Math.max(1, (row.date - release) / 3.6e6);
  if (downwindKm <= 0) return 0;
  const centerKm = speed * hours;
  const alongSigma = 35 + hours * 5;
  const crossSigma = 15 + hours * crosswindGrowth;
  return Math.exp(-0.5 * (crosswindKm / crossSigma) ** 2)
    * Math.exp(-0.5 * ((downwindKm - centerKm) / alongSigma) ** 2)
    / (1 + downwindKm * 0.006);
}

const cut = Math.floor(rows.length * 0.7);
const train = rows.slice(0, cut);
const holdout = rows.slice(cut);
const started = performance.now();
let best = { rmse: Infinity, bearing: 0, speed: 0, crosswindGrowth: 0, scale: 0 };

for (let bearing = 0; bearing < 360; bearing += 5) {
  for (let speed = 10; speed <= 100; speed += 5) {
    for (let growth = 2; growth <= 8; growth += 2) {
      const features = train.map((row) => footprint(row, bearing, speed, growth));
      const actual = train.map((row) => Math.log1p(row.measured));
      const scale = features.reduce((sum, value, index) => sum + value * actual[index], 0)
        / (features.reduce((sum, value) => sum + value * value, 0) || 1);
      const error = rmse(actual, features.map((value) => value * scale));
      if (error < best.rmse) best = { rmse: error, bearing, speed, crosswindGrowth: growth, scale };
    }
  }
}

const actual = holdout.map((row) => Math.log1p(row.measured));
const predicted = holdout.map((row) => footprint(row, best.bearing, best.speed, best.crosswindGrowth) * best.scale);
const actualMean = mean(actual);
const predictedMean = mean(predicted);
const correlation = actual.reduce((sum, value, index) => sum + (value - actualMean) * (predicted[index] - predictedMean), 0)
  / Math.sqrt(actual.reduce((sum, value) => sum + (value - actualMean) ** 2, 0)
    * predicted.reduce((sum, value) => sum + (value - predictedMean) ** 2, 0) || 1);
const modelRmse = rmse(actual, predicted);
const zeroRmse = rmse(actual, actual.map(() => 0));
const bias = mean(predicted.map((value, index) => value - actual[index]));
const skillPct = 100 * (1 - modelRmse / zeroRmse);

const report = {
  source: 'NOAA CAPTEX Release 2 measured tracer concentrations',
  sourceUrl: 'https://www.ready.noaa.gov/documents/AMS2018/captex/captex2_meas.txt',
  sourceSha256: createHash('sha256').update(sourceText).digest('hex'),
  method: 'Gaussian footprint proxy; ordered row 70/30 holdout; metrics on log1p concentration',
  splitWarning: 'Rows are ordered by observation time and station; later rows form the holdout. No holdout values are used during parameter search.',
  totalSamples: rows.length,
  trainSamples: train.length,
  holdoutSamples: holdout.length,
  parameters: { bearingDegrees: best.bearing, speedKmH: best.speed, crosswindGrowthKmPerHour: best.crosswindGrowth },
  holdout: { correlation: +correlation.toFixed(3), rmseLog: +modelRmse.toFixed(3), biasLog: +bias.toFixed(3) },
  baseline: { name: 'zero concentration', rmseLog: +zeroRmse.toFixed(3) },
  skill: { rmseVsZeroPct: +skillPct.toFixed(1), passed: skillPct > 0 && correlation > 0 },
  runtimeMs: +(performance.now() - started).toFixed(1),
  applicability: 'NO_SKILL_ON_HOLDOUT',
  limitations: [
    'CAPTEX used a non-biological perfluorocarbon tracer.',
    'Parameters are fitted to one release without assimilated meteorology.',
    'Negative holdout correlation means the proxy is not suitable for operational prediction.',
    'No crop infection, pesticide, treatment, yield, or financial inference is supported.',
  ],
};

writeFileSync(new URL('./report.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.table({
  holdoutSamples: report.holdoutSamples,
  correlation: report.holdout.correlation,
  rmseLog: report.holdout.rmseLog,
  biasLog: report.holdout.biasLog,
  skillVsZeroPct: report.skill.rmseVsZeroPct,
  status: report.applicability,
});
