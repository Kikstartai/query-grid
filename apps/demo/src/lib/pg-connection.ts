const POOLER_PORT = "6432";

export function isPooledConnection(connectionString: string): boolean {
  const url = new URL(connectionString);
  return (
    url.hostname.split(".")[0].endsWith("-pooler") ||
    url.port === POOLER_PORT ||
    url.searchParams.get("pgbouncer") === "true"
  );
}
