/**
 * Builds a PostgreSQL connection string from either DATABASE_URL or discrete
 * database environment variables injected at runtime.
 */
export function buildDatabaseUrl(env: NodeJS.ProcessEnv): string {
  if (env.DATABASE_URL) {
    return env.DATABASE_URL;
  }

  const host = env.DATABASE_HOST;
  const port = env.DATABASE_PORT;
  const name = env.DATABASE_NAME;
  const user = env.DATABASE_USER;
  const password = env.DATABASE_PASSWORD;

  if (!host || !port || !name || !user || !password) {
    return '';
  }

  const connectionUrl = new URL('postgresql://placeholder');
  connectionUrl.hostname = host;
  connectionUrl.port = port;
  connectionUrl.pathname = `/${name}`;
  connectionUrl.username = user;
  connectionUrl.password = password;

  return connectionUrl.toString();
}
