import { describe, expect, it } from "vitest";
import {
  isSimpleRepoInspectionPrompt,
  resolveAttemptThinkLevel,
  resolveAttemptTimeoutMs,
} from "./run.js";

describe("embedded run simple repo inspection fast path", () => {
  it("detects command-only repo prompts", () => {
    expect(
      isSimpleRepoInspectionPrompt(
        "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
      ),
    ).toBe(true);
  });

  it("detects repo file lookup prompts", () => {
    expect(
      isSimpleRepoInspectionPrompt(
        "Use actual repo files only. Which file contains the Ollama fallback fix? If you cannot verify, say so plainly.",
      ),
    ).toBe(true);
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
