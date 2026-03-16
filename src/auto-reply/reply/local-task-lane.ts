import type { OpenClawConfig } from "../../config/config.js";
import { resolveDeterministicLocalLaneMatch } from "../deterministic-local-lane.js";
import type { FinalizedMsgContext } from "../templating.js";

export type LocalTaskLaneClassification = {
  deterministicTrustedRepoTask: boolean;
};

export function classifyLocalTaskLane(
  ctx: FinalizedMsgContext,
  cfg: OpenClawConfig,
): LocalTaskLaneClassification {
  return {
    deterministicTrustedRepoTask: Boolean(resolveDeterministicLocalLaneMatch({ ctx, cfg })),
  };
}
