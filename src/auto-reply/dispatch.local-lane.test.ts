import { describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { buildTestCtx } from "./reply/test-ctx.js";

const laneMocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  run: vi.fn(),
}));

const dispatchFromConfigMock = vi.hoisted(() => ({
  dispatch: vi.fn(),
}));

vi.mock("./deterministic-local-lane.js", () => ({
  resolveDeterministicLocalLaneMatch: (params: unknown) => laneMocks.resolve(params),
  runDeterministicLocalLane: (params: unknown) => laneMocks.run(params),
}));

vi.mock("./reply/dispatch-from-config.js", () => ({
  dispatchReplyFromConfig: (params: unknown) => dispatchFromConfigMock.dispatch(params),
}));

const { dispatchInboundMessageWithBufferedDispatcher, dispatchInboundMessageWithDispatcher } =
  await import("./dispatch.js");

describe("deterministic local lane at dispatch boundary", () => {
  it("bypasses reply pipeline entirely in buffered path", async () => {
    laneMocks.resolve.mockReturnValue({
      kind: "exec",
      argv: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      workspaceDir: "/tmp/repo",
    });
    laneMocks.run.mockResolvedValue({ text: "safe-agent" });
    dispatchFromConfigMock.dispatch.mockReset();

    const deliver = vi.fn(async () => {});
    const onReplyStart = vi.fn(async () => {});

    const result = await dispatchInboundMessageWithBufferedDispatcher({
      ctx: buildTestCtx({
        Body: "Do not guess. Run only this command in the workspace repo: git rev-parse --abbrev-ref HEAD. Return only the output.",
      }),
      cfg: {} as OpenClawConfig,
      dispatcherOptions: {
        deliver,
        onReplyStart,
      },
    });

    expect(result).toEqual({ queuedFinal: true, counts: { tool: 0, block: 0, final: 1 } });
    expect(laneMocks.run).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith({ text: "safe-agent" }, { kind: "final" });
    expect(onReplyStart).not.toHaveBeenCalled();
    expect(dispatchFromConfigMock.dispatch).not.toHaveBeenCalled();
  });

  it("bypasses dispatcher queue path in non-buffered dispatch", async () => {
    laneMocks.resolve.mockReturnValue({
      kind: "file_lookup",
      path: "src/agents/pi-embedded-runner/model.ts",
    });
    laneMocks.run.mockResolvedValue({ text: "src/agents/pi-embedded-runner/model.ts" });
    dispatchFromConfigMock.dispatch.mockReset();

    const deliver = vi.fn(async () => {});

    const result = await dispatchInboundMessageWithDispatcher({
      ctx: buildTestCtx({
        Body: "Use actual repo files only. Which file contains the Ollama fallback fix? If you cannot verify, say so plainly.",
      }),
      cfg: {} as OpenClawConfig,
      dispatcherOptions: {
        deliver,
      },
    });

    expect(result).toEqual({ queuedFinal: true, counts: { tool: 0, block: 0, final: 1 } });
    expect(deliver).toHaveBeenCalledWith(
      { text: "src/agents/pi-embedded-runner/model.ts" },
      { kind: "final" },
    );
    expect(dispatchFromConfigMock.dispatch).not.toHaveBeenCalled();
  });
});
