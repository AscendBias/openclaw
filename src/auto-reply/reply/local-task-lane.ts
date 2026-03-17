import type { OpenClawConfig } from "../../config/config.js";
import { resolveDeterministicLocalLaneMatch } from "../deterministic-local-lane.js";
import type { FinalizedMsgContext } from "../templating.js";

export type LocalTaskLaneClassification = {
  lane: "deterministic-local" | "reasoning-local" | "control" | "default";
  deterministicTrustedRepoTask: boolean;
  reasoningLocalTelegramTask: boolean;
  controlTask: boolean;
  expectedLongRunning: boolean;
  ollamaFirstReasoning: boolean;
};

const CONTROL_COMMAND_RE = /^\/(?:approve|abort|status)\b/i;

function resolveFirstContextText(ctx: FinalizedMsgContext): string {
  const candidates = [ctx.BodyForCommands, ctx.CommandBody, ctx.RawBody, ctx.Body];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

export function classifyLocalTaskLane(
  ctx: FinalizedMsgContext,
  cfg: OpenClawConfig,
): LocalTaskLaneClassification {
  const deterministicTrustedRepoTask = Boolean(resolveDeterministicLocalLaneMatch({ ctx, cfg }));
  if (deterministicTrustedRepoTask) {
    return {
      lane: "deterministic-local",
      deterministicTrustedRepoTask,
      reasoningLocalTelegramTask: false,
      controlTask: false,
      expectedLongRunning: false,
      ollamaFirstReasoning: false,
    };
  }

  const channel = String(ctx.OriginatingChannel ?? ctx.Surface ?? ctx.Provider ?? "")
    .trim()
    .toLowerCase();
  const text = resolveFirstContextText(ctx);
  const controlTask = CONTROL_COMMAND_RE.test(text);
  if (controlTask) {
    return {
      lane: "control",
      deterministicTrustedRepoTask: false,
      reasoningLocalTelegramTask: false,
      controlTask,
      expectedLongRunning: false,
      ollamaFirstReasoning: false,
    };
  }

  const reasoningLocalTelegramTask = channel === "telegram";
  if (reasoningLocalTelegramTask) {
    return {
      lane: "reasoning-local",
      deterministicTrustedRepoTask: false,
      reasoningLocalTelegramTask,
      controlTask: false,
      // Prefer durable ack for Telegram local reasoning turns unless the turn
      // already hit deterministic fast-path or explicit control handling.
      expectedLongRunning: true,
      ollamaFirstReasoning: true,
    };
  }

  return {
    lane: "default",
    deterministicTrustedRepoTask: false,
    reasoningLocalTelegramTask: false,
    controlTask: false,
    expectedLongRunning: false,
    ollamaFirstReasoning: false,
  };
}
