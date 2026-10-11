export type Receptor = {
  id: string;
  name: string;
  eastKm: number;
  northKm: number;
  x: number;
  y: number;
  crop: string;
};

export type PuffInput = {
  windSpeed: number;
  windDirection: number;
  sourceRate: number;
  reduction: number;
  hour: number;
};

export type ExposureResult = Receptor & {
  exposure: number;
  downwindKm: number;
  crosswindKm: number;
  arrivalHour: number;
};

export const MODEL_VERSION = 'phytoguard-puff-v2';

export const receptors: Receptor[] = [
  { id: 'F-12', name: 'North wheat block', eastKm: 4.2, northKm: 2.9, x: 64, y: 27, crop: 'Wheat' },
  { id: 'F-08', name: 'Canal-side plot', eastKm: 5.2, northKm: 0.2, x: 74, y: 54, crop: 'Wheat' },
  { id: 'F-21', name: 'Research field', eastKm: 3.1, northKm: -1.6, x: 53, y: 72, crop: 'Barley' },
  { id: 'F-03', name: 'Village edge plot', eastKm: 6.4, northKm: -2, x: 86, y: 76, crop: 'Wheat' },
];

export function transportBearing(windFromDegrees: number) {
  return (windFromDegrees + 180) % 360;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function validateInput(input: PuffInput) {
  if (!Object.values(input).every(Number.isFinite)) throw new Error('All scenario inputs must be finite numbers.');
  if (input.windSpeed < 0.5 || input.windSpeed > 120) throw new Error('Wind speed must be between 0.5 and 120 km/h.');
  if (input.windDirection < 0 || input.windDirection >= 360) throw new Error('Wind-from direction must be from 0 to 359 degrees.');
  if (input.sourceRate < 0 || input.sourceRate > 10_000) throw new Error('Source rate must be between 0 and 10,000 relative units/h.');
  if (input.reduction < 0 || input.reduction > 100) throw new Error('Reduction must be between 0 and 100 percent.');
  if (input.hour < 0 || input.hour > 72) throw new Error('Elapsed time must be between 0 and 72 hours.');
}

export function exposureAt(receptor: Receptor, input: PuffInput): ExposureResult {
  validateInput(input);
  const bearing = transportBearing(input.windDirection) * Math.PI / 180;
  const downwindKm = receptor.eastKm * Math.sin(bearing) + receptor.northKm * Math.cos(bearing);
  const crosswindKm = receptor.eastKm * Math.cos(bearing) - receptor.northKm * Math.sin(bearing);
  const centerKm = input.windSpeed * input.hour;
  const sigmaAlongKm = Math.max(0.35, 0.14 * centerKm + 0.3);
  const sigmaCrossKm = Math.max(0.2, 0.09 * Math.max(centerKm, 1) + 0.16);
  const retainedFraction = Math.exp(-0.045 * input.hour);
  const effectiveRelease = input.sourceRate * (1 - input.reduction / 100) * retainedFraction;
  const gaussian = downwindKm <= 0 || input.hour === 0
    ? 0
    : Math.exp(-0.5 * ((downwindKm - centerKm) / sigmaAlongKm) ** 2)
      * Math.exp(-0.5 * (crosswindKm / sigmaCrossKm) ** 2);
  const normalizedDensity = effectiveRelease * gaussian / (2 * Math.PI * sigmaAlongKm * sigmaCrossKm);

  return {
    ...receptor,
    exposure: +clamp(normalizedDensity, 0, 9999).toFixed(2),
    downwindKm: +downwindKm.toFixed(2),
    crosswindKm: +crosswindKm.toFixed(2),
    arrivalHour: +(Math.hypot(receptor.eastKm, receptor.northKm) / input.windSpeed).toFixed(2),
  };
}

export function scenario(input: PuffInput): ExposureResult[] {
  return receptors.map((receptor) => exposureAt(receptor, input));
}

export function scenarioSummary(input: PuffInput) {
  const results = scenario(input);
  const peak = results.reduce((best, result) => result.exposure > best.exposure ? result : best, results[0]);
  return {
    modelVersion: MODEL_VERSION,
    input,
    transportBearing: transportBearing(input.windDirection),
    results,
    peakReceptor: peak.id,
    peakExposure: peak.exposure,
    units: { distance: 'km', time: 'h', windSpeed: 'km/h', exposure: 'relative index' },
    validationStatus: 'CAPTEX_HOLDOUT_NO_SKILL',
  };
}
