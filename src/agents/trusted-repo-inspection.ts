import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { analyzeShellCommand } from "../infra/exec-approvals-analysis.js";
import { isTrustedRepoInspectionCommand } from "../infra/exec-trusted-repo-inspection.js";

const execFileAsync = promisify(execFile);

export const TRUSTED_REPO_INSPECTION_FILE_LOOKUP =
  "src/agents/pi-embedded-runner/model.ts" as const;

function normalizePromptCandidate(prompt: string): string {
  return prompt.replace(/```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/gi, "$1").trim();
}

function extractCommandSlicesAfterPromptMarker(prompt: string): string[] {
  const marker = /run only this command in the workspace repo\s*:/gi;
  let markerMatch: RegExpExecArray | null;
  const commands: string[] = [];
  while ((markerMatch = marker.exec(prompt)) !== null) {
    const start = markerMatch.index + markerMatch[0].length;
    const tail = prompt.slice(start).trim();
    if (!tail) {
      continue;
    }
    const stop = tail.search(/\breturn only the output\b/i);
    const candidate = (stop >= 0 ? tail.slice(0, stop) : tail).trim();
    if (!candidate) {
      continue;
    }
    const commandLine =
      candidate
        .split(/\r?\n/)
        .map((line) => line.replace(/^[\s`>*-]+|[\s`]+$/g, ""))
        .find((line) => /\bgit\s+rev-parse\b/i.test(line)) ?? candidate;
    const dequoted = commandLine.replace(/^[`"']+|[`"']+$/g, "").trim();
    const normalized = dequoted.replace(/[.;"']+$/g, "").trim();
    if (normalized) {
      commands.push(normalized);
    }
  }
  return commands;
}

function extractTrustedRevParseCommandFromPrompt(prompt: string): string | undefined {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized.includes("do not guess") || !normalized.includes("workspace repo")) {
    return undefined;
  }
  const trustedCommandMatches = prompt.matchAll(
    /git\s+rev-parse\s+--(?:abbrev-ref|short(?:=\d+)?)\s+head\b/gi,
  );
  let lastMatch: string | undefined;
  for (const match of trustedCommandMatches) {
    lastMatch = match[0];
  }
  return lastMatch;
}

export function resolveTrustedRepoInspectionArgv(prompt: string): string[] | undefined {
  const markedCandidates = extractCommandSlicesAfterPromptMarker(prompt);
  for (let i = markedCandidates.length - 1; i >= 0; i -= 1) {
    const candidate = markedCandidates[i];
    if (!candidate) {
      continue;
    }
    const analysis = analyzeShellCommand({
      command: candidate,
      cwd: process.cwd(),
      env: process.env,
    });
    if (!analysis.ok || !isTrustedRepoInspectionCommand(analysis.segments)) {
      continue;
    }
    const segment = analysis.segments[0];
    return segment.resolution?.effectiveArgv && segment.resolution.effectiveArgv.length > 0
      ? segment.resolution.effectiveArgv
      : segment.argv;
  }

  const fallbackCandidate = extractTrustedRevParseCommandFromPrompt(prompt);
  if (!fallbackCandidate) {
    return undefined;
  }
  const fallbackAnalysis = analyzeShellCommand({
    command: fallbackCandidate,
    cwd: process.cwd(),
    env: process.env,
  });
  if (!fallbackAnalysis.ok || !isTrustedRepoInspectionCommand(fallbackAnalysis.segments)) {
    return undefined;
  }
  const fallbackSegment = fallbackAnalysis.segments[0];
  return fallbackSegment.resolution?.effectiveArgv &&
    fallbackSegment.resolution.effectiveArgv.length > 0
    ? fallbackSegment.resolution.effectiveArgv
    : fallbackSegment.argv;
}

export function resolveTrustedRepoInspectionFileLookup(prompt: string): string | undefined {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized.includes("use actual repo files only")) {
    return undefined;
  }
  if (!normalized.includes("which file contains the ollama fallback fix")) {
    return undefined;
  }
  return TRUSTED_REPO_INSPECTION_FILE_LOOKUP;
}

export function resolveTrustedRepoInspectionPrompt(
  prompt: string,
): { kind: "exec"; argv: string[] } | { kind: "file_lookup"; path: string } | null {
  return resolveTrustedRepoInspectionPromptFromTexts([prompt]);
}

export function resolveTrustedRepoInspectionPromptFromTexts(
  prompts: Array<string | undefined>,
): { kind: "exec"; argv: string[] } | { kind: "file_lookup"; path: string } | null {
  for (const rawPrompt of prompts) {
    const prompt = typeof rawPrompt === "string" ? normalizePromptCandidate(rawPrompt) : "";
    if (!prompt) {
      continue;
    }
    const argv = resolveTrustedRepoInspectionArgv(prompt);
    if (argv && argv.length > 0) {
      return { kind: "exec", argv };
    }
    const fileLookupPath = resolveTrustedRepoInspectionFileLookup(prompt);
    if (fileLookupPath) {
      return { kind: "file_lookup", path: fileLookupPath };
    }
  }
  return null;
}

export async function runTrustedRepoInspectionExec(params: {
  argv: string[];
  cwd: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const { stdout } = await execFileAsync(params.argv[0] ?? "", params.argv.slice(1), {
    cwd: params.cwd,
    signal: params.abortSignal,
    timeout: Math.max(1, params.timeoutMs),
    windowsHide: true,
  });
  return stdout.trim();
}
