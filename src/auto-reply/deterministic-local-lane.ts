import fs from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveSessionAgentId } from "../agents/agent-scope.js";
import {
  resolveTrustedRepoInspectionPromptFromTexts,
  runTrustedRepoInspectionExec,
} from "../agents/trusted-repo-inspection.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "../agents/workspace.js";
import type { OpenClawConfig } from "../config/config.js";
import type { FinalizedMsgContext } from "./templating.js";
import type { ReplyPayload } from "./types.js";

export type DeterministicLocalLaneMatch =
  | {
      kind: "exec";
      argv: string[];
      workspaceDir: string;
    }
  | {
      kind: "file_lookup";
      path: string;
      workspaceDir: string;
    };

export function resolveDeterministicLocalLaneMatch(params: {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
}): DeterministicLocalLaneMatch | null {
  const trustedPrompt = resolveTrustedRepoInspectionPromptFromTexts([
    params.ctx.BodyForCommands,
    params.ctx.CommandBody,
    params.ctx.RawBody,
    params.ctx.Body,
    params.ctx.BodyForAgent,
  ]);
  if (!trustedPrompt) {
    return null;
  }

  const targetSessionKey =
    params.ctx.CommandSource === "native" ? params.ctx.CommandTargetSessionKey?.trim() : undefined;
  const sessionKey = targetSessionKey || params.ctx.SessionKey;
  const agentId = resolveSessionAgentId({
    sessionKey,
    config: params.cfg,
  });
  const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId) ?? DEFAULT_AGENT_WORKSPACE_DIR;

  if (trustedPrompt.kind === "file_lookup") {
    return {
      kind: "file_lookup",
      path: trustedPrompt.path,
      workspaceDir,
    };
  }

  return {
    kind: "exec",
    argv: trustedPrompt.argv,
    workspaceDir,
  };
}

export async function runDeterministicLocalLane(
  match: DeterministicLocalLaneMatch,
): Promise<ReplyPayload> {
  if (match.kind === "file_lookup") {
    try {
      await fs.access(path.join(match.workspaceDir, match.path));
      return { text: match.path };
    } catch {
      return {
        text: "I couldn't verify that file in the workspace repo.",
        isError: true,
      };
    }
  }

  try {
    const output = await runTrustedRepoInspectionExec({
      argv: match.argv,
      cwd: match.workspaceDir,
      timeoutMs: 10_000,
    });
    return { text: output };
  } catch {
    return {
      text: "Unable to run the requested workspace repo command.",
      isError: true,
    };
  }
}
