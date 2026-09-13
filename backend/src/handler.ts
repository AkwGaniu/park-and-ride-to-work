import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { timingSafeEqual, scryptSync } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const headers = {
  'content-type': 'application/json',
};

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
type Day = (typeof DAYS)[number];

type Member = {
  memberId: string;
  displayName: string;
  vehicleSeats: number;
  pinHash: string;
  active: boolean;
};

type AvailabilityRequest = {
  pin?: unknown;
  workingDays?: unknown;
  canDrive?: unknown;
  drivingUnavailableReason?: unknown;
};

const database = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function response(statusCode: number, body: unknown) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function validWeekStart(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.getUTCDay() === 1;
}

function validWorkingDays(value: unknown): value is Day[] {
  return Array.isArray(value)
    && value.every((day) => typeof day === 'string' && DAYS.includes(day as Day))
    && new Set(value).size === value.length;
}

function verifyPin(pin: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHash] = storedHash.split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedHash) return false;

  const actual = scryptSync(pin, salt, 64).toString('hex');
  const expected = Buffer.from(expectedHash, 'hex');
  const candidate = Buffer.from(actual, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

async function listMembers() {
  const result = await database.send(new ScanCommand({
    TableName: requiredEnvironment('MEMBERS_TABLE'),
    FilterExpression: 'active = :active',
    ExpressionAttributeValues: { ':active': true },
    ProjectionExpression: 'memberId, displayName, vehicleSeats',
  }));

  return (result.Items ?? [])
    .sort((left, right) => String(left.displayName).localeCompare(String(right.displayName)));
}

async function saveAvailability(weekStart: string, memberId: string, body: AvailabilityRequest) {
  if (!validWeekStart(weekStart)) return response(400, { message: 'weekStart must be a Monday in YYYY-MM-DD format.' });
  if (typeof body.pin !== 'string' || !/^\d{4,6}$/.test(body.pin)) return response(400, { message: 'Enter a 4 to 6 digit PIN.' });
  if (!validWorkingDays(body.workingDays)) return response(400, { message: 'workingDays must contain valid day codes.' });
  if (typeof body.canDrive !== 'boolean') return response(400, { message: 'canDrive must be true or false.' });
  if (body.drivingUnavailableReason !== undefined && typeof body.drivingUnavailableReason !== 'string') {
    return response(400, { message: 'drivingUnavailableReason must be text.' });
  }

  const memberResult = await database.send(new GetCommand({
    TableName: requiredEnvironment('MEMBERS_TABLE'),
    Key: { memberId },
  }));
  const member = memberResult.Item as Member | undefined;

  if (!member || !member.active || !verifyPin(body.pin, member.pinHash)) {
    return response(401, { message: 'Name or PIN is incorrect.' });
  }

  const item = {
    weekStart,
    memberId,
    workingDays: [...body.workingDays].sort((left, right) => DAYS.indexOf(left) - DAYS.indexOf(right)),
    canDrive: body.canDrive,
    drivingUnavailableReason: body.canDrive ? undefined : body.drivingUnavailableReason?.trim().slice(0, 160),
    submittedAt: new Date().toISOString(),
  };

  await database.send(new PutCommand({
    TableName: requiredEnvironment('AVAILABILITY_TABLE'),
    Item: item,
  }));

  return response(200, { ...item, message: 'Schedule saved.' });
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const { method } = event.requestContext.http;
    const path = event.rawPath;

    if (method === 'GET' && path === '/health') {
      return response(200, { status: 'ok', service: 'park-and-ride-api' });
    }

    if (method === 'GET' && path === '/members') {
      return response(200, await listMembers());
    }

    const availabilityMatch = path.match(/^\/availability\/(\d{4}-\d{2}-\d{2})(?:\/([^/]+))?$/);
    if (method === 'GET' && availabilityMatch?.[1] && !availabilityMatch[2]) {
      if (!validWeekStart(availabilityMatch[1])) return response(400, { message: 'weekStart must be a Monday.' });
      const result = await database.send(new QueryCommand({
        TableName: requiredEnvironment('AVAILABILITY_TABLE'),
        KeyConditionExpression: 'weekStart = :weekStart',
        ExpressionAttributeValues: { ':weekStart': availabilityMatch[1] },
      }));
      return response(200, result.Items ?? []);
    }

    if (method === 'PUT' && availabilityMatch?.[1] && availabilityMatch[2]) {
      let body: AvailabilityRequest;
      try {
        body = JSON.parse(event.body ?? '{}') as AvailabilityRequest;
      } catch {
        return response(400, { message: 'Request body must be valid JSON.' });
      }
      return saveAvailability(availabilityMatch[1], decodeURIComponent(availabilityMatch[2]), body);
    }

    return response(404, { message: 'Route not found.' });
  } catch (error) {
    console.error('Unhandled API error', error);
    return response(500, { message: 'Unexpected server error.' });
  }
};
