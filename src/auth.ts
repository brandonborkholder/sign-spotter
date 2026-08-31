import { PUBLICSTUFF } from "./config";

type JsonObject = Record<string, unknown>;

export type AuthSession = {
  apiKey: string;
};

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAuthResponse(payload: unknown): AuthSession {
  if (!isObject(payload) || !isObject(payload.response)) {
    throw new AuthenticationError("PublicStuff returned an unexpected login response.");
  }
  const response = payload.response;
  const status = isObject(response.status) ? response.status : null;
  if (status?.code !== 200) {
    const message =
      typeof status?.message === "string"
        ? status.message
        : "PublicStuff did not accept that email and password.";
    throw new AuthenticationError(message);
  }
  if (typeof response.api_key !== "string" || response.api_key.length < 8) {
    throw new AuthenticationError("Login succeeded without a usable session credential.");
  }
  return { apiKey: response.api_key };
}

export async function authenticatePublicStuff(
  email: string,
  password: string,
  fetcher: typeof fetch = fetch,
): Promise<AuthSession> {
  const url = new URL("/api/2.1/user_login", PUBLICSTUFF.apiOrigin);
  url.searchParams.set("device", PUBLICSTUFF.device);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "PublicStuff-Client": String(PUBLICSTUFF.clientId),
      },
      body: new URLSearchParams({ email, password }).toString(),
    });
  } catch {
    throw new AuthenticationError(
      "Could not reach PublicStuff. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    throw new AuthenticationError(`PublicStuff login returned HTTP ${response.status}.`);
  }
  try {
    return parseAuthResponse(await response.json());
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError("PublicStuff returned invalid login data.");
  }
}
