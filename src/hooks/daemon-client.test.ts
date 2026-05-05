import { describe, expect, test } from "bun:test";
import { AUTH_HEADER } from "../auth.ts";
import { sendHookRequest } from "./daemon-client.ts";

describe("sendHookRequest", () => {
  test("sends hook requests with the local auth token", async () => {
    const observed: {
      body?: unknown;
      header: string | null;
      url: string;
    } = {
      header: null,
      url: "",
    };

    const result = await sendHookRequest<{ block: boolean }>(
      "/hook/pre",
      { session_id: "agent-a" },
      {
        origin: "http://agentctl.test",
        readToken: () => "test-token",
        fetchImpl: async (url, init) => {
          observed.url = String(url);
          observed.header = new Headers(init?.headers).get(AUTH_HEADER);
          observed.body = JSON.parse(String(init?.body));
          return Response.json({ block: false });
        },
      },
    );

    expect(result).toEqual({ block: false });
    expect(observed.url).toBe("http://agentctl.test/hook/pre");
    expect(observed.header).toBe("test-token");
    expect(observed.body).toEqual({ session_id: "agent-a" });
  });

  test("fails open without calling the daemon when the auth token is unavailable", async () => {
    let fetchCalled = false;

    const result = await sendHookRequest(
      "/hook/post",
      { session_id: "agent-a" },
      {
        readToken: () => {
          throw new Error("missing token");
        },
        fetchImpl: async () => {
          fetchCalled = true;
          return Response.json({ ok: true });
        },
      },
    );

    expect(result).toBeNull();
    expect(fetchCalled).toBe(false);
  });

  test("fails open on auth rejection without parsing unauthorized JSON as a hook decision", async () => {
    let jsonParsed = false;
    const unauthorized = new Response(
      JSON.stringify({ ok: false, error: "unauthorized" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );

    Object.defineProperty(unauthorized, "json", {
      value: async () => {
        jsonParsed = true;
        return { ok: false, error: "unauthorized" };
      },
    });

    const result = await sendHookRequest<{ block: boolean }>(
      "/hook/pre",
      { session_id: "agent-a" },
      {
        readToken: () => "wrong-token",
        fetchImpl: async () => unauthorized,
      },
    );

    expect(result).toBeNull();
    expect(jsonParsed).toBe(false);
  });
});
