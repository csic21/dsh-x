# Code · dsh-x-code

An independently enabled source and review workspace for official DSH `0.2.1-rc.2`. The visible name is **Code** in both English and Chinese. No kernel modifications or GitHub/PR writes are required.

## Workflow

1. Open a conversation for a local committed Git repository, then open Code.
2. Browse all or changed files in the Explorer, search filenames, and inspect read-only source, before-source, or unified/split diff. The sidebar and review panel resize by drag, arrow keys, or their title-bar toggles, and the layout persists per profile. This does not run a review or call a provider.
3. Explicitly select files and choose **Review**. Code prepares an exact, version-bound `dsh_x_code_review` request in the conversation; nothing is sent automatically.
4. Send the request. The current configured DSH model reviews only the captured source. Official approval identifies the provider, model, exact paths, captured bytes, and possible model charges. No tools, conversation history, implicit repository traversal, or test execution are sent.
5. Read findings with severity, source lines, literal evidence, and a triggering condition. Findings are checked against the captured file and exact cited lines before they are accepted. A malformed, truncated, oversized, cancelled, or tool-requesting response fails explicitly.
6. To fix findings, ask the main conversation model to edit the source, then re-review the same file scope. Old findings remain historical evidence; an empty re-review means only **no findings in the new selected scope**, not verified tests or general safety.

The workbench's Chat tab embeds the official Conversation through its Component Factory (`conversation.content`, `embedded` variant, fixed Chat view). It therefore shares the Session's real transcript, running state, draft and composer: images, `/` commands, `@` references and attachments behave exactly as in the main conversation. Code keeps no second transcript and no polling endpoint.

A worktree edit invalidates old worktree evidence. Staged and base…HEAD snapshots retain their own versions. Re-review is bound to the same repository/workspace identity and the previous file scope. Stop addresses an exact live Code operation and waits for cancellation to settle; leaving the panel does not stop work. Interrupted work is never automatically replayed.

## Scope and limits

- Worktree: HEAD versus current files, including staged and unstaged changes and untracked additions.
- Staged: HEAD versus index.
- Base…HEAD: resolved merge base of the chosen branch/tag/commit and HEAD versus HEAD.
- Up to 4,000 enumerated paths. A truncated manifest cannot be reviewed.
- Up to 20 explicitly selected files and **48 KiB total UTF-8 before + after source** per review. Encoded review prompts are additionally capped at 64,000 characters. Over-limit scope fails before any model dispatch; it is never silently cut down or reported clean.
- The viewer does not cap text-file size. Review evidence stays at 64 KiB per file, so a larger preview is never sent to a model. SVG opens as source, image, and diff; the image is drawn without running scripts. PNG, JPEG, GIF, WebP, BMP, ICO, AVIF, MP3, WAV, Ogg, MP4, and WebM preview locally up to 8 MiB and are never selectable for review. Other binary, non-UTF-8, ignored, credential-shaped, private-named, symlinked, unmerged, and submodule content is withheld. No symlink target is followed. The repository and Git metadata must remain inside the host workspace boundary. Alternate object stores, symbolic Git object stores, and object metadata beyond 20,000 entries are unsupported.
- Git reads use fixed argv, disable external diff/textconv/configured clean/process filters, and force deterministic uncolored text diffs. Effective global/system ignore paths are preserved through an allowlisted configuration lookup; other inherited Git routing is discarded. Nothing is staged, committed, pushed, or uploaded by browsing.
- The credential scanner is conservative, not a comprehensive secret-detection guarantee. Review the selected paths and source before approving transmission.

## Retired native execution

Code no longer registers native Agent review or repair tools. `dsh_x_code_review` accepts only the current DSH model; a `runtime` other than `dsh` and a model override are refused before dispatch, and `dsh_x_code_repair` does not exist. Fixes happen in the conversation with the user's normal tools and approvals, followed by a fresh Code review.

This keeps the plugin's trust boundary small: Code reads a bounded local Git snapshot, asks the configured model for one structured review, and stores the evidence. It does not embed Codex, OpenCode, Claude or Grok adapters.

## Storage and compatibility

Review records are private to the official profile and session, atomically written with bounded history (latest 30 runs, further limited to 4 MB). They retain immutable selected source, Git/base/head/content identity, findings, and the exact model-visible request before provider dispatch. Model attribution includes the session ID. The pinned LLM API has no `code-review` purpose value, so no unsupported or false purpose is supplied. Auxiliary requests are reconstructable from Code's durable records rather than injected into conversation history.

A lock left by a crashed writer is not removed automatically. Close all hosts before explicitly recovering a stale Code storage lock; a live or unverified owner must never be overwritten.

Client imports use the official shell module table and syntax-highlighting primitive. Source and findings are rendered as text. All product controls/states use English/Chinese dictionaries and DSH theme tokens. The workbench keeps its own VS Code-like layout: an activity bar, a resizable file sidebar, editor tabs with breadcrumbs and a status bar, and a resizable Problems/Review panel. Plugin enable/disable remains independent.

## Test

```sh
pnpm --filter dsh-x-code run typecheck
pnpm --filter dsh-x-code run build
pnpm --filter dsh-x-code test
```

See `VALIDATION.md` for the current validation scope and non-claims.

## TypeScript development

The host entry is `src/index.ts`, the client entry is `src/client/index.ts`, and tests live in `test/*.test.ts`. The shared root `scripts/build-package.mjs` emits host JavaScript/declarations with `tsc` and `lib/client.js` with esbuild. `lib/` ships with the package, and the root integration tests load the built entry.
