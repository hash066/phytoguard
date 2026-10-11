import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import crypto from 'node:crypto';

const db = new DynamoDBClient({});
const sqs = new SQSClient({});
const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) });

function validateScenario(input) {
  const allowed = ['windSpeed', 'windDirection', 'sourceRate', 'reduction', 'hour'];
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('scenario must be an object');
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error('scenario contains unsupported fields');
  if (!allowed.every((key) => Number.isFinite(input[key]))) throw new Error('all five scenario fields must be finite numbers');
  if (input.windSpeed < 0.5 || input.windSpeed > 120) throw new Error('windSpeed must be 0.5..120 km/h');
  if (input.windDirection < 0 || input.windDirection >= 360) throw new Error('windDirection must be 0..359 degrees');
  if (input.sourceRate < 0 || input.sourceRate > 10_000) throw new Error('sourceRate must be 0..10000');
  if (input.reduction < 0 || input.reduction > 100) throw new Error('reduction must be 0..100 percent');
  if (input.hour < 0 || input.hour > 72) throw new Error('hour must be 0..72');
  return Object.fromEntries(allowed.map((key) => [key, input[key]]));
}

export async function handler(event) {
  const owner = event.requestContext?.authorizer?.jwt?.claims?.sub;
  if (!owner) return json(401, { error: 'unauthorized' });
  if (event.requestContext.http.method === 'POST') {
    let input;
    try { input = validateScenario(JSON.parse(event.body || '{}')); }
    catch (error) { return json(400, { error: error.message }); }
    const id = crypto.randomUUID();
    const item = {
      ownerJob: { S: `${owner}#${id}` }, status: { S: 'QUEUED' }, scenario: { S: JSON.stringify(input) },
      createdAt: { S: new Date().toISOString() }, expiresAt: { N: String(Math.floor(Date.now() / 1000) + 604800) },
    };
    await db.send(new PutItemCommand({ TableName: process.env.TABLE_NAME, Item: item, ConditionExpression: 'attribute_not_exists(ownerJob)' }));
    await sqs.send(new SendMessageCommand({ QueueUrl: process.env.QUEUE_URL, MessageBody: JSON.stringify({ owner, id }) }));
    return json(202, { id, status: 'QUEUED', poll: `/jobs/${id}` });
  }
  const id = event.pathParameters?.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'invalid job id' });
  const result = await db.send(new GetItemCommand({ TableName: process.env.TABLE_NAME, Key: { ownerJob: { S: `${owner}#${id}` } }, ConsistentRead: true }));
  return result.Item
    ? json(200, { id, status: result.Item.status.S, result: result.Item.result?.S ? JSON.parse(result.Item.result.S) : null })
    : json(404, { error: 'not found' });
}
