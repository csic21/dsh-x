# Experimental owned OpenCode browser mode

Source pin: official OpenCode **v1.19.3**, tag commit `e3c4eb242585dcd77be1a867391b7c25fd47ce52`.

- [Official release](https://github.com/anomalyco/opencode/releases/tag/v1.19.3)
- [Public free-provider selection](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/provider/provider.ts)
- [Configuration construction](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/config/config.ts)
- [Agent normalization](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/core/src/v1/config/agent.ts)
- [Instruction loading](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/session/instruction.ts)
- [MCP configuration scope](https://github.com/anomalyco/opencode/blob/v1.19.3/packages/opencode/src/server/routes/instance/httpapi/groups/mcp.ts)

The official Windows ZIP SHA-256 is `e4ce9117f55fc068414513789f8c7d1049f855d7518bb4e350b9170a3a20d8c3`; Linux tar SHA-256 is `13a8fb2978302071b86f9d7e00da9c8895f9cd846978379c3bdc6a5333536c9b`. The proof workflow verifies the archive hash before execution. Normal plugin users supply a trusted installed executable; the plugin itself checks its reported version, not its binary signature.

## Configuration and scope

Explicit plugin config: `opencode: { mode: 'owned-browser', executable: '/absolute/path/to/opencode' }`. Bounded startup, request, cleanup and turn timeout settings are also accepted. Credentials and arbitrary native config are rejected. This is a separate opt-in mode; existing authenticated external HTTP mode is unchanged.

Setup inspection invokes only `--version`. Explicitly approved `dsh_x_agents_models` starts a fresh owned loopback service without a task prompt, validates its effective config, and reads `/provider`. Entries must belong to the connected `opencode` public provider, support tool calls, and advertise zero for every accepted monetary field. Unknown/tiered pricing fails closed. Models are sorted by exact native ID, marked `free:true`, and never guessed. Each actual run independently repeats these checks and whitelists just the selected model. Native title and summary generation are disabled; every allowed inference model, including compaction, is pinned to that same selection. Provider availability, quotas and future prices remain external facts; no paid fallback or account login occurs.

Each operation gets a new empty native work directory, home, config, data, state, cache and temporary directories beneath an already writable host workspace. All ambient environment entries are removed except minimal executable/system paths. Project config, ancestor AGENTS/CLAUDE instructions, external skills, default plugins, updates, LSP downloads and background watchers are disabled where the pinned runtime supports them. All effective native extensions, instructions, skills URLs/paths, extra agents, references and permission changes are rejected before a task prompt. System-managed policy is not redirected or bypassed. Native startup can still install its official helper dependency into temporary state; the approval discloses this.

The workspace must be outside every Git checkout: OpenCode's Git ancestor discovery is separate from its project-config flag. The plugin refuses such roots rather than risk repository context. Under a restricted host, managed subprocess creation requires full host file-effect confinement. It does not change the host policy or claim network/read isolation. Existing unrestricted hosts keep their explicitly selected policy. Native file, shell, task, question and web-fetch permissions are denied.

## Browser authority

Only `browser:true` on an approved owned run can create the bridge. The bridge exposes two fixed MCP names, `dsh_browser_tabs` and `dsh_browser_action`, to this process. A fresh ephemeral loopback bearer capability exists only in the owned process config and bridge memory. It is not a model argument, user credential, persistent MCP registration or Browser renderer capability.

Each callback executes the existing DSH Browser tool through the genuine live parent ToolRuntime execution, with the original agent/session/root call, a unique child call ID, the parent execution Symbol and combined cancellation signal. The Agents guard admits only its one-use exact child ticket; Browser tools are not globally exempted from the native-run fence. One callback may be pending; the MCP server has a forty-call budget. Native request disconnect/cancellation aborts that exact pending child, and a cancelled request ID cannot be replayed. Browser's lifetime-only ownership service binds the grant to that parent and native run. Closed, unknown or replaced parents fail closed. Browser mutations still require their normal official approval and exact visible tab, document epoch and grant revision. Renderer capabilities never reach OpenCode.

Closing or cancelling revokes Browser ownership synchronously, aborts pending child work, stops the owned process range, closes MCP and verifies managed exit under a bounded cleanup deadline. Unconfirmed cleanup preserves the durable Agents fence and temporary state. Completed runs cannot resume: use a new task and a new explicit page grant. Other native browser adapters are not enabled by this increment.

## Evidence boundary

Unit/protocol tests are synthetic. Real official ToolRuntime integration establishes exact nested ownership and approval behavior, not real model access. The isolated Windows Desktop proof must independently establish the actual free-model reply, native MCP tool events and same visible guest navigation. See the proof report before claiming those outcomes.
