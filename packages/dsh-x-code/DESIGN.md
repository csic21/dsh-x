# Code review workbench

## Purpose and scope

Code is an independent DSH plugin for reading a local repository, reviewing a chosen change set, using the current DSH model to review captured source and asking an existing Agent to fix selected findings, and reviewing the resulting changes. It does not replace the Agents runtime, native permission UI, conversation composer, or editor. First-release scope is the current local Git repository, including worktree, staged and base…HEAD comparisons. GitHub automation, arbitrary file editing, commits and publishing are outside this workflow.

## Product structure

A Code entry in the main navigation opens a full-width workbench. A compact entry in the conversation input dock opens the same workbench in the current session. The root panel declares a session-scoped child through the official Slot renderer, so the session and its composer actions stay framework-owned.

The top bar contains Code, the repository name, target scope, Refresh and the primary Review action. An optional base-ref field appears only for base…HEAD. The visible current context is either Current workspace or Reviewed snapshot. Changing this context never starts an Agent. Repository browsing and current-model review work without Agents installed. Repair actions explain when the Agents dependency is missing.

Desktop uses three tracks: a file navigator, a flexible source viewer, and a findings panel. Track widths favor source text. At 650–1100px canvas width, source stays visible beside the file navigator; a Files / Findings switch replaces only the left pane. Below 650px, Files / Code / Findings become single-pane tabs. Wider canvases show all three panes. This uses the component's container width, not only the browser width, because DSH can reserve space for its own sidebars. At narrow widths the diff defaults to unified while retaining the user's wider-screen split preference. On short viewports or extreme zoom, the whole panel can scroll and the workbench keeps a usable minimum height.

## Reading source and changes

- The file navigator has Changed / All filters, a filename/path search, a nested directory tree, Git-status markers and explicit review checkboxes. Opening a file does not select it for review. Checkboxes are bounded by backend selection limits.
- The Source tab shows the full target file, read-only. Its label identifies the origin: Working tree, Index, HEAD, or Reviewed snapshot. A separate Before choice shows the comparison's old version. The UI never calls the old version “original source.”
- The Diff tab offers Unified / Split and Wrap. Both preserve old/new line numbers. New/deleted files remain readable as one-sided comparisons. Hunk positions are backend Git output, not a client-computed edit graph.
- Syntax coloring uses the official public DSH code highlighter. The official turn-diff component is private to its deliverables plugin and is not imported by source path. Code owns only the thin row presentation required for its repository snapshot and finding navigation.
- Find in file is local, literal and case-insensitive, shows matches and supports next/previous plus Enter / Shift+Enter. Ctrl/Cmd+F is scoped to a focused Code viewer so browser search elsewhere is unaffected. Escape closes the find row and restores focus.
- A finding's path/line opens the reviewed snapshot and exact old/new side. The affected range is highlighted and scrolled into view. Source and diff text never use raw HTML insertion.
- Selection changes clear the prior file synchronously; only a response matching session, scope, workspace/snapshot, path and request generation may populate the viewer. Navigation keeps per-file scroll while the same version is selected. Changed versions start at the top unless navigating to a finding.
- Binary, oversized, symlink, missing, untracked and empty files have explicit states. Bounds are visible. “Not displayed” or “not reviewed” is never represented as an empty successful diff.

## Review interaction

1. Choose Worktree, Staged, or Base…HEAD; enter the base only for the last option. Browse freely.
2. Select relevant changed files. Review opens a compact setup form with the current DSH session model as the default reviewer and the selected-file count. This source-only reviewer has no tools. Native reviewers appear only when host read-only capability supports them; their models come from the existing Agents catalog. Repair always uses an explicitly selected native Agent. No model IDs are invented. The setup distinguishes snapshot-only DSH review from native review, whose read-only file effects do not imply secret-read or network isolation and can prevent vendor startup writes.
3. Prepare review adds an exact, version-bound Code tool request to the existing composer using captureInsertion / insertText, then returns to the conversation. It never overwrites a draft or sends automatically. Official DSH tool approval and the chosen Agents adapter own execution.
4. The workbench shows the persisted review phase and selected snapshot. Findings appear as structured cards: severity, concise title, location, explanation, evidence and trigger. Evidence/details use disclosure controls rather than filling the panel with instructions.
5. Select individual open findings. Prepare fix generates a request tied to review ID and finding IDs. Stale snapshots, unavailable runtime and incomplete/blocked operation state prevent unsafe preparation. The server rechecks the same restrictions at execution time.
6. A completed repair is labeled Needs re-review. It does not silently mark findings resolved. Re-review prepares a new review on the current worktree with the prior review ID as context. The new snapshot and previous review remain distinct. Review history opens the full earlier findings and their captured source in an explicitly historical, read-only view. A Latest review action returns to the active result; old records never offer repairs.

