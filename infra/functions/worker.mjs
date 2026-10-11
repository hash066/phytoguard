import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

const db = new DynamoDBClient({});
const receptors = [
  { id: 'F-12', name: 'North wheat block', eastKm: 4.2, northKm: 2.9, crop: 'Wheat' },
  { id: 'F-08', name: 'Canal-side plot', eastKm: 5.2, northKm: 0.2, crop: 'Wheat' },
  { id: 'F-21', name: 'Research field', eastKm: 3.1, northKm: -1.6, crop: 'Barley' },
  { id: 'F-03', name: 'Village edge plot', eastKm: 6.4, northKm: -2, crop: 'Wheat' },
];

export function computeScenario(input) {
  const transportBearing = (input.windDirection + 180) % 360;
  const bearing = transportBearing * Math.PI / 180;
  const centerKm = input.windSpeed * input.hour;
  const sigmaAlongKm = Math.max(0.35, 0.14 * centerKm + 0.3);
  const sigmaCrossKm = Math.max(0.2, 0.09 * Math.max(centerKm, 1) + 0.16);
  const effectiveRelease = input.sourceRate * (1 - input.reduction / 100) * Math.exp(-0.045 * input.hour);
  const results = receptors.map((receptor) => {
    const downwindKm = receptor.eastKm * Math.sin(bearing) + receptor.northKm * Math.cos(bearing);
    const crosswindKm = receptor.eastKm * Math.cos(bearing) - receptor.northKm * Math.sin(bearing);
    const gaussian = downwindKm <= 0 || input.hour === 0 ? 0
      : Math.exp(-0.5 * ((downwindKm - centerKm) / sigmaAlongKm) ** 2) * Math.exp(-0.5 * (crosswindKm / sigmaCrossKm) ** 2);
    return { ...receptor, exposure: +(effectiveRelease * gaussian / (2 * Math.PI * sigmaAlongKm * sigmaCrossKm)).toFixed(2), downwindKm: +downwindKm.toFixed(2), crosswindKm: +crosswindKm.toFixed(2) };
  });
  const peak = results.reduce((best, result) => result.exposure > best.exposure ? result : best, results[0]);
  return { modelVersion: 'phytoguard-puff-v2', input, transportBearing, results, peakReceptor: peak.id, peakExposure: peak.exposure, units: { distance: 'km', time: 'h', windSpeed: 'km/h', exposure: 'relative index' }, validationStatus: 'CAPTEX_HOLDOUT_NO_SKILL', sourceReferences: ['NOAA CAPTEX Release 2', 'ERA5 reanalysis via Open-Meteo'], completedAt: new Date().toISOString() };
}

export async function handler(event) {
  for (const record of event.Records) {
    const { owner, id } = JSON.parse(record.body);
    const key = { ownerJob: { S: `${owner}#${id}` } };
    const item = await db.send(new GetItemCommand({ TableName: process.env.TABLE_NAME, Key: key, ConsistentRead: true }));
    if (!item.Item?.scenario?.S) throw new Error(`Scenario missing for job ${id}`);
    const result = computeScenario(JSON.parse(item.Item.scenario.S));
    await db.send(new UpdateItemCommand({ TableName: process.env.TABLE_NAME, Key: key, UpdateExpression: 'SET #s=:s,#r=:r,completedAt=:c', ConditionExpression: '#s=:queued', ExpressionAttributeNames: { '#s': 'status', '#r': 'result' }, ExpressionAttributeValues: { ':s': { S: 'COMPLETE' }, ':queued': { S: 'QUEUED' }, ':r': { S: JSON.stringify(result) }, ':c': { S: result.completedAt } } }));
  }
}
