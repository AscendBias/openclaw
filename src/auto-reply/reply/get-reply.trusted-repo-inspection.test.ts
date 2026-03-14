import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MsgContext } from "../templating.js";
import { registerGetReplyCommonMocks } from "./get-reply.test-mocks.js";

const mocks = vi.hoisted(() => ({
  resolveTrustedRepoInspectionPromptFromTexts: vi.fn(),
  runTrustedRepoInspectionExec: vi.fn(async () => "safe-agent"),
  resolveReplyDirectives: vi.fn(),
  initSessionState: vi.fn(),
  applyMediaUnderstanding: vi.fn(async (..._args: unknown[]) => undefined),
  applyLinkUnderstanding: vi.fn(async (..._args: unknown[]) => undefined),
}));

registerGetReplyCommonMocks();

vi.mock("../../agents/trusted-repo-inspection.js", () => ({
  resolveTrustedRepoInspectionPromptFromTexts: mocks.resolveTrustedRepoInspectionPromptFromTexts,
  runTrustedRepoInspectionExec: mocks.runTrustedRepoInspectionExec,
}));
vi.mock("../../link-understanding/apply.js", () => ({
  applyLinkUnderstanding: mocks.applyLinkUnderstanding,
}));
vi.mock("../../media-understanding/apply.js", () => ({
  applyMediaUnderstanding: mocks.applyMediaUnderstanding,
}));
vi.mock("./get-reply-directives.js", () => ({
  resolveReplyDirectives: mocks.resolveReplyDirectives,
}));
vi.mock("./get-reply-inline-actions.js", () => ({
  handleInlineActions: vi.fn(async () => ({ kind: "reply", reply: { text: "ok" } })),
}));
vi.mock("./session.js", () => ({
  initSessionState: mocks.initSessionState,
}));

const { getReplyFromConfig } = await import("./get-reply.js");
const workspaceModule = await import("../../agents/workspace.js");
const typingModule = await import("./typing.js");

function buildCtx(overrides: Partial<MsgContext> = {}): MsgContext {
  return {
    Provider: "telegram",
    Surface: "telegram",
    Body: "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
    BodyForCommands:
      "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
    CommandBody:
      "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
    RawBody:
      "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
    SessionKey: "agent:main:telegram:chat",
    From: "telegram:user:42",
    To: "telegram:chat",
    ...overrides,
  };
}

describe("getReplyFromConfig trusted repo inspection", () => {
  beforeEach(() => {
    mocks.resolveTrustedRepoInspectionPromptFromTexts.mockReset();
    mocks.runTrustedRepoInspectionExec.mockReset();
    mocks.resolveReplyDirectives.mockReset();
    mocks.initSessionState.mockReset();
    mocks.applyMediaUnderstanding.mockReset();
    mocks.applyLinkUnderstanding.mockReset();

    mocks.resolveTrustedRepoInspectionPromptFromTexts.mockReturnValue({
      kind: "exec",
      argv: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    });
    mocks.runTrustedRepoInspectionExec.mockResolvedValue("safe-agent");
    mocks.resolveReplyDirectives.mockResolvedValue({ kind: "reply", reply: { text: "ok" } });
    mocks.initSessionState.mockResolvedValue({
      sessionCtx: {},
      sessionEntry: {},
      previousSessionEntry: {},
      sessionStore: {},
      sessionKey: "agent:main:telegram:chat",
      sessionId: "session-1",
      isNewSession: false,
      resetTriggered: false,
      systemSent: false,
      abortedLastRun: false,
      storePath: "/tmp/sessions.json",
      sessionScope: "per-chat",
      groupResolution: undefined,
      isGroup: false,
      triggerBodyNormalized: "",
      bodyStripped: "",
    });
  });

  it("short-circuits strict trusted exec prompts before bootstrap/model flow", async () => {
    const reply = await getReplyFromConfig(buildCtx(), undefined, {});

    expect(reply).toEqual({ text: "safe-agent" });
    expect(mocks.runTrustedRepoInspectionExec).toHaveBeenCalledWith(
      expect.objectContaining({
        argv: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd: "/tmp/workspace",
        timeoutMs: 10_000,
      }),
    );
    expect(mocks.applyMediaUnderstanding).not.toHaveBeenCalled();
    expect(mocks.applyLinkUnderstanding).not.toHaveBeenCalled();
    expect(mocks.initSessionState).not.toHaveBeenCalled();
    expect(workspaceModule.ensureAgentWorkspace).not.toHaveBeenCalled();
    expect(typingModule.createTypingController).not.toHaveBeenCalled();
  });

  it("returns a short plain failure and never enters full run on exec error", async () => {
    mocks.runTrustedRepoInspectionExec.mockRejectedValueOnce(new Error("exec host not allowed"));

    const reply = await getReplyFromConfig(buildCtx(), undefined, {});

    expect(reply).toEqual({
      text: "Unable to run the requested workspace repo command.",
      isError: true,
    });
    expect(mocks.initSessionState).not.toHaveBeenCalled();
  });

  it("returns trusted file lookup response without full run", async () => {
    mocks.resolveTrustedRepoInspectionPromptFromTexts.mockReturnValueOnce({
      kind: "file_lookup",
      path: "src/agents/pi-embedded-runner/model.ts",
    });

    const reply = await getReplyFromConfig(
      buildCtx({
        Body: "Use actual repo files only. Which file contains the Ollama fallback fix? If you cannot verify, say so plainly.",
      }),
      undefined,
      {},
    );

    expect(reply).toEqual({ text: "src/agents/pi-embedded-runner/model.ts" });
    expect(mocks.initSessionState).not.toHaveBeenCalled();
  });

  it("detects trusted prompt from BodyForAgent fallback", async () => {
    mocks.resolveTrustedRepoInspectionPromptFromTexts.mockImplementationOnce((texts) => {
      const list = Array.isArray(texts) ? texts : [];
      const hasBodyForAgent = list.includes(
        "Do not guess. Run only this command in the workspace repo: git rev-parse --short HEAD. Return only the output.",
      );
      return hasBodyForAgent
        ? {
            kind: "exec",
            argv: ["git", "rev-parse", "--short", "HEAD"],
          }
        : null;
    });
    mocks.runTrustedRepoInspectionExec.mockResolvedValueOnce("abc1234");

    const reply = await getReplyFromConfig(
      buildCtx({
        Body: "",
        BodyForCommands: "",
        CommandBody: "",
        RawBody: "",
        BodyForAgent:
          "Do not guess. Run only this command in the workspace repo: git rev-parse --short HEAD. Return only the output.",
      }),
      undefined,
      {},
    );

    expect(reply).toEqual({ text: "abc1234" });
    expect(mocks.initSessionState).not.toHaveBeenCalled();
  });
});
