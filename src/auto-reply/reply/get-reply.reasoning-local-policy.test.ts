import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MsgContext } from "../templating.js";
import { registerGetReplyCommonMocks } from "./get-reply.test-mocks.js";

const mocks = vi.hoisted(() => ({
  resolveReplyDirectives: vi.fn(),
  handleInlineActions: vi.fn(),
  initSessionState: vi.fn(),
}));

registerGetReplyCommonMocks();

vi.mock("../../link-understanding/apply.js", () => ({
  applyLinkUnderstanding: vi.fn(async () => undefined),
}));
vi.mock("../../media-understanding/apply.js", () => ({
  applyMediaUnderstanding: vi.fn(async () => undefined),
}));
vi.mock("./get-reply-directives.js", () => ({
  resolveReplyDirectives: (...args: unknown[]) => mocks.resolveReplyDirectives(...args),
}));
vi.mock("./get-reply-inline-actions.js", () => ({
  handleInlineActions: (...args: unknown[]) => mocks.handleInlineActions(...args),
}));
vi.mock("./session.js", () => ({
  initSessionState: (...args: unknown[]) => mocks.initSessionState(...args),
}));

const { getReplyFromConfig } = await import("./get-reply.js");
const { runPreparedReply } = await import("./get-reply-run.js");
const { resolveOllamaFirstReasoningModel } = await import("../../agents/model-selection.js");

function buildCtx(overrides: Partial<MsgContext> = {}): MsgContext {
  return {
    Provider: "telegram",
    Surface: "telegram",
    Body: "Explain this",
    RawBody: "Explain this",
    CommandBody: "Explain this",
    SessionKey: "agent:main:telegram:direct:123",
    From: "telegram:123",
    To: "telegram:chat",
    ...overrides,
  };
}

function createContinueDirectivesResult(provider: string, model: string) {
  return {
    kind: "continue" as const,
    result: {
      commandSource: "text",
      command: {
        surface: "telegram",
        channel: "telegram",
        channelId: "telegram",
        ownerList: [],
        senderIsOwner: true,
        isAuthorizedSender: true,
        senderId: "123",
        abortKey: "telegram:123",
        rawBodyNormalized: "Explain this",
        commandBodyNormalized: "Explain this",
        from: "telegram:123",
        to: "telegram:chat",
        resetHookTriggered: false,
      },
      allowTextCommands: true,
      skillCommands: [],
      directives: {},
      cleanedBody: "Explain this",
      elevatedEnabled: false,
      elevatedAllowed: false,
      elevatedFailures: [],
      defaultActivation: "always",
      resolvedThinkLevel: undefined,
      resolvedVerboseLevel: "off",
      resolvedReasoningLevel: "off",
      resolvedElevatedLevel: "off",
      execOverrides: undefined,
      blockStreamingEnabled: false,
      blockReplyChunking: undefined,
      resolvedBlockStreamingBreak: undefined,
      provider,
      model,
      modelState: {
        resolveDefaultThinkingLevel: async () => undefined,
      },
      contextTokens: 0,
      inlineStatusRequested: false,
      directiveAck: undefined,
      perMessageQueueMode: undefined,
      perMessageQueueOptions: undefined,
    },
  };
}

describe("getReplyFromConfig reasoning-local strict policy", () => {
  beforeEach(() => {
    mocks.resolveReplyDirectives.mockReset();
    mocks.handleInlineActions.mockReset();
    mocks.initSessionState.mockReset();
    vi.mocked(runPreparedReply).mockReset();
    vi.mocked(resolveOllamaFirstReasoningModel).mockReset();

    mocks.initSessionState.mockResolvedValue({
      sessionCtx: buildCtx(),
      sessionEntry: {},
      previousSessionEntry: {},
      sessionStore: {},
      sessionKey: "agent:main:telegram:direct:123",
      sessionId: "session-1",
      isNewSession: false,
      resetTriggered: false,
      systemSent: false,
      abortedLastRun: false,
      storePath: "/tmp/sessions.json",
      sessionScope: "per-sender",
      groupResolution: undefined,
      isGroup: false,
      triggerBodyNormalized: "Explain this",
      bodyStripped: "Explain this",
    });
    mocks.handleInlineActions.mockResolvedValue({
      kind: "continue",
      directives: {},
      abortedLastRun: false,
    });
    vi.mocked(resolveOllamaFirstReasoningModel).mockImplementation(({ fallback }) => fallback);
    vi.mocked(runPreparedReply).mockResolvedValue({ text: "ok" });
  });

  it("fails plainly and skips model run when reasoning-local resolves to cloud provider", async () => {
    mocks.resolveReplyDirectives.mockResolvedValue(
      createContinueDirectivesResult("openai", "gpt-4o-mini"),
    );

    const reply = await getReplyFromConfig(buildCtx(), { localTaskLane: "reasoning-local" }, {});

    expect(reply).toEqual({
      text: "Local Reasoning Lane requires a local Ollama/local provider. Current selection openai/gpt-4o-mini is not local.",
      isError: true,
    });
    expect(runPreparedReply).not.toHaveBeenCalled();
  });

  it("accepts local providers for reasoning-local lane", async () => {
    mocks.resolveReplyDirectives.mockResolvedValue(
      createContinueDirectivesResult("ollama", "qwen3:14b"),
    );

    const reply = await getReplyFromConfig(buildCtx(), { localTaskLane: "reasoning-local" }, {});

    expect(reply).toEqual({ text: "ok" });
    expect(runPreparedReply).toHaveBeenCalledTimes(1);
  });

  it("fails plainly when no local provider is available and ollama-first falls back", async () => {
    mocks.resolveReplyDirectives.mockResolvedValue(
      createContinueDirectivesResult("openai", "gpt-4o-mini"),
    );

    const reply = await getReplyFromConfig(buildCtx(), { localTaskLane: "reasoning-local" }, {});

    expect(resolveOllamaFirstReasoningModel).toHaveBeenCalled();
    expect(reply).toEqual({
      text: "Local Reasoning Lane requires a local Ollama/local provider. Current selection openai/gpt-4o-mini is not local.",
      isError: true,
    });
    expect(runPreparedReply).not.toHaveBeenCalled();
  });
});
