import React, { useState, useEffect, useRef, useCallback } from "react";
import { render, Box, Text, useInput } from "ink";
import { daemonWsUrl, daemonWsAuthMessage, apiAgents, apiInject, apiCap, apiKill } from "../api.ts";
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

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function TokenBar({ used, budget }: { used: number; budget?: number }) {
  if (!budget) {
    return <Text dimColor>{formatTokens(used)}</Text>;
  }
  const pct = Math.min(used / budget, 1);
  const filled = Math.round(pct * 12);
  const bar = "█".repeat(filled) + "░".repeat(12 - filled);
  const color = pct > 0.9 ? "red" : pct > 0.65 ? "yellow" : "green";
  return (
    <Text>
      <Text color={color}>{bar}</Text>
      <Text dimColor> {formatTokens(used)}/{formatTokens(budget)}</Text>
    </Text>
  );
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

function AgentRow({
  agent,
  selected,
}: {
  agent: Agent;
  selected: boolean;
}) {
  const color = statusColor(agent.status);
  const icon = statusIcon(agent.status);
  const indent = (agent.depth ?? 0) * 2;
  const label = agent.description ?? `session:${agent.session_id.slice(0, 8)}`;

  return (
    <Box flexDirection="column">
      <Box>
        <Text>{" ".repeat(indent)}</Text>
        <Text color={selected ? "cyan" : undefined}>{selected ? "▶ " : "  "}</Text>
        <Text color={color}>{icon} </Text>
        <Text bold={selected} color={selected ? "white" : undefined}>
          {label}{"  "}
        </Text>
        <TokenBar used={agent.tokens_used} budget={agent.token_budget ?? undefined} />
        {agent.status === "running" && agent.current_tool && (
          <Text dimColor>  ↳ {agent.current_tool}</Text>
        )}
      </Box>
      {agent.status === "running" && agent.cwd && (
        <Box>
          <Text>{" ".repeat(indent + 4)}</Text>
          <Text dimColor color="gray">
            {agent.cwd.replace(process.env.HOME ?? "", "~")}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function Divider() {
  return <Text dimColor>{"─".repeat(60)}</Text>;
}

function InputField({ label, value }: { label: string; value: string }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="cyan" bold>{label}</Text>
      <Box>
        <Text color="cyan">❯ </Text>
        <Text>{value}</Text>
        <Text color="cyan">▌</Text>
      </Box>
    </Box>
  );
}

function HelpBar({ mode, selectedAgent }: { mode: Mode; selectedAgent: Agent | null }) {
  if (mode === "inject") {
    return (
      <Text dimColor>
        <Text color="cyan">Enter</Text> send  ·  <Text color="gray">Esc</Text> cancel
      </Text>
    );
  }
  if (mode === "cap") {
    return (
      <Text dimColor>
        <Text color="cyan">Enter</Text> set cap  ·  <Text color="gray">Esc</Text> cancel
      </Text>
    );
  }
  if (mode === "confirm_kill") {
    return (
      <Text>
        <Text color="red" bold>Kill agent? </Text>
        <Text color="green">y</Text>
        <Text dimColor>/</Text>
        <Text color="gray">n</Text>
      </Text>
    );
  }

  const canAct = selectedAgent?.status === "running";
  return (
    <Text dimColor>
      <Text color="cyan">↑↓</Text> navigate
      {canAct && <Text>{"  ·  "}<Text color="yellow">i</Text>{" inject  ·  "}<Text color="red">k</Text>{" kill  ·  "}<Text color="blue">c</Text>{" cap"}</Text>}
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
        if (event.type === "agents_update") setAgents(event.agents);
        if (event.type === "loop_detected")
          setAlerts((prev) => [...prev.slice(-4), `⚠  ${event.message}`]);
        if (event.type === "budget_exceeded")
          setAlerts((prev) => [...prev.slice(-4), `⚡ ${event.message}`]);
        if (event.type === "injection_delivered")
          showFlash(`✓ Message delivered to agent`, "green");
      };
    }

    apiAgents().then(setAgents).catch(() => {});
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
        setCursor((c) => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow) {
        setCursor((c) => Math.min(agents.length - 1, c + 1));
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

    // inject / cap input mode
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

    // Printable characters only (no control keys)
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setInputText((t) => t + input);
    }
  });

  // keep cursor in bounds when agent list shrinks
  useEffect(() => {
    if (agents.length > 0 && cursor >= agents.length) {
      setCursor(agents.length - 1);
    }
  }, [agents.length, cursor]);

  const running = agents.filter((a) => a.status === "running").length;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      {/* Header */}
      <Box gap={2} marginBottom={1}>
        <Text bold color="cyan">agentctl</Text>
        <Text dimColor>
          {running > 0 ? (
            <Text><Text color="green">●</Text> {running} running</Text>
          ) : (
            "idle"
          )}
        </Text>
        {!connected && (
          <Text color="red">disconnected — reconnecting…</Text>
        )}
      </Box>

      <Divider />

      {/* Agent list */}
      <Box flexDirection="column" marginY={1}>
        {agents.length === 0 ? (
          <Text dimColor>  no active agents — start a Claude Code session</Text>
        ) : (
          agents.map((a, i) => (
            <AgentRow key={a.session_id} agent={a} selected={i === cursor} />
          ))
        )}
      </Box>

      {/* Alerts */}
      {alerts.length > 0 && (
        <>
          <Divider />
          <Box flexDirection="column" marginTop={1}>
            {alerts.map((a, i) => (
              <Text key={i} color="yellow">{a}</Text>
            ))}
          </Box>
        </>
      )}

      {/* Input modal */}
      {mode === "inject" && (
        <InputField
          label={`Inject message → ${selectedAgent?.description ?? selectedAgent?.session_id.slice(0, 8) ?? ""}`}
          value={inputText}
        />
      )}
      {mode === "cap" && (
        <InputField
          label={`Set token cap → ${selectedAgent?.description ?? selectedAgent?.session_id.slice(0, 8) ?? ""}`}
          value={inputText}
        />
      )}

      {/* Flash notification */}
      {flash && (
        <Box marginTop={1}>
          <Text color={flash.color}>{flash.text}</Text>
        </Box>
      )}

      {/* Footer */}
      <Box marginTop={1}>
        <Divider />
      </Box>
      <HelpBar mode={mode} selectedAgent={selectedAgent} />
    </Box>
  );
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
  render(<Watch />);
}
