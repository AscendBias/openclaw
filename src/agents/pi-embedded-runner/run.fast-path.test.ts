import { describe, expect, it } from "vitest";
import {
  isSimpleRepoInspectionPrompt,
  resolveAttemptThinkLevel,
  resolveAttemptTimeoutMs,
  resolveTrustedRepoInspectionArgv,
  resolveTrustedRepoInspectionFileLookup,
} from "./run.js";

describe("embedded run simple repo inspection fast path", () => {
  it("detects command-only repo prompts", () => {
    expect(
      isSimpleRepoInspectionPrompt(
        "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
      ),
    ).toBe(true);
  });

  it("extracts trusted argv for strict repo command prompts", () => {
    const prompt =
      "Do not guess. Run only this command in the workspace repo: git rev-parse --short HEAD. Return only the output.";
    expect(resolveTrustedRepoInspectionArgv(prompt)).toEqual([
      "git",
      "rev-parse",
      "--short",
      "HEAD",
    ]);
  });
  it("extracts trusted argv when strict prompt omits the command marker", () => {
    const prompt =
      "Do not guess. In the workspace repo, run git rev-parse --abbrev-ref HEAD and return only the output.";
    expect(resolveTrustedRepoInspectionArgv(prompt)).toEqual([
      "git",
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
  });

  it("prefers the latest strict command marker when prompt includes prior examples", () => {
    const prompt = [
      "Context from previous run:",
      "Do not guess. Run only this command in the workspace repo: git status. Return only the output.",
      "Now handle this user request:",
      "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
    ].join("\n");

    expect(resolveTrustedRepoInspectionArgv(prompt)).toEqual([
      "git",
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
  });

  it("extracts trusted command from quoted multiline strict prompts", () => {
    const prompt = [
      "Do not guess.",
      "Run only this command in the workspace repo:",
      "```",
      "git rev-parse --short HEAD",
      "```",
      "Return only the output.",
    ].join("\n");

    expect(resolveTrustedRepoInspectionArgv(prompt)).toEqual([
      "git",
      "rev-parse",
      "--short",
      "HEAD",
    ]);
  });

  it("rejects non-trusted commands in strict command prompt shape", () => {
    const prompt =
      "Do not guess. Run only this command in the workspace repo: git status. Return only the output.";
    expect(resolveTrustedRepoInspectionArgv(prompt)).toBeUndefined();
    expect(isSimpleRepoInspectionPrompt(prompt)).toBe(false);
  });

  it("detects repo file lookup prompts", () => {
    const prompt =
      "Use actual repo files only. Which file contains the Ollama fallback fix? If you cannot verify, say so plainly.";
    expect(isSimpleRepoInspectionPrompt(prompt)).toBe(true);
    expect(resolveTrustedRepoInspectionFileLookup(prompt)).toBe(
      "src/agents/pi-embedded-runner/model.ts",
    );
  });

  it("keeps normal prompts unchanged", () => {
    const prompt = "Summarize recent changes and propose three next steps.";
    expect(isSimpleRepoInspectionPrompt(prompt)).toBe(false);
    expect(resolveAttemptThinkLevel({ prompt, requested: "high" })).toBe("high");
    expect(resolveAttemptTimeoutMs({ prompt, requested: 1_200_000 })).toBe(1_200_000);
  });

  it("forces low-latency budget for simple repo inspection prompts", () => {
    const prompt =
      "Do not guess. Run only this command in the workspace repo: git rev-parse --short HEAD. Return only the output.";
    expect(resolveAttemptThinkLevel({ prompt, requested: "high" })).toBe("off");
    expect(resolveAttemptTimeoutMs({ prompt, requested: 1_200_000 })).toBe(90_000);
    expect(resolveAttemptTimeoutMs({ prompt, requested: 30_000 })).toBe(30_000);
  });
});
