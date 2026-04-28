import type { Database } from "bun:sqlite";
import type { Injection } from "../types.ts";

export function getPendingInjection(
  db: Database,
  sessionId: string,
): Injection | null {
  return db
    .query<Injection, string>(
      `SELECT * FROM injections
       WHERE session_id = ? AND status = 'pending'
       ORDER BY created_at
       LIMIT 1`,
    )
    .get(sessionId);
}

export function markDelivered(db: Database, id: number): void {
  db.run(
    "UPDATE injections SET status = 'delivered', delivered_at = ? WHERE id = ?",
    [Date.now(), id],
  );
}

export function createInjection(
  db: Database,
  sessionId: string,
  message: string,
): void {
  db.run(
    `INSERT INTO injections (session_id, message, status, created_at)
     VALUES (?, ?, 'pending', ?)`,
    [sessionId, message, Date.now()],
  );
}
