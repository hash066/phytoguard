import { describe, expect, it } from 'vitest';
import { receptors, scenario, scenarioSummary, transportBearing, validateInput } from './model';

const base = { windSpeed: 12, windDirection: 270, sourceRate: 100, reduction: 0, hour: 0.4 };

describe('Gaussian puff scenario', () => {
  it('converts meteorological wind-from direction to transport bearing', () => {
    expect(transportBearing(0)).toBe(180);
    expect(transportBearing(270)).toBe(90);
  });

  it('preserves non-negative finite exposure', () => {
    expect(scenario(base).every((result) => Number.isFinite(result.exposure) && result.exposure >= 0)).toBe(true);
  });

  it('source reduction scales exposure monotonically', () => {
    const baseline = scenario(base);
    const reduced = scenario({ ...base, reduction: 50 });
    expect(reduced.every((result, index) => result.exposure <= baseline[index].exposure)).toBe(true);
  });

  it('moves the plume center with wind speed and elapsed time', () => {
    const atArrival = scenario(base).find((result) => result.id === 'F-08')!;
    const tooLate = scenario({ ...base, hour: 3 }).find((result) => result.id === 'F-08')!;
    expect(atArrival.exposure).toBeGreaterThan(tooLate.exposure);
  });

  it('returns every receptor and auditable summary metadata', () => {
    const summary = scenarioSummary(base);
    expect(summary.results).toHaveLength(receptors.length);
    expect(summary.modelVersion).toBe('phytoguard-puff-v2');
    expect(summary.units.distance).toBe('km');
  });

  it('rejects invalid or unbounded inputs', () => {
    expect(() => validateInput({ ...base, reduction: 101 })).toThrow(/Reduction/);
    expect(() => validateInput({ ...base, windSpeed: Number.NaN })).toThrow(/finite/);
  });
});
