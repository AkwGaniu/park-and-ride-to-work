import { randomBytes, scryptSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const fileArgumentIndex = process.argv.indexOf('--file');
const inputFile = fileArgumentIndex >= 0 ? process.argv[fileArgumentIndex + 1] : undefined;
const tableName = process.env.MEMBERS_TABLE;

if (!inputFile || !tableName) {
  throw new Error('Usage: MEMBERS_TABLE=<table-name> npm run seed:members -- --file scripts/members.json');
}

const members = JSON.parse(await readFile(inputFile, 'utf8'));
if (!Array.isArray(members)) throw new Error('The member file must contain a JSON array.');

const database = DynamoDBDocumentClient.from(new DynamoDBClient({}));

for (const member of members) {
  if (!member.memberId || !member.displayName || !/^\d{4,6}$/.test(member.pin ?? '') || !Number.isInteger(member.vehicleSeats)) {
    throw new Error(`Invalid member record: ${JSON.stringify(member)}`);
  }

  const salt = randomBytes(16).toString('hex');
  const pinHash = `scrypt$${salt}$${scryptSync(member.pin, salt, 64).toString('hex')}`;
  await database.send(new PutCommand({
    TableName: tableName,
    Item: {
      memberId: member.memberId,
      displayName: member.displayName,
      vehicleSeats: member.vehicleSeats,
      pinHash,
      isAdmin: member.isAdmin === true,
      active: true,
    },
  }));
  console.log(`Seeded ${member.displayName}`);
}
