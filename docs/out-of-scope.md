# MVP Out Of Scope

agentctl's beta scope is intentionally narrow: observe local Claude Code agents and provide the three controls already implemented by the CLI: `inject`, `cap`, and `stop-next-tool-call`. The older `kill` command remains as a compatibility alias for `stop-next-tool-call`.

The following items are intentionally out of scope for the MVP and first production-ready beta:

- Windows packaging or installer support.
- remote daemon or multi-machine control.
- Web UI. Use the `agentctl watch` TUI for the beta.
- per-tool-type budgets. The supported budget control is one total token cap per agent.
- external observability integrations, including OpenTelemetry, Grafana, hosted dashboards, and external metrics pipelines.

These exclusions keep the beta focused on the local single-user control surface that is already implemented and tested.