The UI provides Stop for an exact Code operation ID. The server aborts that operation’s outer signal, which also reaches a delegated Agent. Stop first shows Stopping; completion waits for authoritative settlement. Leaving the panel never cancels work. Cancelled, failed and interrupted runs retain readable findings/history, never gain a green pass. An interrupted review can be inspected and explicitly rerun on a new snapshot. Generic native continuation does not update a Code review record and is not presented as a Code resume action. Nothing replays silently after reconnection.

## State and trust model

| State | Presentation | Primary next step |
| --- | --- | --- |
| No session | Compact empty state | Open a conversation |
| Loading repository | Reserved panel skeleton/status | Wait; retain no mismatched source |
| Not a Git repository | Actionable repository message | Select a Git-backed workspace |
| No changed files | Source browsing remains available | Switch scope or browse All |
| No selected files | Review disabled with count | Select files |
| Review pending/running | Live status and exact-run stop when offered | Open conversation for permissions/questions |
| Awaiting permission/input | Distinct required-action status | Return to conversation |
| Review complete with findings | Severity counts and cards | Select findings to fix |
| Review complete, zero findings | No findings in selected files | Inspect coverage and checks |
| Malformed/incomplete result | Review incomplete; retained diagnostic | Retry explicitly |
| Repair complete | Needs re-review | Re-review current changes |
| Snapshot stale | Amber version banner and old snapshot label | Refresh / start a fresh review |
| Connection lost | Read-only retained snapshot + reconnect notice | Retry; actions disabled |
| Cancellation unconfirmed | Unknown outcome, actions fenced | Refresh and inspect the Code operation |
| Interrupted after restart | Interrupted, no automatic replay | Run a new review on a fresh snapshot |

A run ending is not a test result. Review completeness, finding count, snapshot freshness and verification are separate facts. Checks display Passed / Failed / Running / Not run / Blocked only from structured evidence. The empty checks list reads Not run. Successful review with no findings says exactly that; it does not say code is safe, accepted or tests passed. Partial file coverage and storage/view truncation are stated next to the relevant count.

## Accessibility, appearance and localization

The design uses DSH theme aliases, subtle surface separation, one restrained accent, clear selected rows and readable monospace code. Severity uses both text and color. There are no giant introductory cards, decorative dashboards or repeated safety paragraphs. Dense details are disclosed on demand. All visible labels, empty/error/loading states, accessible names, tooltips, counts and timestamps are locale-owned in English and Chinese; runtime/model names, file paths and model-generated review evidence remain source data.

Buttons, checkboxes, selects and disclosures use native semantics and visible focus. Source/Diff and narrow-panel tabs expose tab roles, keyboard arrows, Home/End and selected state. File navigation is a nested native `<details>`/`<summary>` disclosure list of native buttons, not a hand-built ARIA tree; every directory and file stays reachable by keyboard. File opening and review selection are independent keyboard targets. Status announcements use polite live regions; failures use alerts without repeatedly announcing source text. Code content scrolls within the viewer and cannot force the workbench wider than its container.

## Acceptance criteria

- Read an unchanged file before any review; select Source / Before / Diff; verify displayed origins and line numbers.
- Review each scope against its exact content source, including staged content different from both HEAD and worktree.
- Search files and source, navigate multiple matches, select a finding, and land on its exact snapshot/side/range.
- Switch files, scopes, sessions and snapshots during delayed reads; no previous source/findings flash into the new target.
- Select findings, prepare an explicit fix without altering existing draft text; complete repair and re-review a new snapshot.
- Change a file or HEAD after review; stale UI and server both prevent fixing the obsolete snapshot.
- Exercise empty, binary, oversized, deleted, renamed, untracked and long-path files; incomplete coverage remains visible.
- Cancel, deny permission, lose connection and restart during operation; no auto replay and no false completed/pass state.
- Switch English/Chinese in place; every control and state updates while raw source/evidence is unchanged.
- Inspect a populated workbench at ordinary desktop, narrow DSH panel and 390px width. There is no page overflow or obscured primary action; source remains scrollable.
- Run unit and real compiled-client DOM tests. Run assembled official DSH browser checks and capture populated source/diff/findings screenshots. Synthetic fixtures are labeled; they do not establish live vendor/model success.
