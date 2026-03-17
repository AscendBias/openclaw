import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { FinalizedMsgContext } from "../templating.js";
import { classifyLocalTaskLane } from "./local-task-lane.js";

const cfg = {} as OpenClawConfig;

function ctx(overrides: Partial<FinalizedMsgContext> = {}): FinalizedMsgContext {
  return {
    CommandAuthorized: true,
    Provider: "telegram",
    BodyForCommands: "help me summarize this thread",
    ...overrides,
  };
}

describe("classifyLocalTaskLane", () => {
  it("marks trusted deterministic repo prompts as deterministic-local", () => {
    const classified = classifyLocalTaskLane(
      ctx({
        BodyForCommands: "Use actual repo files only. Which file contains the Ollama fallback fix?",
      }),
      cfg,
    );
    expect(classified.deterministicTrustedRepoTask).toBe(true);
    expect(classified.lane).toBe("deterministic-local");
    expect(classified.reasoningLocalTelegramTask).toBe(false);
  });

  it("marks telegram reasoning prompts as reasoning-local and ollama-first", () => {
    const classified = classifyLocalTaskLane(ctx(), cfg);
    expect(classified.lane).toBe("reasoning-local");
    expect(classified.reasoningLocalTelegramTask).toBe(true);
    expect(classified.expectedLongRunning).toBe(true);
    expect(classified.ollamaFirstReasoning).toBe(true);
  });

  it("routes control commands to control lane", () => {
    const classified = classifyLocalTaskLane(
      ctx({ BodyForCommands: "/approve abcd1234 allow-once" }),
      cfg,
    );
    expect(classified.lane).toBe("control");
    expect(classified.controlTask).toBe(true);
  });
});
