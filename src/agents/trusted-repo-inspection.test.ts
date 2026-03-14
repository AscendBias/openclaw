import { describe, expect, it } from "vitest";
import {
  resolveTrustedRepoInspectionPrompt,
  resolveTrustedRepoInspectionPromptFromTexts,
} from "./trusted-repo-inspection.js";

describe("resolveTrustedRepoInspectionPromptFromTexts", () => {
  it("finds trusted command in later prompt candidates", () => {
    const result = resolveTrustedRepoInspectionPromptFromTexts([
      "",
      "Please summarize the repository status.",
      "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
    ]);

    expect(result).toEqual({
      kind: "exec",
      argv: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    });
  });

  it("normalizes fenced prompts before matching", () => {
    const result = resolveTrustedRepoInspectionPromptFromTexts([
      "```text\nUse actual repo files only. Which file contains the Ollama fallback fix? If you cannot verify, say so plainly.\n```",
    ]);

    expect(result).toEqual({
      kind: "file_lookup",
      path: "src/agents/pi-embedded-runner/model.ts",
    });
  });

  it("returns null when no trusted prompt exists", () => {
    const result = resolveTrustedRepoInspectionPromptFromTexts([
      "Do not guess. Run only this command in the workspace repo: git status. Return only the output.",
    ]);

    expect(result).toBeNull();
  });
});

describe("resolveTrustedRepoInspectionPrompt", () => {
  it("delegates single prompt resolution", () => {
    const result = resolveTrustedRepoInspectionPrompt(
      "Do not guess. Run only this command in the workspace repo: git rev-parse --short HEAD. Return only the output.",
    );

    expect(result).toEqual({
      kind: "exec",
      argv: ["git", "rev-parse", "--short", "HEAD"],
    });
  });
});
