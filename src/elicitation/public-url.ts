export function buildPublicUrl(options: {
  publicUrl?: string;
  bindHost: string;
  port: number;
}): string {
  const configured = options.publicUrl?.trim().replace(/\/+$/, "");
  if (configured) return configured;

  const host =
    options.bindHost === "0.0.0.0" || options.bindHost === "::" ? "127.0.0.1" : options.bindHost;
  return `http://${host}:${options.port}`;
}

export function buildElicitationUrl(publicOrigin: string, elicitationId: string): string {
  return `${publicOrigin.replace(/\/+$/, "")}/auth/elicit/${elicitationId}`;
}
