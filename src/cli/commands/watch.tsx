import React, { useState, useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import { daemonWsUrl, apiAgents } from "../api.ts";
import type { Agent, AgentEvent } from "../../types.ts";

function TokenBar({ used, budget }: { used: number; budget?: number }) {
  if (!budget) return <Text dimColor>{used.toLocaleString()} tokens</Text>;
  const pct = Math.min(used / budget, 1);
  const filled = Math.round(pct * 16);
  const bar = "█".repeat(filled) + "░".repeat(16 - filled);
  const color = pct > 0.9 ? "red" : pct > 0.7 ? "yellow" : "green";
  return (
    <Text>
      <Text color={color}>{bar}</Text>
      <Text dimColor>
        {" "}
        {used.toLocaleString()} / {budget.toLocaleString()}
      </Text>
    </Text>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const statusColor =
    agent.status === "running"
      ? "green"
      : agent.status === "budget_exceeded" || agent.status === "killed"
        ? "red"
        : "gray";

  const icon =
    agent.status === "running"
      ? "●"
      : agent.status === "done"
        ? "✓"
        : agent.status === "stale"
          ? "!"
          : "✗";

  return (
    <Box flexDirection="column" marginLeft={(agent.depth ?? 0) * 3}>
      <Box gap={2}>
        <Text color={statusColor}>{icon}</Text>
        <Text bold={agent.depth === 0}>
          {agent.description ?? agent.session_id.slice(0, 8)}
        </Text>
        <TokenBar
          used={agent.tokens_used}
          budget={agent.token_budget ?? undefined}
        />
      </Box>
      {agent.current_tool && agent.status === "running" && (
        <Box marginLeft={3}>
          <Text dimColor>↳ {agent.current_tool}</Text>
        </Box>
      )}
    </Box>
  );
}

function Watch() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Load initial state
    apiAgents().then(setAgents).catch(() => {});

    const ws = new WebSocket(daemonWsUrl());

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (e) => {
      const event: AgentEvent = JSON.parse(e.data as string);
      if (event.type === "agents_update") setAgents(event.agents);
      if (event.type === "loop_detected")
        setAlerts((prev) => [...prev.slice(-4), `⚠  ${event.message}`]);
      if (event.type === "budget_exceeded")
        setAlerts((prev) => [...prev.slice(-4), `⚡ ${event.message}`]);
    };

    return () => ws.close();
  }, []);

  useInput((input) => {
    if (input === "q") process.exit(0);
  });

  const running = agents.filter((a) => a.status === "running").length;

  return (
    <Box flexDirection="column" padding={1}>
      <Box gap={2}>
        <Text bold>agentctl</Text>
        <Text dimColor>{running} running</Text>
        {!connected && <Text color="red">daemon disconnected</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column" gap={0}>
        {agents.length === 0 ? (
          <Text dimColor>no active agents — start a Claude Code session</Text>
        ) : (
          agents.map((a) => <AgentRow key={a.session_id} agent={a} />)
        )}
      </Box>

      {alerts.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          {alerts.map((a, i) => (
            <Text key={i} color="yellow">
              {a}
            </Text>
          ))}
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>q to quit · agentctl inject {"<id>"} "msg" to steer</Text>
      </Box>
    </Box>
  );
}

export function cmdWatch() {
  render(<Watch />);
}
