# Code review workbench

## Purpose and scope

Code is an independent DSH plugin for reading a local repository, reviewing a chosen change set with the current DSH model, and keeping the resulting evidence. It does not replace the conversation, approval UI, or editor. First-release scope is the current local Git repository, including worktree, staged and base…HEAD comparisons. GitHub automation, arbitrary file editing, commits and publishing are outside this workflow.

Source fixes are ordinary conversation work: the user asks the main model to edit, then returns to Code for a fresh review. Code does not run a native agent, apply a patch, or mark findings resolved.

## Product structure

A Code entry in the main navigation opens a full-width workbench. A compact entry in the conversation input dock opens the same workbench in the current session. The root panel declares a session-scoped child through the official Slot renderer, so the session and its composer actions stay framework-owned.

The top bar contains Code, the repository name, target scope, Refresh and the primary Review action. An optional base-ref field appears only for base…HEAD. The visible current context is either Current workspace or Reviewed snapshot. Changing this context never calls a model.

The workbench follows the editor shape users already know. A 40px activity bar selects Explorer, Changes, or Review history. The sidebar and the review panel are real grid tracks whose separators drag with a pointer, step with arrow keys, jump with Home/End, and toggle with Enter or a double click. Both widths persist in `localStorage` under `dsh-x-code:layout:v1`, are clamped to their own bounds, and collapse when dragged to the minimum or when their title-bar toggle is used. A collapsed track removes its separator so the editor takes the freed space.

The editor owns an open-file strip: Explorer clicks open a preview tab that the next click replaces, explicit actions (a finding or a history entry) pin their tab, middle-click and the close control close one, drag reorders, and the tab menu closes one, the others, or all. Closing the active tab activates its right neighbour, then its left one. Breadcrumbs above the source and a status bar with the version and line count complete the editor surface.

Below 700px the grid becomes a single pane chosen by Files / Code / Findings tabs; the activity bar, separators, and status bar are hidden, and drag resizing is unavailable because the tracks no longer share a row.

## Reading source and changes

- The Explorer lists the whole snapshot; Changes starts on the changed subset and can widen to All. Both share a filename/path search, a nested directory tree, Git-status markers, and explicit review checkboxes. Opening a file does not select it for review.
- The Source tab shows the full target file, read-only. Its label identifies the origin: Working tree, Index, HEAD, or Reviewed snapshot. A separate Before choice shows the comparison's old version.
- The Diff tab offers Unified / Split and Wrap. Both preserve old/new line numbers. Hunk positions are backend Git output, not a client-computed edit graph.
- Syntax coloring uses the official public DSH code highlighter. Source and diff text never use raw HTML insertion.
- Selection changes clear the prior file synchronously; only a response matching session, scope, workspace/snapshot, path and request generation may populate the viewer.
- SVG uses the same Source and Preview tabs as Markdown. Preview draws the file as an image and does not execute scripts. Common images, audio, and video preview locally, with zoom for images, and stay excluded from review.
- Other binary, oversized, symlink, missing, untracked and empty files have explicit states. Bounds are visible. “Not displayed” or “not reviewed” is never represented as an empty successful diff.

## Review interaction

1. Choose Worktree, Staged, or Base…HEAD; enter the base only for the last option. Browse freely.
2. Select relevant changed files and choose Review. Code adds an exact, version-bound `dsh_x_code_review` request to the existing composer using captureInsertion / insertText, then returns to the conversation. It never overwrites a draft or sends automatically.
3. Official DSH approval and the configured model own execution. The request carries only the selected snapshots and review instructions.
4. Findings appear as structured cards: severity, concise title, location, explanation, evidence and trigger. Evidence/details use disclosure controls.
5. After editing source in the conversation, re-review the same paths. The new snapshot and previous review remain distinct; an empty result is scoped to the new selection and never claims tests passed.

The review panel also carries a Chat tab. It embeds the official Conversation through its `conversation.content` Component Factory with the `embedded` variant and a fixed Chat view, so the panel shows the same transcript, running state and composer as the main conversation: images, `/` commands, `@` references, attachments, busy-Enter behavior and the shared per-Session draft all come from the shell instead of a second implementation. One draft and one submission path mean a message written in either place appears in both, and nothing is sent automatically. Code keeps no transcript copy, no polling read and no `code/transcript` endpoint; when the Factory is absent the tab states that the shared conversation is unavailable rather than falling back to a reduced input.

The UI provides Stop for an exact Code operation ID. Stop first shows Stopping; completion waits for authoritative settlement. Leaving the panel never cancels work. Cancelled, failed and interrupted runs retain readable findings/history and never gain a green pass. Nothing replays silently after reconnection.

## State and trust model

| State | Presentation | Primary next step |
| --- | --- | --- |
| No session | Compact empty state | Open a conversation |
| Loading repository | Reserved panel skeleton/status | Wait; retain no mismatched source |
| Not a Git repository | Actionable repository message | Select a Git-backed workspace |
| No changed files | Source browsing remains available | Switch scope or browse All |
| No selected files | Review disabled with count | Select files |
| Review pending/running | Live status and exact-run stop when offered | Open conversation for approval |
| Review complete with findings | Severity counts and cards | Fix in conversation, then re-review |
| Review complete, zero findings | No findings in selected files | Inspect coverage and checks |
| Malformed/incomplete result | Review incomplete; retained diagnostic | Retry explicitly |
| Snapshot stale | Amber version banner and old snapshot label | Refresh / start a fresh review |
| Connection lost | Read-only retained snapshot + reconnect notice | Retry; actions disabled |
| Interrupted after restart | Interrupted, no automatic replay | Run a new review on a fresh snapshot |

A run ending is not a test result. Review completeness, finding count, snapshot freshness and verification are separate facts. Checks display Passed / Failed / Running / Not run / Blocked only from structured evidence. Successful review with no findings says exactly that; it does not say code is safe, accepted or tests passed.

## Accessibility, appearance and localization

Controls use native buttons, inputs, selects and disclosure elements with visible focus and ARIA labels. Severity is conveyed by text, not color alone. The workbench follows DSH theme tokens and supports English and Chinese dictionaries; dates use the active locale's `Intl` formatting. Narrow layouts keep Files, Code and Findings reachable as tabs.

## Non-goals

Code does not run tests, verify repository-wide correctness, detect every secret, provide a filesystem sandbox for fixes, or write to GitHub. Credential scanning is conservative. Findings are review evidence for the selected snapshot, not an acceptance decision.
