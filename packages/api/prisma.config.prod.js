// Production prisma config — doesn't require 'prisma/config' dev dependency.
// Used in Docker container for prisma migrate deploy.
export default {
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL },
};
