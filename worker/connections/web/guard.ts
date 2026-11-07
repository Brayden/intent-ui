import { HttpError } from "../../lib/http";

/*
 * Outbound fetch guard for the web connection: https only, no private/internal hosts, so a
 * model-chosen URL can't reach internal services. Pure, for testability.
 */

const PRIVATE_IPV4 = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/** Returns the URL if it's safe to fetch; throws a readable 400 otherwise. */
export function safeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HttpError(400, `Not a valid URL: ${input}`);
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") throw new HttpError(400, "Only https URLs can be fetched");
  if (url.username || url.password) throw new HttpError(400, "URLs with credentials can't be fetched");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new HttpError(400, "Internal hosts can't be fetched");
  }
  if (host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (host.startsWith("[") || PRIVATE_IPV4.some((range) => range.test(host))) throw new HttpError(400, "IP addresses in private ranges can't be fetched");
  }
  return url;
}
