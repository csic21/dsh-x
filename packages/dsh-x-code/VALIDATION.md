# Code validation

## Current scope

Validated with official DSH `0.2.1-rc.2`, Cordis `4.0.5`, Node 24. Current repository run: 278 tests, 278 passed, 0 skipped; the Code package contributes 37 of them. Code registers three tools: `dsh_x_code_inspect`, `dsh_x_code_file` and `dsh_x_code_review`; `dsh_x_code_repair` no longer exists.

Covered through official Cordis, ToolRuntime, LlmRuntime, managed subprocess, approval bridges, and durable records:

- Bounded tree/source/diff browsing without a model call; worktree, staged, and merge-base…HEAD versions; before/after missing sides; deterministic diff coordinates under color, blank-context, and binary-diff attributes.
- Explicit selected paths and exact snapshot capture; final post-approval freshness checks; source edits, index changes, session/cwd changes, repository replacement, and cross-repository re-review rejection.
- Configured DSH review with one bounded snapshot message, no session history, and zero tools; approval rejection sends no source; exact prepared config and model-visible input are persisted before stream dispatch.
- Structured severity/line/evidence/trigger validation; fabricated or out-of-scope evidence, malformed/truncated responses, tool attempts, oversized output, and sensitive-shaped output fail explicitly.
- Refusal of a native runtime or model override before dispatch, and absence of the retired repair tool.
- Exact Code-operation cancellation, wrong-operation rejection, immutable history inspection, and bounded byte/count retention.
- Traversal, symlink ancestors, external/shared Git metadata, alternate/symbolic object stores, ignored/global-ignored content, private filenames, credential-shaped text, binary/non-UTF-8 source, oversized files, and unsupported Git states.
- Compiled frontend source/before/diff views, highlighting seam, filename search, explicit scope, finding navigation, historical evidence, locale coverage, late response rejection, session reset, and operation cancellation without changing the selected browsing mode.
- The Chat tab renders one `conversation.content` occurrence with `variant: 'embedded'` and a Chat view selection, keeps the main composer draft and send count unchanged until the user asks, and contains no hand-written composer.
- Right-clicking a file or a source selection appends that file or passage to the shared composer draft, opens Chat, and does not send or leave the workbench.
- The panel lists the current workspace's sessions and can open one or start a new session without sending the draft.
- Generation and official `parseMarketIndex` validation of a Git-pinned plugin market index.

Run `pnpm --filter dsh-x-code test` and `pnpm test` for the current counts. Do not treat historical suite-era numbers as current evidence.

## Non-claims

No real paid or authenticated DSH model call, billing, vendor login, credential change, external repository upload, or PR/GitHub write is exercised. Review evidence is limited to explicitly selected text snapshots, with a 48 KiB before+after source budget and a 64,000-character encoded prompt limit. It cannot establish repository-wide correctness, real test execution, or that all secrets have been detected. Old findings are never automatically resolved by an empty re-review.

The pinned official LLM API does not support a `code-review` purpose. Auxiliary input is reconstructable from private Code records and attributed to the session; no unsupported session-log event or false purpose is fabricated. A crash-left storage lock fails closed and requires explicit recovery with all hosts closed. Exhaustive screen-reader, operating-system, desktop-install, and production-provider compatibility are not claimed.
