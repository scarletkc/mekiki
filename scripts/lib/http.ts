/** Small fetch wrapper for the sync adapters: timeout, retries, JSON or bytes. */

const USER_AGENT = 'mekiki-sync';
const TIMEOUT_MS = 30_000;
const RETRIES = 3;

export class HttpError extends Error {
  override name = 'HttpError';
  constructor(
    readonly status: number,
    url: string,
  ) {
    // Never include request headers here: they may carry an API key.
    super(`HTTP ${status} from ${new URL(url).origin}${new URL(url).pathname}`);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** GET with retries on network errors, 429 and 5xx. Throws HttpError on other statuses. */
async function get<T>(
  url: string,
  accept: string,
  headers: Record<string, string>,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1));
    try {
      const response = await fetch(url, {
        headers: { Accept: accept, 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return await read(response);
      lastError = new HttpError(response.status, url);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  return get(url, 'application/json', headers, (response) => response.json());
}

export function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  return get(url, 'text/html, text/plain, */*', headers, (response) => response.text());
}

export function getBytes(url: string, headers: Record<string, string> = {}): Promise<ArrayBuffer> {
  return get(url, 'application/octet-stream', headers, (response) => response.arrayBuffer());
}
