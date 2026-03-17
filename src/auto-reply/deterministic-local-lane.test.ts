import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FinalizedMsgContext } from "./templating.js";

const mocks = vi.hoisted(() => ({
  fsAccess: vi.fn(async () => undefined),
  resolveTrustedRepoInspectionPromptFromTexts: vi.fn(),
  runTrustedRepoInspectionExec: vi.fn(async () => "ok"),
  resolveSessionAgentId: vi.fn(() => "main"),
  resolveAgentWorkspaceDir: vi.fn(() => "/tmp/workspace"),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: mocks.fsAccess,
  },
}));

vi.mock("../agents/trusted-repo-inspection.js", () => ({
  resolveTrustedRepoInspectionPromptFromTexts: mocks.resolveTrustedRepoInspectionPromptFromTexts,
  runTrustedRepoInspectionExec: mocks.runTrustedRepoInspectionExec,
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveSessionAgentId: mocks.resolveSessionAgentId,
  resolveAgentWorkspaceDir: mocks.resolveAgentWorkspaceDir,
}));

const { resolveDeterministicLocalLaneMatch, runDeterministicLocalLane } =
  await import("./deterministic-local-lane.js");

describe("deterministic local lane", () => {
  beforeEach(() => {
    mocks.fsAccess.mockReset();
    mocks.resolveTrustedRepoInspectionPromptFromTexts.mockReset();
    mocks.runTrustedRepoInspectionExec.mockReset();
    mocks.resolveSessionAgentId.mockReset();
    mocks.resolveAgentWorkspaceDir.mockReset();

    mocks.fsAccess.mockResolvedValue(undefined);
    mocks.resolveSessionAgentId.mockReturnValue("main");
    mocks.resolveAgentWorkspaceDir.mockReturnValue("/tmp/workspace");
  });

  it("verifies trusted file lookup in workspace before returning path", async () => {
    mocks.resolveTrustedRepoInspectionPromptFromTexts.mockReturnValueOnce({
      kind: "file_lookup",
      path: "src/agents/pi-embedded-runner/model.ts",
    });

    const match = resolveDeterministicLocalLaneMatch({
      ctx: { SessionKey: "agent:main:telegram:chat" } as unknown as FinalizedMsgContext,
      cfg: {},
    });

    expect(match).toEqual({
      kind: "file_lookup",
      path: "src/agents/pi-embedded-runner/model.ts",
      workspaceDir: "/tmp/workspace",
    });

    const reply = await runDeterministicLocalLane(match!);

    expect(mocks.fsAccess).toHaveBeenCalledWith(
      "/tmp/workspace/src/agents/pi-embedded-runner/model.ts",
    );
    expect(reply).toEqual({ text: "src/agents/pi-embedded-runner/model.ts" });
  });

  it("returns plain verification failure when trusted file lookup cannot be verified", async () => {
    mocks.fsAccess.mockRejectedValueOnce(new Error("ENOENT"));

    const reply = await runDeterministicLocalLane({
      kind: "file_lookup",
      path: "src/agents/pi-embedded-runner/model.ts",
      workspaceDir: "/tmp/workspace",
    });

    expect(reply).toEqual({
      text: "I couldn't verify that file in the workspace repo.",
      isError: true,
    });
  });

  it("keeps deterministic command behavior unchanged", async () => {
    mocks.runTrustedRepoInspectionExec.mockResolvedValueOnce("work");

    const reply = await runDeterministicLocalLane({
      kind: "exec",
      argv: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      workspaceDir: "/tmp/workspace",
    });

    expect(mocks.runTrustedRepoInspectionExec).toHaveBeenCalledWith({
      argv: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      cwd: "/tmp/workspace",
      timeoutMs: 10_000,
    });
    expect(reply).toEqual({ text: "work" });
  });
});
