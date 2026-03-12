import "./run.overflow-compaction.mocks.shared.js";
import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pickFallbackThinkingLevel } from "../pi-embedded-helpers.js";
import { resolveModel } from "./model.js";
import { runEmbeddedPiAgent } from "./run.js";
import {
  makeAttemptResult,
  makeCompactionSuccess,
  makeOverflowError,
  mockOverflowRetrySuccess,
  queueOverflowAttemptWithOversizedToolOutput,
} from "./run.overflow-compaction.fixture.js";
import { mockedGlobalHookRunner } from "./run.overflow-compaction.mocks.shared.js";
import {
  mockedCompactDirect,
  mockedRunEmbeddedAttempt,
  mockedSessionLikelyHasOversizedToolResults,
  mockedTruncateOversizedToolResultsInSession,
  overflowBaseRunParams,
} from "./run.overflow-compaction.shared-test.js";
const mockedPickFallbackThinkingLevel = vi.mocked(pickFallbackThinkingLevel);
const mockedResolveModel = vi.mocked(resolveModel);

describe("runEmbeddedPiAgent overflow compaction trigger routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGlobalHookRunner.hasHooks.mockImplementation(() => false);
  });

  it("short-circuits strict trusted branch prompt before embedded/bootstrap/model flow", async () => {
    const result = await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      workspaceDir: process.cwd(),
      prompt:
        "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
    });

    const expectedBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    expect(result.payloads).toEqual([{ text: expectedBranch }]);
    expect(mockedRunEmbeddedAttempt).not.toHaveBeenCalled();
    expect(mockedResolveModel).not.toHaveBeenCalled();
  });

  it("short-circuits strict trusted short-hash prompt and fails plain on exec error", async () => {
    const success = await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      workspaceDir: process.cwd(),
      prompt:
        "Do not guess. Run only this command in the workspace repo: git rev-parse --short HEAD. Return only the output.",
    });

    const expectedShort = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    expect(success.payloads).toEqual([{ text: expectedShort }]);
    expect(mockedRunEmbeddedAttempt).not.toHaveBeenCalled();
    expect(mockedResolveModel).not.toHaveBeenCalled();

    const failure = await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      workspaceDir: "/tmp/openclaw-missing-workspace",
      prompt:
        "Do not guess. Run only this command in the workspace repo: git rev-parse --short HEAD. Return only the output.",
    });

    expect(failure.payloads).toEqual([
      {
        text: "Unable to run the requested workspace repo command.",
        isError: true,
      },
    ]);
    expect(mockedRunEmbeddedAttempt).not.toHaveBeenCalled();
    expect(mockedResolveModel).not.toHaveBeenCalled();
  });

  it("passes precomputed legacy before_agent_start result into the attempt", async () => {
    const legacyResult = {
      modelOverride: "legacy-model",
      prependContext: "legacy context",
    };
    mockedGlobalHookRunner.hasHooks.mockImplementation(
      (hookName) => hookName === "before_agent_start",
    );
    mockedGlobalHookRunner.runBeforeAgentStart.mockResolvedValueOnce(legacyResult);
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    await runEmbeddedPiAgent({
      sessionId: "test-session",
      sessionKey: "test-key",
      sessionFile: "/tmp/session.json",
      workspaceDir: "/tmp/workspace",
      prompt: "hello",
      timeoutMs: 30000,
      runId: "run-legacy-pass-through",
    });

    expect(mockedGlobalHookRunner.runBeforeAgentStart).toHaveBeenCalledTimes(1);
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        legacyBeforeAgentStartResult: legacyResult,
      }),
    );
  });

  it("passes resolved auth profile into run attempts for context-engine afterTurn propagation", async () => {
    mockedRunEmbeddedAttempt.mockResolvedValueOnce(makeAttemptResult({ promptError: null }));

    await runEmbeddedPiAgent({
      ...overflowBaseRunParams,
      runId: "run-auth-profile-passthrough",
    });

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        authProfileId: "test-profile",
        authProfileIdSource: "auto",
      }),
    );
  });

  it("passes trigger=overflow when retrying compaction after context overflow", async () => {
    mockOverflowRetrySuccess({
      runEmbeddedAttempt: mockedRunEmbeddedAttempt,
      compactDirect: mockedCompactDirect,
    });

    await runEmbeddedPiAgent(overflowBaseRunParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(1);
    expect(mockedCompactDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "overflow",
        authProfileId: "test-profile",
      }),
    );
  });

  it("does not reset compaction attempt budget after successful tool-result truncation", async () => {
    const overflowError = queueOverflowAttemptWithOversizedToolOutput(
      mockedRunEmbeddedAttempt,
      makeOverflowError(),
    );
    mockedRunEmbeddedAttempt
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }))
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }))
      .mockResolvedValueOnce(makeAttemptResult({ promptError: overflowError }));

    mockedCompactDirect
      .mockResolvedValueOnce({
        ok: false,
        compacted: false,
        reason: "nothing to compact",
      })
      .mockResolvedValueOnce(
        makeCompactionSuccess({
          summary: "Compacted 2",
          firstKeptEntryId: "entry-5",
          tokensBefore: 160000,
        }),
      )
      .mockResolvedValueOnce(
        makeCompactionSuccess({
          summary: "Compacted 3",
          firstKeptEntryId: "entry-7",
          tokensBefore: 140000,
        }),
      );

    mockedSessionLikelyHasOversizedToolResults.mockReturnValue(true);
    mockedTruncateOversizedToolResultsInSession.mockResolvedValueOnce({
      truncated: true,
      truncatedCount: 1,
    });

    const result = await runEmbeddedPiAgent(overflowBaseRunParams);

    expect(mockedCompactDirect).toHaveBeenCalledTimes(3);
    expect(mockedTruncateOversizedToolResultsInSession).toHaveBeenCalledTimes(1);
    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(4);
    expect(result.meta.error?.kind).toBe("context_overflow");
  });

  it("returns retry_limit when repeated retries never converge", async () => {
    mockedRunEmbeddedAttempt.mockClear();
    mockedCompactDirect.mockClear();
    mockedPickFallbackThinkingLevel.mockClear();
    mockedRunEmbeddedAttempt.mockResolvedValue(
      makeAttemptResult({ promptError: new Error("unsupported reasoning mode") }),
    );
    mockedPickFallbackThinkingLevel.mockReturnValue("low");

    const result = await runEmbeddedPiAgent(overflowBaseRunParams);

    expect(mockedRunEmbeddedAttempt).toHaveBeenCalledTimes(32);
    expect(mockedCompactDirect).not.toHaveBeenCalled();
    expect(result.meta.error?.kind).toBe("retry_limit");
    expect(result.payloads?.[0]?.isError).toBe(true);
  });
});
