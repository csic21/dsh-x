# Code · dsh-x-code

An independently enabled source and review workspace for official DSH `0.2.1-rc.2`. The visible name is **Code** in both English and Chinese. No kernel modifications or GitHub/PR writes are required.

## Workflow

1. Open a conversation for a local committed Git repository, then open Code.
2. Browse all or changed files, search filenames, and inspect read-only source, before-source, or unified/split diff. This does not run a review, call a provider, or require Agents.
3. Explicitly select files and prepare a review in the conversation. The default **Current DSH model / DSH 当前模型** uses the session's configured model through the official LLM service. Official approval identifies the provider, model, exact paths, captured bytes, and possible model charges. Only the selected source snapshots and review instructions are sent: no tools, conversation history, implicit repository traversal, or test execution.
4. Read findings with severity, source lines, literal evidence, and a triggering condition. Findings are checked against the captured file and exact cited lines before they are accepted. A malformed, truncated, oversized, cancelled, or tool-requesting response fails explicitly.
5. For a fresh worktree review, select findings and choose a native Agent to repair them. This reuses the existing Agents adapters, original host permissions, one-time approvals, event stream, and process cleanup. Enable Agents for this step. It is an approved native coding task, not a selected-path filesystem sandbox; preserve unrelated edits and inspect actual changes.
6. Re-review the same file scope after repair. Old findings remain open historical evidence. A completed native repair never automatically resolves them, and an empty re-review means only **no findings in the new selected scope**, not verified tests or general safety.

A worktree edit invalidates old worktree evidence. Staged and base…HEAD snapshots retain their own versions; repair requires a fresh worktree review so a staged result cannot overwrite different unstaged source. Re-review is bound to the same repository/workspace identity. Stop addresses an exact live Code operation and waits for cancellation to settle; leaving the panel does not stop work. Interrupted work is never automatically replayed.

## Scope and limits

- Worktree: HEAD versus current files, including staged and unstaged changes and untracked additions.
- Staged: HEAD versus index.
- Base…HEAD: resolved merge base of the chosen branch/tag/commit and HEAD versus HEAD.
- Up to 4,000 enumerated paths. A truncated manifest cannot be reviewed.
- Up to 20 explicitly selected files and **48 KiB total UTF-8 before + after source** per review. Encoded review prompts are additionally capped at 64,000 characters. Over-limit scope fails before any model dispatch; it is never silently cut down or reported clean.
- Individual source previews are bounded at 64 KiB. Binary, non-UTF-8, oversized, ignored, credential-shaped, private-named, symlinked, unmerged, and submodule content is withheld. No symlink target is followed. The repository and Git metadata must remain inside the host workspace boundary. Alternate object stores, symbolic Git object stores, and object metadata beyond 20,000 entries are unsupported.
- Git reads use fixed argv, disable external diff/textconv/configured clean/process filters, and force deterministic uncolored text diffs. Effective global/system ignore paths are preserved through an allowlisted configuration lookup; other inherited Git routing is discarded. Nothing is staged, committed, pushed, or uploaded by browsing.
- The credential scanner is conservative, not a comprehensive secret-detection guarantee. Review the selected paths and source before approving transmission.

## Optional native review

Codex, Claude, and Grok may also be selected as native reviewers. These use a per-call **read-only** policy without modifying the standing host policy. Full OS file-effect confinement is required; absent/partial confinement blocks startup. Native permission escalation is denied for this turn. OpenCode's external HTTP execution is not supported for read-only review.

Strict read-only confinement can block native runtimes that need writable caches/session state. Code does not silently relax the policy or copy credentials to work around it. The default DSH snapshot-only reviewer avoids this startup issue. Native runtime initialization may still read its normal configuration; the OS file-effect policy does not claim network or secret-read isolation. No authenticated live vendor operation was performed in the repository tests.

## Storage and compatibility

Review records are private to the official profile and session, atomically written with bounded history (latest 30 runs, further limited to 4 MB). They retain immutable selected source, Git/base/head/content identity, findings, repairs, and the exact default-review model-visible request before provider dispatch. Model attribution includes the session ID. The pinned LLM API has no `code-review` purpose value, so no unsupported or false purpose is supplied. These auxiliary requests are reconstructable from Code's durable records rather than injected into conversation history.

A lock left by a crashed writer is not removed automatically. Close all hosts before explicitly recovering a stale Code storage lock; a live or unverified owner must never be overwritten. Native execution locks additionally retain Agents' existing uncertain-cleanup fencing.

Client imports use the official shell module table and syntax-highlighting primitive. Source, findings, and native-provider content are rendered as text. All product controls/states use English/Chinese dictionaries and DSH theme tokens. Plugin enable/disable remains independent; Agents is an optional execution dependency, not a required package mount for browsing/default review.

## Test

Run `pnpm run build`, `pnpm test`, or focused `node --test packages/dsh-x-code/test/*.test.js test/code-*.test.js`. See `VALIDATION.md` for what was exercised and what remains unverified.

## TypeScript 开发

宿主入口是 `src/index.ts`，前端入口是 `src/client/index.ts`，测试位于 `test/*.test.ts`。

```sh
pnpm --filter dsh-x-code run typecheck
pnpm --filter dsh-x-code run build
pnpm --filter dsh-x-code test
```

构建统一使用根目录的 `scripts/build-package.mjs`：`tsc` 生成宿主 JS 和声明，esbuild 生成 `lib/client.js`；包入口指向 `lib/index.js`。
Code 的 `lib/` 随源码交付，根级集成测试从构建入口加载。
