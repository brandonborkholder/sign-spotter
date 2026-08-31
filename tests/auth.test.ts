import { describe, expect, it, vi } from "vitest";
import {
  AuthenticationError,
  authenticatePublicStuff,
  parseAuthResponse,
} from "../src/auth";

describe("parseAuthResponse", () => {
  it("returns the session key from a successful login", () => {
    expect(
      parseAuthResponse({
        response: { api_key: "session-key-123", status: { code: 200 } },
      }),
    ).toEqual({ apiKey: "session-key-123" });
  });

  it("surfaces PublicStuff authentication failures", () => {
    expect(() =>
      parseAuthResponse({
        response: { status: { code: 400, message: "Invalid credentials" } },
      }),
    ).toThrowError(new AuthenticationError("Invalid credentials"));
  });
});

describe("authenticatePublicStuff", () => {
  it("posts form-encoded credentials without retaining or logging them", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ response: { api_key: "returned-session", status: { code: 200 } } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(
      authenticatePublicStuff("person@example.test", "one-time-password", fetcher),
    ).resolves.toEqual({ apiKey: "returned-session" });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://vc0.publicstuff.com/api/2.1/user_login?device=iframe",
    );
    expect(init).toMatchObject({ method: "POST", credentials: "omit", mode: "cors" });
    expect(new URLSearchParams(String(init?.body))).toEqual(
      new URLSearchParams({
        email: "person@example.test",
        password: "one-time-password",
      }),
    );
    expect(new Headers(init?.headers).get("PublicStuff-Client")).toBe("1295");
  });
});
