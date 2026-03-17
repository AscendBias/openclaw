# Local Ollama-first architecture: next layer after deterministic local lane

## Scope

This design pass focuses on the next architecture layer after the deterministic local lane was introduced at the early dispatch boundary.

Goals:

- Keep deterministic local lane behavior intact.
- Make non-deterministic Telegram reasoning explicitly local-Ollama-first.
- Preserve risky command protections (approval required for risky exec only).
- Reduce Telegram UX failures from long-running local inference and queue/lane coupling.

## Audit summary: what is still cloud/API-first

### 1) Default model/provider still cloud-biased

- Global defaults still point to Anthropic (`DEFAULT_PROVIDER = "anthropic"`, `DEFAULT_MODEL = "claude-opus-4-6"`).
- Local-first provider priority exists only as a fallback when configured default provider is missing, not as an explicit Telegram reasoning policy.

Impact: non-deterministic Telegram traffic still naturally resolves to cloud-first behavior unless users manually override config.

### 2) Telegram update serialization is chat-level and can over-block local workloads

- `sequentialize(getTelegramSequentialKey)` enforces strict per-chat/topic serialization.
- For non-control traffic, keying is `telegram:<chat>` or `telegram:<chat>:topic:<thread>`.
- This is safe for correctness, but long non-deterministic local runs can hold the middleware lane and delay unrelated intent processing in the same chat/topic.

Impact: local-Ollama latency can look like channel deadlock.

### 3) Typing lifecycle and TTL are shaped around short cloud response assumptions

- Typing callbacks have a fixed default max duration (60s TTL).
- Keepalive loops are generic, not lane-aware, and can expire before local reasoning finishes.
- Draft streaming logic is rich, but UX still relies heavily on transport behavior rather than explicit local task acknowledgment contracts.

Impact: long local tasks can silently lose typing signal or appear stalled.

### 4) Queue defaults and follow-up behavior are generic (not local-reasoning aware)

- Queue default mode resolves to `collect` for channels.
- Session-lane queue behavior (`resolveEmbeddedSessionLane`, follow-up queue drain) is not explicitly tuned for local model throughput/latency.
- Queue/interrupt behavior is present, but not policy-bound to local reasoning class.

Impact: queue semantics optimized for generic provider mix, not local-first responsiveness.

### 5) Agent timeout baseline is long cloud-style ceiling

- Default timeout is 600 seconds.
- This protects long turns, but without staged ack/progress policy it can feel like cloud wait behavior.

Impact: users wait too long without deterministic communication milestones.

### 6) Approval plumbing is robust but not explicitly split by deterministic-vs-risk class at Telegram lane policy level

- Approval registration/wait flow is two-phase and reliable.
- Telegram approval client and buttons are separate and capable.
- However, architecture still needs explicit lane policy guarantees that deterministic-safe tasks never enter approval waiting paths, while risky tasks always do.

Impact: residual uncertainty and potential UX confusion around when approval should appear.

## Next architecture layer after deterministic local lane

### Core design: introduce a dedicated **Local Reasoning Lane (LRL)** for non-deterministic Telegram tasks

For messages that do not match deterministic local lane:

1. **Classify early**
   - `deterministic-safe` (already handled; unchanged).
   - `reasoning-local` (non-deterministic, no risky tool intent yet).
   - `risk-gated` (tool intent or execution plan that requires approval).

2. **Immediate ack contract (Telegram UX)**
   - Within ~300-800ms, send compact ack message/reaction for `reasoning-local` tasks expected to exceed ~2s.
   - Ack must be durable text/reaction (not only typing), so typing TTL expiry cannot erase task visibility.
   - Typing becomes secondary signal, not primary state.

3. **Model selection contract**
   - For `reasoning-local`, resolve provider/model through an explicit local-first resolver:
     - Prefer `ollama/*` pinned lane default.
     - Fall back to local provider aliases only.
     - Fall back to cloud only when local is unavailable and policy allows fallback.
   - Persist fallback reason in telemetry and optional user-visible suffix.

4. **Session/queue contract**
   - LRL work should not monopolize control operations (`/approve`, `/abort`, `/status`).
   - Keep control operations on control key/lane (already partly present), and make LRL queue policy explicit:
     - default `steer-backlog` or `followup` for heavy local turns,
     - bounded queue with predictable drop/merge strategy,
     - clear queued-position acknowledgment when backlog > 0.

5. **Streaming/timeout contract**
   - Local-first mode should treat streaming as optional optimization, not correctness dependency.
   - If no partial arrives by threshold (e.g., 2-3s), maintain user-visible progress heartbeat.
   - Extend typing TTL policy for LRL or switch to periodic status edits while run active.

6. **Approval contract**
   - Deterministic-safe lane: never request approval.
   - Reasoning-local lane: no approval unless tool phase generates risky execution plan.
   - Risk-gated: mandatory approval with Telegram-first reliable UX (buttons + explicit `/approve` text fallback).

## Approval model (post-deterministic lane)

### Policy matrix

- **Trusted deterministic task**
  - Path: deterministic lane.
  - Approval: never.
  - UX: direct final response.

- **Non-deterministic local reasoning, non-risky**
  - Path: LRL.
  - Approval: none.
  - UX: immediate ack + progress + final answer.

