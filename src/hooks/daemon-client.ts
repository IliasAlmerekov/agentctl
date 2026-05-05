import { authHeaders, readAuthToken } from "../auth.ts";
import { DAEMON_HTTP_ORIGIN } from "../config.ts";

const HOOK_TIMEOUT_MS = 130;

type HookFetch = (url: string, init?: RequestInit) => Promise<Response>;

type HookRequestOptions = {
  fetchImpl?: HookFetch;
  origin?: string;
  readToken?: () => string;
};

export async function sendHookRequest<T>(
  path: string,
  input: unknown,
  options: HookRequestOptions = {},
): Promise<T | null> {
  try {
    const token = (options.readToken ?? readAuthToken)();
    const res = await (options.fetchImpl ?? fetch)(
      `${options.origin ?? DAEMON_HTTP_ORIGIN}${path}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(token),
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(HOOK_TIMEOUT_MS),
      },
    );

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as T;
  } catch {
    return null;
  }
}
