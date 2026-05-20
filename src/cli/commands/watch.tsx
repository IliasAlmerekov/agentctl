import React, { useState, useEffect, useRef, useCallback } from "react";
import { render, Box, Text, useInput, useStdout } from "ink";
import { daemonWsUrl, daemonWsAuthMessage, apiAgents, apiInject, apiCap, apiKill, apiStatus } from "../api.ts";
import type { Agent, AgentEvent } from "../../types.ts";

export type WatchGuardResult =
  | { ok: true }
  | { ok: false; message: string; exitCode: 1 };

export function watchGuard(streams: {
  stdin: boolean | undefined;
  stdout: boolean | undefined;
}): WatchGuardResult {
  if (!streams.stdin || !streams.stdout) {
    return { ok: false, message: "agentctl watch requires a TTY", exitCode: 1 };
  }
  return { ok: true };
}

export function reconnectDelay(attempt: number, baseMs = 1000, maxMs = 10_000): number {
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}

type Mode = "browse" | "inject" | "cap" | "confirm_kill";

interface Flash {
  text: string;
  color: string;
}

const CONTEXT_WINDOW = 200_000;
const FINISHED_VISIBLE_MS = 4 * 60 * 60 * 1_000; // hide finished sessions after 4 hours

export function agentLabel(
  agent: Pick<Agent, "description" | "cwd" | "session_id">,
  home = process.env.HOME ?? "",
): string {
  if (agent.description) return agent.description;
  if (agent.cwd) {
    const path = home ? agent.cwd.replace(home, "~") : agent.cwd;
    const parts = path.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? path;
  }
  return `session:${agent.session_id.slice(0, 8)}`;
}

export function filterRecentAgents(agents: Agent[], now = Date.now()): Agent[] {
  return agents.filter((a) => {
    if (a.status === "running") return true;
    const anchor = a.ended_at ?? a.started_at;
    return now - anchor < FINISHED_VISIBLE_MS;
  });
}

function useTerminalWidth(): number {
  const { stdout } = useStdout();
  const [width, setWidth] = useState(stdout?.columns ?? 80);
  useEffect(() => {
    if (!stdout) return;
    const handler = () => setWidth(stdout.columns ?? 80);
    stdout.on("resize", handler);
    return () => { stdout.off("resize", handler); };
  }, [stdout]);
  return width;
}

