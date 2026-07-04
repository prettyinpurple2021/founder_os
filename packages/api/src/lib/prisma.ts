import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildDatabaseUrl } from '../config/databaseUrl.js';

const connectionString = buildDatabaseUrl(process.env);

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export default prisma;
