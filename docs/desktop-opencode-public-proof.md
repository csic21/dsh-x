# Requested real OpenCode public proof

This is separate from the deterministic Browser fixture smoke. It is pending until its own Windows run produces inspected evidence.

The existing Windows job builds the pinned official packaged DSH application. Only a push commit explicitly marked `[opencode-public-proof]` also downloads the official OpenCode v1.19.3 Windows ZIP, verifies its SHA-256, and runs `scripts/desktop-opencode-proof.mjs`. Routine Browser pushes do not make real model requests.

A deterministic DSH transport adapter forwards only explicit Agents inspect, model-directory and run operations. It generates no native hello response and no browser tool decisions. The native OpenCode runtime must supply both. The selected model must come from a freshly prepared owned-runtime public catalog with verified zero-price metadata; the adapter must recheck the pricing before inference. Missing/unknown/paid models, missing authentication, unavailable confinement, or failed operations stop the proof. There is no provider or paid fallback.

The two native task runs contain only `Hello.` and an instruction to open `https://www.google.com/` in the already visible Browser guest, without searching, logging in, solving CAPTCHA, or following other links. The Google task can involve several native model/tool exchanges; this is two task starts, not a claim of exactly two model API calls. There is no retry or paid fallback, and native turns have bounded deadlines. An empty temporary workspace/home is used. No private repository source or prior conversation is attached to the native request. The actual official approval prompts are captured and allowed once for these requested operations; there is no blanket persistent grant.

The driver captures ready/catalog/selected-model/request/approval/native-answer/browser-grant/Google/tool-result screenshots. `report.json` identifies the plugin and official kernel commits, packaged application/Electron versions, executable hashes, selected model, native session evidence and exact guest identity. It reports a failure or block honestly if an external service is unavailable. Screenshots of the local orchestration driver alone are not evidence that a native provider answered.

No sign-in, account setup, credential creation, payment, security-setting relaxation, release, or main-branch merge is part of this proof. DSH filesystem confinement is not a general network or secret-read sandbox. The owned adapter's exact capabilities and limitations remain authoritative.

### Bounded diagnostic recovery

The proof driver persists phase progress and screenshots as they become available. Desktop CLI installation is bounded to 130 seconds, UI waits to 30 seconds, and Desktop close to 30 seconds. A 15-minute whole-proof watchdog latches dispatch closed before recording failure, so a late result cannot launch another task or overwrite failure with success. The GitHub step has a 20-minute final limit. Unconfirmed CLI descendants or Desktop cleanup are explicitly recorded as uncertain; hosted runner cleanup is required before any retry. These bounds do not imply provider success, and diagnostic recovery commits omit the public-proof marker to avoid issuing another model task while prior results are unknown.
