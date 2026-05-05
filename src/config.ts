export const DAEMON_HOST = "127.0.0.1";
export const DAEMON_PORT = 47823;
export const DAEMON_HTTP_ORIGIN = `http://${DAEMON_HOST}:${DAEMON_PORT}`;
export const DAEMON_WS_ORIGIN = `ws://${DAEMON_HOST}:${DAEMON_PORT}`;

export function daemonListenOptions() {
  return {
    hostname: DAEMON_HOST,
    port: DAEMON_PORT,
  } as const;
}
