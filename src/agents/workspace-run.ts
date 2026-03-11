import type { OpenClawConfig } from "../config/config.js";
import { logWarn } from "../logger.js";
import { redactIdentifier } from "../logging/redact-identifier.js";
import {
  classifySessionKeyShape,
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../routing/session-key.js";
import { resolveUserPath } from "../utils.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "./agent-scope.js";
import { sanitizeForPromptLiteral } from "./sanitize-for-prompt.js";
import { resolveDefaultAgentWorkspaceDir } from "./workspace.js";

export type WorkspaceFallbackReason = "missing" | "blank" | "invalid_type" | "stale_default";
type AgentIdSource = "explicit" | "session_key" | "default";

export type ResolveRunWorkspaceResult = {
  workspaceDir: string;
  usedFallback: boolean;
  fallbackReason?: WorkspaceFallbackReason;
  agentId: string;
  agentIdSource: AgentIdSource;
};

function resolveRunAgentId(params: {
  sessionKey?: string;
  agentId?: string;
  config?: OpenClawConfig;
}): {
  agentId: string;
  agentIdSource: AgentIdSource;
} {
  const rawSessionKey = params.sessionKey?.trim() ?? "";
  const shape = classifySessionKeyShape(rawSessionKey);
  if (shape === "malformed_agent") {
    throw new Error("Malformed agent session key; refusing workspace resolution.");
  }

  const explicit =
    typeof params.agentId === "string" && params.agentId.trim()
      ? normalizeAgentId(params.agentId)
      : undefined;
  if (explicit) {
    return { agentId: explicit, agentIdSource: "explicit" };
  }

  const defaultAgentId = resolveDefaultAgentId(params.config ?? {});
  if (shape === "missing" || shape === "legacy_or_alias") {
    return {
      agentId: defaultAgentId || DEFAULT_AGENT_ID,
      agentIdSource: "default",
    };
  }

  const parsed = parseAgentSessionKey(rawSessionKey);
  if (parsed?.agentId) {
    return {
      agentId: normalizeAgentId(parsed.agentId),
      agentIdSource: "session_key",
    };
  }

  // Defensive fallback, should be unreachable for non-malformed shapes.
  return {
    agentId: defaultAgentId || DEFAULT_AGENT_ID,
    agentIdSource: "default",
  };
}

export function redactRunIdentifier(value: string | undefined): string {
  return redactIdentifier(value, { len: 12 });
}

function normalizePathForComparison(value: string): string {
  const resolved = resolveUserPath(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function resolveConfiguredWorkspaceOverride(params: {
  config?: OpenClawConfig;
  agentId: string;
}): string | undefined {
  const cfg = params.config;
  if (!cfg) {
    return undefined;
  }
  const listedAgentWorkspace = cfg.agents?.list?.find(
    (entry) => normalizeAgentId(entry?.id) === params.agentId,
  )?.workspace;
  if (typeof listedAgentWorkspace === "string" && listedAgentWorkspace.trim()) {
    return resolveUserPath(listedAgentWorkspace.trim());
  }
  if (params.agentId === resolveDefaultAgentId(cfg)) {
    const defaultsWorkspace = cfg.agents?.defaults?.workspace?.trim();
    if (defaultsWorkspace) {
      return resolveUserPath(defaultsWorkspace);
    }
  }
  return undefined;
}

export function resolveRunWorkspaceDir(params: {
  workspaceDir: unknown;
  sessionKey?: string;
  agentId?: string;
  config?: OpenClawConfig;
}): ResolveRunWorkspaceResult {
  const requested = params.workspaceDir;
  const { agentId, agentIdSource } = resolveRunAgentId({
    sessionKey: params.sessionKey,
    agentId: params.agentId,
    config: params.config,
  });
  if (typeof requested === "string") {
    const trimmed = requested.trim();
    if (trimmed) {
      const sanitized = sanitizeForPromptLiteral(trimmed);
      if (sanitized !== trimmed) {
        logWarn("Control/format characters stripped from workspaceDir (OC-19 hardening).");
      }
      const resolvedRequested = resolveUserPath(sanitized);
      const configuredWorkspace = resolveConfiguredWorkspaceOverride({
        config: params.config,
        agentId,
      });
      const defaultWorkspace = resolveDefaultAgentWorkspaceDir(process.env);
      if (
        configuredWorkspace &&
        normalizePathForComparison(resolvedRequested) ===
          normalizePathForComparison(defaultWorkspace) &&
        normalizePathForComparison(resolvedRequested) !==
          normalizePathForComparison(configuredWorkspace)
      ) {
        return {
          workspaceDir: configuredWorkspace,
          usedFallback: true,
          fallbackReason: "stale_default",
          agentId,
          agentIdSource,
        };
      }
      return {
        workspaceDir: resolvedRequested,
        usedFallback: false,
        agentId,
        agentIdSource,
      };
    }
  }

  const fallbackReason: WorkspaceFallbackReason =
    requested == null ? "missing" : typeof requested === "string" ? "blank" : "invalid_type";
  const fallbackWorkspace = resolveAgentWorkspaceDir(params.config ?? {}, agentId);
  const sanitizedFallback = sanitizeForPromptLiteral(fallbackWorkspace);
  if (sanitizedFallback !== fallbackWorkspace) {
    logWarn("Control/format characters stripped from fallback workspaceDir (OC-19 hardening).");
  }
  return {
    workspaceDir: resolveUserPath(sanitizedFallback),
    usedFallback: true,
    fallbackReason,
    agentId,
    agentIdSource,
  };
}