function gridCols(termWidth: number): number {
  if (termWidth >= 160) return 3;
  if (termWidth >= 100) return 2;
  return 1;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function statusColor(status: Agent["status"]): string {
  switch (status) {
    case "running": return "green";
    case "done": return "gray";
    case "killed": return "red";
    case "budget_exceeded": return "red";
    case "stale": return "yellow";
  }
}

function statusIcon(status: Agent["status"]): string {
  switch (status) {
    case "running": return "●";
    case "done": return "✓";
    case "killed": return "✗";
    case "budget_exceeded": return "⚡";
    case "stale": return "~";
  }
}

function statusLabel(status: Agent["status"]): string {
  switch (status) {
    case "running": return "running";
    case "done": return "done";
    case "killed": return "killed";
    case "budget_exceeded": return "budget";
    case "stale": return "stale";
  }
}

function ProgressBar({
  label,
  used,
  max,
  barWidth,
}: {
  label: string;
  used: number;
  max: number;
  barWidth: number;
}) {
  const pct = Math.min(used / max, 1);
  const filled = Math.round(pct * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  const color = pct > 0.9 ? "red" : pct > 0.65 ? "yellow" : "cyan";
  return (
    <Box>
      <Text dimColor>{label} </Text>
      <Text color={color}>{bar}</Text>
      <Text dimColor>{" "}{formatTokens(used)}<Text color="gray">/</Text>{formatTokens(max)}</Text>
    </Box>
  );
}

function AgentCard({
  agent,
  selected,
  cardWidth,
}: {
  agent: Agent;
  selected: boolean;
  cardWidth: number;
}) {
  const color = statusColor(agent.status);
  const icon = statusIcon(agent.status);
  const label = agentLabel(agent);
  const innerWidth = cardWidth - 2; // subtract border chars
  const barWidth = Math.max(6, innerWidth - 20);
  const cwd = agent.cwd
    ? agent.cwd.replace(process.env.HOME ?? "", "~")
    : null;

  const borderColor = selected ? "cyan" : agent.status === "running" ? "green" : "gray";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      width={cardWidth}
      paddingX={1}
    >
      {/* Title */}
      <Box gap={1}>
        <Text color={color}>{icon}</Text>
        <Text bold={selected} color={selected ? "cyan" : "white"}>
          {truncate(label, innerWidth - 10)}
        </Text>
        <Box flexGrow={1} />
        <Text dimColor color={color}>{statusLabel(agent.status)}</Text>
      </Box>

      {/* CWD */}
      {cwd ? (
        <Text dimColor>{truncate(cwd, innerWidth - 2)}</Text>
      ) : (
        <Text> </Text>
      )}

      {/* Current tool */}
      {agent.status === "running" && agent.current_tool ? (
        <Text color="blue">{"↳ "}{truncate(agent.current_tool, innerWidth - 4)}</Text>
      ) : (
        <Text dimColor>{"  "}</Text>
      )}

      {/* Progress bars */}
      <Box flexDirection="column" marginTop={1}>
        {agent.token_budget != null && (
          <ProgressBar
            label="Budget "
            used={agent.tokens_used}
            max={agent.token_budget}
            barWidth={barWidth}
          />
        )}
        <ProgressBar
          label="Context"
          used={agent.tokens_used}
          max={CONTEXT_WINDOW}
          barWidth={barWidth}
        />
      </Box>

      {/* Runtime */}
      <Box marginTop={1}>
        <Text dimColor>
          {formatElapsed(agent.started_at, agent.ended_at)}
        </Text>
      </Box>
    </Box>
  );
}

function formatElapsed(startedAt: number, endedAt: number | null): string {
  const end = endedAt ?? Date.now();
  const ms = end - startedAt;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function AgentGrid({
  agents,
  cursor,
  termWidth,
}: {
  agents: Agent[];
  cursor: number;
  termWidth: number;
}) {
  const cols = gridCols(termWidth);
  const cardWidth = Math.floor((termWidth - cols) / cols);

  const rows: Agent[][] = [];
  for (let i = 0; i < agents.length; i += cols) {
    rows.push(agents.slice(i, i + cols));
  }

  return (
    <Box flexDirection="column">
      {rows.map((row, rowIdx) => (
        <Box key={rowIdx} flexDirection="row">
          {row.map((agent, colIdx) => {
            const agentIdx = rowIdx * cols + colIdx;
            return (
              <AgentCard
                key={agent.session_id}
                agent={agent}
                selected={agentIdx === cursor}
                cardWidth={cardWidth}
              />
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function InputField({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      <Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1}>
        <Text color="cyan" bold>{label}</Text>
        <Box>
          <Text color="cyan">{"❯ "}</Text>
          <Text>{value}</Text>
          <Text color="cyan">{"▌"}</Text>
        </Box>
      </Box>
    </Box>
  );
}

function HelpBar({ mode, selectedAgent, cols }: { mode: Mode; selectedAgent: Agent | null; cols: number }) {
  if (mode === "inject") {
    return (
      <Text dimColor>
        <Text color="cyan">{"Enter"}</Text>{" send  ·  "}<Text color="gray">{"Esc"}</Text>{" cancel"}
      </Text>
    );
  }
  if (mode === "cap") {
    return (
      <Text dimColor>
        <Text color="cyan">{"Enter"}</Text>{" set cap  ·  "}<Text color="gray">{"Esc"}</Text>{" cancel"}
      </Text>
    );
  }
  if (mode === "confirm_kill") {
    return (
      <Text>
        <Text color="red" bold>{"Kill agent? "}</Text>
        <Text color="green">{"y"}</Text>
        <Text dimColor>{"/"}</Text>
        <Text color="gray">{"n"}</Text>
      </Text>
    );
  }

  const canAct = selectedAgent?.status === "running";
  const nav = cols > 1 ? "↑↓←→" : "↑↓";
  return (
    <Text dimColor>
      <Text color="cyan">{nav}</Text>{" navigate"}
      {canAct && (
        <Text>
          {"  ·  "}
          <Text color="yellow">{"i"}</Text>{" inject  ·  "}
          <Text color="red">{"k"}</Text>{" kill  ·  "}
          <Text color="blue">{"c"}</Text>{" cap"}
        </Text>
      )}
      {"  ·  "}
      <Text color="gray">{"q"}</Text>{" quit"}
    </Text>
  );
}

function Watch() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [mode, setMode] = useState<Mode>("browse");
  const [inputText, setInputText] = useState("");
  const [flash, setFlash] = useState<Flash | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const termWidth = useTerminalWidth();
  const cols = gridCols(termWidth);

  const showFlash = useCallback((text: string, color: string) => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash({ text, color });
    flashTimer.current = setTimeout(() => setFlash(null), 2500);
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    function connect() {
      ws = new WebSocket(daemonWsUrl());

      ws.onopen = () => {
        ws?.send(daemonWsAuthMessage());
        setConnected(true);
        reconnectAttempt.current = 0;
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        const delay = reconnectDelay(reconnectAttempt.current);
        reconnectAttempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onmessage = (e) => {
        const event: AgentEvent = JSON.parse(e.data as string);
        if (event.type === "agents_update") setAgents(filterRecentAgents(event.agents));
        if (event.type === "loop_detected")
          setAlerts((prev) => [...prev.slice(-4), `⚠  ${event.message}`]);
        if (event.type === "budget_exceeded")
          setAlerts((prev) => [...prev.slice(-4), `⚡ ${event.message}`]);
        if (event.type === "injection_delivered")
          showFlash(`✓ Message delivered to agent`, "green");
      };
    }

    apiAgents().then((a) => setAgents(filterRecentAgents(a))).catch(() => {});
    connect();

    return () => {
      cancelled = true;
      ws?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [showFlash]);

  const selectedAgent = agents[cursor] ?? null;

  useInput((input, key) => {
    if (mode === "browse") {
      if (key.upArrow) {
        setCursor((c) => Math.max(0, c - cols));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => Math.min(agents.length - 1, c + cols));
        return;
      }
      if (key.leftArrow) {
        setCursor((c) => (c % cols === 0 ? c : c - 1));
        return;
      }
      if (key.rightArrow) {
        setCursor((c) => (c % cols === cols - 1 || c + 1 >= agents.length ? c : c + 1));
        return;
      }
      if (input === "q" || key.escape) {
        process.exit(0);
      }
      if (!selectedAgent || selectedAgent.status !== "running") return;
      if (input === "i") {
        setMode("inject");
        setInputText("");
        return;
      }
      if (input === "k") {
        setMode("confirm_kill");
        return;
      }
      if (input === "c") {
        setMode("cap");
        setInputText("");
        return;
      }
      return;
    }

    if (mode === "confirm_kill") {
      if (input === "y" || key.return) {
        if (selectedAgent) {
          apiKill(selectedAgent.session_id)
            .then(() => showFlash(`✓ Kill signal sent`, "red"))
            .catch((err: unknown) =>
              showFlash(`✗ ${err instanceof Error ? err.message : String(err)}`, "red")
            );
        }
        setMode("browse");
        return;
      }
      if (input === "n" || key.escape) {
        setMode("browse");
        return;
      }
      return;
    }

    if (key.escape) {
      setMode("browse");
      setInputText("");
      return;
    }

    if (key.return) {
      if (!selectedAgent) {
        setMode("browse");
        return;
      }
      const text = inputText.trim();
      if (!text) {
        setMode("browse");
        return;
      }
      if (mode === "inject") {
        apiInject(selectedAgent.session_id, text)
          .then(() => showFlash(`✓ Injected: ${text.slice(0, 40)}${text.length > 40 ? "…" : ""}`, "cyan"))
          .catch((err: unknown) =>
            showFlash(`✗ ${err instanceof Error ? err.message : String(err)}`, "red")
          );
      } else if (mode === "cap") {
        const n = parseInt(text, 10);
        if (isNaN(n) || n <= 0) {
          showFlash("✗ Cap must be a positive integer", "red");
        } else {
          apiCap(selectedAgent.session_id, n)
            .then(() => showFlash(`✓ Budget capped at ${n.toLocaleString()} tokens`, "blue"))
            .catch((err: unknown) =>
              showFlash(`✗ ${err instanceof Error ? err.message : String(err)}`, "red")
            );
        }
      }
      setMode("browse");
      setInputText("");
      return;
    }

    if (key.backspace || key.delete) {
      setInputText((t) => t.slice(0, -1));
      return;
    }

    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setInputText((t) => t + input);
    }
  });

  useEffect(() => {
    if (agents.length > 0 && cursor >= agents.length) {
      setCursor(agents.length - 1);
    }
  }, [agents.length, cursor]);

  const running = agents.filter((a) => a.status === "running").length;
  const done = agents.filter((a) => a.status === "done").length;

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box paddingX={1} gap={2} marginBottom={1}>
        <Text bold color="cyan">{"agentctl"}</Text>
        <Text dimColor>{"watch"}</Text>
        <Text>{"  "}</Text>
        {running > 0 ? (
          <Text><Text color="green">{"● "}</Text><Text bold>{String(running)}</Text>{" running"}</Text>
        ) : (
          <Text dimColor>{"idle"}</Text>
        )}
        {done > 0 && (
          <Text dimColor>{"· "}{String(done)}{" done"}</Text>
        )}
        <Box flexGrow={1} />
        {!connected && (
          <Text color="red">{"⚡ reconnecting…"}</Text>
        )}
      </Box>

      {/* Grid or empty state */}
      {agents.length === 0 ? (
        <Box paddingX={2} paddingY={2}>
          <Text dimColor>{"No active agents — start a Claude Code session to see them here."}</Text>
        </Box>
      ) : (
        <AgentGrid agents={agents} cursor={cursor} termWidth={termWidth} />
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          {alerts.map((a, i) => (
            <Text key={i} color="yellow">{a}</Text>
          ))}
        </Box>
      )}

      {/* Input modal */}
      {mode === "inject" && (
        <InputField
          label={`Inject → ${selectedAgent ? agentLabel(selectedAgent) : ""}`}
          value={inputText}
        />
      )}
      {mode === "cap" && (
        <InputField
          label={`Set cap → ${selectedAgent ? agentLabel(selectedAgent) : ""}`}
          value={inputText}
        />
      )}

      {/* Flash */}
      {flash && (
        <Box paddingX={1} marginTop={1}>
          <Text color={flash.color}>{flash.text}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box paddingX={1} marginTop={1}>
        <HelpBar mode={mode} selectedAgent={selectedAgent} cols={cols} />
      </Box>
    </Box>
  );
}

async function tryStartDaemon(): Promise<void> {
  try {
    await apiStatus();
    return;
  } catch {
    // daemon not reachable
  }

  const agentctlHome =
    process.env.AGENTCTL_HOME ?? `${process.env.HOME}/.agentctl`;
  const daemonBin = `${agentctlHome}/bin/agentctl-daemon`;

  try {
    if (!await Bun.file(daemonBin).exists()) return;
    const proc = Bun.spawn([daemonBin], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    proc.unref();
  } catch {
    // TUI will show reconnecting state
  }
}

export function cmdWatch() {
  const guard = watchGuard({
    stdin: process.stdin.isTTY,
    stdout: process.stdout.isTTY,
  });
  if (!guard.ok) {
    console.error(guard.message);
    process.exit(guard.exitCode);
  }
  tryStartDaemon().then(() => render(<Watch />));
}