- **Risky command/tool execution**
  - Path: risk-gated branch from LRL/tool stage.
  - Approval: required.
  - UX: Telegram approval buttons and `/approve <id> allow-once|allow-always|deny` fallback; keep control lane unblocked.

### Reliability requirements

- Approval callback handling must remain on control sequential key.
- Approval waits must never be attached to deterministic-safe classification.
- Approval pending messages should include explicit lane state and safe retry guidance.

## Exact code paths involved

1. Early dispatch boundary

- `src/auto-reply/dispatch.ts`
  - deterministic lane check currently happens here.
  - next: add local reasoning lane classification + policy handoff.

2. Telegram message execution path

- `src/telegram/bot-message-dispatch.ts`
  - central Telegram flow for draft lanes, delivery, and dispatch.
  - next: add LRL ack/progress contract and long-run behavior policy.

3. Provider/model resolution

- `src/agents/defaults.ts`
- `src/agents/model-selection.ts`
- `src/auto-reply/reply/get-reply.ts`
  - next: introduce explicit local-first resolver for Telegram reasoning lane.

4. Queue/session-lane orchestration

- `src/auto-reply/reply/get-reply-run.ts`
- `src/auto-reply/reply/queue/settings.ts`
- `src/auto-reply/reply/queue/enqueue.ts`
- `src/process/command-queue.ts`
- `src/telegram/sequential-key.ts`
  - next: separate LRL workload behavior from control operations and tune queue defaults.

5. Typing and long-task UX

- `src/channels/typing.ts`
- `src/auto-reply/reply/reply-dispatcher.ts`
- `src/telegram/draft-stream.ts`
- `src/telegram/bot.ts`
  - next: local-first ack + status progression that does not depend solely on typing TTL.

6. Approval architecture

- `src/telegram/exec-approvals.ts`
- `src/telegram/exec-approvals-handler.ts`
- `src/agents/bash-tools.exec-approval-request.ts`
- `src/agents/pi-embedded-subscribe.handlers.tools.ts`
  - next: enforce strict deterministic-safe bypass and risk-only approval entry points.

## Exact files that should change next

### Must-change (phase 1)

- `src/auto-reply/dispatch.ts`
- `src/telegram/bot-message-dispatch.ts`
- `src/auto-reply/reply/get-reply.ts`
- `src/auto-reply/reply/get-reply-run.ts`
- `src/auto-reply/reply/queue/settings.ts`
- `src/channels/typing.ts`

### Strongly recommended (phase 2)

- `src/agents/defaults.ts`
- `src/agents/model-selection.ts`
- `src/telegram/sequential-key.ts`
- `src/process/command-queue.ts`
- `src/telegram/exec-approvals-handler.ts`
- `src/agents/bash-tools.exec-approval-request.ts`

### Tests to add/update

- `src/auto-reply/dispatch*.test.ts` (lane classification)
- `src/telegram/bot-message*.test.ts` (ack/progress behavior)
- `src/auto-reply/reply/queue/*.test.ts` (LRL queue policy)
- `src/channels/typing*.test.ts` (extended local-task lifecycle)
- `src/telegram/exec-approvals*.test.ts` (risk-only approval routing)

## Prioritized implementation plan

1. **Introduce LRL classification + ack contract**
   - Add non-deterministic local reasoning classification after deterministic lane miss.
   - Emit immediate Telegram ack for expected long tasks.
   - Keep current deterministic lane untouched.

2. **Bind LRL to local-Ollama-first resolver**
   - Add explicit resolver path for Telegram reasoning lane.
   - Keep configurable cloud fallback behind explicit policy switch.

3. **Queue/lane policy split (work vs control)**
   - Ensure `/approve`, `/abort`, and callbacks remain unblocked by long reasoning runs.
   - Tune queue mode defaults for LRL and publish queue-position feedback.

4. **Approval hardening by task class**
   - Enforce no-approval for deterministic-safe tasks at architecture boundary.
   - Require approval only for risky command plans.

5. **Typing/timeout and progress lifecycle**
   - Replace typing-only UX dependency with durable status progression.
   - Extend/refresh TTL behavior for local runs without creating spam.

6. **Cloud-assumption cleanup**
   - Revisit anthropic hard default usage in local fork context.
   - Preserve compatibility but make local-first the explicit default lane for Telegram reasoning.

## One-pass safe changes vs phased rollout

### Safe in one pass

- LRL classification scaffolding in dispatch path.
- Immediate ack behavior for long tasks.
- Queue policy defaults for Telegram LRL.
- Deterministic-safe approval bypass guard assertions.

Reason: these are additive control-plane changes with low blast radius when guarded by channel/lane flags.

### Should be split into phases

- Global default provider/model change (`anthropic` -> local default).
- Deep sequentialization/lane key redesign affecting ordering guarantees.
- Approval transport UX rewiring across multiple channels.

Reason: these alter broad behavior and can regress non-Telegram channels if bundled.

## Suggested phase breakdown

- **Phase 1 (high impact, low risk):** LRL classification + immediate ack + risk-only approval gate assertions.
- **Phase 2 (medium risk):** LRL queue/control-lane split + long-task progress lifecycle.
- **Phase 3 (higher risk):** global local-first defaults and cross-channel model-default alignment.
