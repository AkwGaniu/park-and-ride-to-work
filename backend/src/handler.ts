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
  isAdmin: boolean;
};

type PublicMember = Pick<Member, 'memberId' | 'displayName' | 'vehicleSeats'>;

type Availability = {
  memberId: string;
  workingDays: Day[];
  canDrive: boolean;
};

type AdminRequest = {
  adminMemberId?: unknown;
  pin?: unknown;
};

type RotaEntry = {
  weekStart: string;
  day: Day;
  attendees: PublicMember[];
  drivers: PublicMember[];
  driverIds: string[];
  totalSeats: number;
  warning?: string;
  generatedAt: string;
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

function londonDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function mondayFor(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function submissionsAreOpen(weekStart: string): boolean {
  const today = londonDate();
  const currentWeekStart = mondayFor(today);
  if (weekStart > currentWeekStart) return true;
  if (weekStart < currentWeekStart) return false;
  return new Date(`${today}T00:00:00Z`).getUTCDay() === 1;
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

async function listMembers(): Promise<PublicMember[]> {
  const result = await database.send(new ScanCommand({
    TableName: requiredEnvironment('MEMBERS_TABLE'),
    FilterExpression: 'active = :active',
    ExpressionAttributeValues: { ':active': true },
    ProjectionExpression: 'memberId, displayName, vehicleSeats',
  }));

  return ((result.Items ?? []) as PublicMember[])
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function dayDate(weekStart: string, day: Day): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + DAYS.indexOf(day));
  return date.toISOString().slice(0, 10);
}

function previousWeekStarts(weekStart: string, numberOfWeeks: number): string[] {
  return Array.from({ length: numberOfWeeks }, (_, index) => {
    const date = new Date(`${weekStart}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (index + 1) * 7);
    return date.toISOString().slice(0, 10);
  });
}

async function getAvailability(weekStart: string): Promise<Availability[]> {
  const result = await database.send(new QueryCommand({
    TableName: requiredEnvironment('AVAILABILITY_TABLE'),
    KeyConditionExpression: 'weekStart = :weekStart',
    ExpressionAttributeValues: { ':weekStart': weekStart },
  }));
  return (result.Items ?? []) as Availability[];
}

async function getRotas(weekStart: string): Promise<RotaEntry[]> {
  const result = await database.send(new QueryCommand({
    TableName: requiredEnvironment('ROTAS_TABLE'),
    KeyConditionExpression: 'weekStart = :weekStart',
    ExpressionAttributeValues: { ':weekStart': weekStart },
  }));
  return ((result.Items ?? []) as RotaEntry[])
    .sort((left, right) => DAYS.indexOf(left.day) - DAYS.indexOf(right.day));
}

async function verifyAdmin(body: AdminRequest): Promise<Member | undefined> {
  if (typeof body.adminMemberId !== 'string' || typeof body.pin !== 'string' || !/^\d{4,6}$/.test(body.pin)) {
    return undefined;
  }
  const result = await database.send(new GetCommand({
    TableName: requiredEnvironment('MEMBERS_TABLE'),
    Key: { memberId: body.adminMemberId },
  }));
  const member = result.Item as Member | undefined;
  return member?.active && member.isAdmin && verifyPin(body.pin, member.pinHash) ? member : undefined;
}

async function generateRota(weekStart: string, body: AdminRequest) {
  if (!validWeekStart(weekStart)) return response(400, { message: 'weekStart must be a Monday.' });
  const administrator = await verifyAdmin(body);
  if (!administrator) return response(401, { message: 'An administrator name and PIN are required to generate a rota.' });

  const [members, availability, historicalRotaGroups] = await Promise.all([
    listMembers(),
    getAvailability(weekStart),
    Promise.all(previousWeekStarts(weekStart, 4).map(getRotas)),
  ]);
  const availabilityByMember = new Map(availability.map((item) => [item.memberId, item]));
  const historicalDriverCounts = new Map<string, number>();
  const lastDriveDate = new Map<string, string>();

  for (const rota of historicalRotaGroups.flat()) {
    for (const driverId of rota.driverIds ?? []) {
      historicalDriverCounts.set(driverId, (historicalDriverCounts.get(driverId) ?? 0) + 1);
      const date = dayDate(rota.weekStart, rota.day);
      if (!lastDriveDate.get(driverId) || date > lastDriveDate.get(driverId)!) lastDriveDate.set(driverId, date);
    }
  }

  const currentWeekDriverCounts = new Map<string, number>();
  const generatedAt = new Date().toISOString();
  const rotaEntries: RotaEntry[] = DAYS.map((day) => {
    const attendees = members.filter((member) => availabilityByMember.get(member.memberId)?.workingDays.includes(day));
    const eligible = attendees.filter((member) => availabilityByMember.get(member.memberId)?.canDrive);
    const rankedDrivers = [...eligible].sort((left, right) => {
      const historicalDifference = (historicalDriverCounts.get(left.memberId) ?? 0) - (historicalDriverCounts.get(right.memberId) ?? 0);
      if (historicalDifference !== 0) return historicalDifference;
      const currentDifference = (currentWeekDriverCounts.get(left.memberId) ?? 0) - (currentWeekDriverCounts.get(right.memberId) ?? 0);
      if (currentDifference !== 0) return currentDifference;
      const lastDriveDifference = (lastDriveDate.get(left.memberId) ?? '').localeCompare(lastDriveDate.get(right.memberId) ?? '');
      if (lastDriveDifference !== 0) return lastDriveDifference;
      return left.displayName.localeCompare(right.displayName);
    });

    const drivers: PublicMember[] = [];
    let totalSeats = 0;
    for (const candidate of rankedDrivers) {
      if (totalSeats >= attendees.length) break;
      drivers.push(candidate);
      totalSeats += candidate.vehicleSeats;
      currentWeekDriverCounts.set(candidate.memberId, (currentWeekDriverCounts.get(candidate.memberId) ?? 0) + 1);
    }

    const warning = attendees.length === 0
      ? undefined
      : drivers.length === 0
        ? 'No eligible driver is available.'
        : totalSeats < attendees.length
          ? `Only ${totalSeats} seats are available for ${attendees.length} travellers.`
          : undefined;

    return {
      weekStart,
      day,
      attendees,
      drivers,
      driverIds: drivers.map((driver) => driver.memberId),
      totalSeats,
      warning,
      generatedAt,
    };
  });

  await Promise.all(rotaEntries.map((item) => database.send(new PutCommand({
    TableName: requiredEnvironment('ROTAS_TABLE'),
    Item: item,
  }))));

  return response(200, { generatedBy: administrator.displayName, entries: rotaEntries });
}

async function saveAvailability(weekStart: string, memberId: string, body: AvailabilityRequest) {
  if (!validWeekStart(weekStart)) return response(400, { message: 'weekStart must be a Monday in YYYY-MM-DD format.' });
  if (!submissionsAreOpen(weekStart)) return response(409, { message: 'Schedule submissions close at the end of Monday for that week.' });
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

    if (method === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }

    if (method === 'GET' && path === '/health') {
      return response(200, { status: 'ok', service: 'park-and-ride-api' });
    }

    if (method === 'GET' && path === '/members') {
      return response(200, await listMembers());
    }

    const availabilityMatch = path.match(/^\/availability\/(\d{4}-\d{2}-\d{2})(?:\/([^/]+))?$/);
    if (method === 'GET' && availabilityMatch?.[1] && !availabilityMatch[2]) {
      if (!validWeekStart(availabilityMatch[1])) return response(400, { message: 'weekStart must be a Monday.' });
      return response(200, await getAvailability(availabilityMatch[1]));
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

    const rotaMatch = path.match(/^\/rotas\/(\d{4}-\d{2}-\d{2})(?:\/generate)?$/);
    if (rotaMatch?.[1] && method === 'GET' && !path.endsWith('/generate')) {
      if (!validWeekStart(rotaMatch[1])) return response(400, { message: 'weekStart must be a Monday.' });
      return response(200, await getRotas(rotaMatch[1]));
    }

    if (rotaMatch?.[1] && method === 'POST' && path.endsWith('/generate')) {
      let body: AdminRequest;
      try {
        body = JSON.parse(event.body ?? '{}') as AdminRequest;
      } catch {
        return response(400, { message: 'Request body must be valid JSON.' });
      }
      return generateRota(rotaMatch[1], body);
    }

    return response(404, { message: 'Route not found.' });
  } catch (error) {
    console.error('Unhandled API error', error);
    return response(500, { message: 'Unexpected server error.' });
  }
};
