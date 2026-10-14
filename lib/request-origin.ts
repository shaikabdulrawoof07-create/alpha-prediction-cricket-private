import { headers } from "next/headers";

export async function getRequestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const proto =
    forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");

  return `${proto}://${host}`;
}
