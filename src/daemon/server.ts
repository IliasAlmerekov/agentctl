import { startDaemon } from "./startup.ts";

const runtime = (() => {
  try {
    return startDaemon();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();

export const db = runtime.db;
