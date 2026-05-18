import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initSchema } from "./db.ts";
import { createWsHandlers } from "./ws-handlers.ts";
import type { WSData } from "../types.ts";

const TOKEN = "test-token";
const WRONG_TOKEN = "wrong-token";

function createTestDb() {
  const db = new Database(":memory:");
  initSchema(db);
  return db;
}

type MockWs = {
  data: WSData;
  sent: string[];
  closeCode: number | undefined;
  send(msg: string): void;
  close(code?: number, reason?: string): void;
};

function mockWs(): MockWs {
  const ws: MockWs = {
    data: { connectedAt: Date.now(), authenticated: false },
    sent: [],
    closeCode: undefined,
    send(msg) {
      ws.sent.push(msg);
    },
    close(code) {
      ws.closeCode = code;
    },
  };
  return ws;
}

describe("createWsHandlers", () => {
  test("open does not add ws to client set or send any data", () => {
    const clients = new Set<any>();
    const handlers = createWsHandlers(createTestDb(), clients, TOKEN);
    const ws = mockWs();

    handlers.open(ws as any);

    expect(clients.has(ws)).toBe(false);
    expect(ws.sent).toHaveLength(0);
  });

  test("valid auth message authenticates ws and delivers agents_update", () => {
    const clients = new Set<any>();
    const handlers = createWsHandlers(createTestDb(), clients, TOKEN);
    const ws = mockWs();

    handlers.open(ws as any);
    handlers.message(ws as any, JSON.stringify({ type: "auth", token: TOKEN }));

    expect(ws.data.authenticated).toBe(true);
    expect(clients.has(ws)).toBe(true);
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toMatchObject({ type: "agents_update" });
  });

  test("wrong token closes ws with code 4401", () => {
    const clients = new Set<any>();
    const handlers = createWsHandlers(createTestDb(), clients, TOKEN);
    const ws = mockWs();

    handlers.open(ws as any);
    handlers.message(ws as any, JSON.stringify({ type: "auth", token: WRONG_TOKEN }));

    expect(ws.closeCode).toBe(4401);
    expect(ws.data.authenticated).toBe(false);
    expect(clients.has(ws)).toBe(false);
  });

  test("malformed json as first message closes ws with code 4401", () => {
    const clients = new Set<any>();
    const handlers = createWsHandlers(createTestDb(), clients, TOKEN);
    const ws = mockWs();

    handlers.open(ws as any);
    handlers.message(ws as any, "not-valid-json");

    expect(ws.closeCode).toBe(4401);
  });

  test("non-auth message type when unauthenticated closes ws with code 4401", () => {
    const clients = new Set<any>();
    const handlers = createWsHandlers(createTestDb(), clients, TOKEN);
    const ws = mockWs();

    handlers.open(ws as any);
    handlers.message(ws as any, JSON.stringify({ type: "subscribe" }));

    expect(ws.closeCode).toBe(4401);
  });

  test("close removes ws from clients", () => {
    const clients = new Set<any>();
    const handlers = createWsHandlers(createTestDb(), clients, TOKEN);
    const ws = mockWs();

    clients.add(ws);
    handlers.close(ws as any);

    expect(clients.has(ws)).toBe(false);
  });
});
