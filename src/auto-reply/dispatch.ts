import type { OpenClawConfig } from "../config/config.js";
import {
  resolveDeterministicLocalLaneMatch,
  runDeterministicLocalLane,
} from "./deterministic-local-lane.js";
import type { DispatchFromConfigResult } from "./reply/dispatch-from-config.js";
import { dispatchReplyFromConfig } from "./reply/dispatch-from-config.js";
import { finalizeInboundContext } from "./reply/inbound-context.js";
import { classifyLocalTaskLane } from "./reply/local-task-lane.js";
import {
  createReplyDispatcher,
  createReplyDispatcherWithTyping,
  type ReplyDispatcher,
  type ReplyDispatcherOptions,
  type ReplyDispatcherWithTypingOptions,
} from "./reply/reply-dispatcher.js";
import type { FinalizedMsgContext, MsgContext } from "./templating.js";
import type { GetReplyOptions } from "./types.js";

export type DispatchInboundResult = DispatchFromConfigResult;

export async function withReplyDispatcher<T>(params: {
  dispatcher: ReplyDispatcher;
  run: () => Promise<T>;
  onSettled?: () => void | Promise<void>;
}): Promise<T> {
  try {
    return await params.run();
  } finally {
    // Ensure dispatcher reservations are always released on every exit path.
    params.dispatcher.markComplete();
    try {
      await params.dispatcher.waitForIdle();
    } finally {
      await params.onSettled?.();
    }
  }
}

async function tryDispatchDeterministicLocalLane(params: {
  ctx: FinalizedMsgContext;
  cfg: OpenClawConfig;
  deliver: ReplyDispatcherOptions["deliver"];
}): Promise<DispatchInboundResult | null> {
  const match = resolveDeterministicLocalLaneMatch({
    ctx: params.ctx,
    cfg: params.cfg,
  });
  if (!match) {
    return null;
  }

  const payload = await runDeterministicLocalLane(match);
  await params.deliver(payload, { kind: "final" });
  return { queuedFinal: true, counts: { tool: 0, block: 0, final: 1 } };
}

export async function dispatchInboundMessage(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);
  const localTaskLane = classifyLocalTaskLane(finalized, params.cfg);
  return await withReplyDispatcher({
    dispatcher: params.dispatcher,
    run: () =>
      dispatchReplyFromConfig({
        ctx: finalized,
        cfg: params.cfg,
        dispatcher: params.dispatcher,
        replyOptions: {
          ...params.replyOptions,
          localTaskLane: params.replyOptions?.localTaskLane ?? localTaskLane.lane,
        },
        replyResolver: params.replyResolver,
      }),
  });
}

export async function dispatchInboundMessageWithBufferedDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);
  const deterministicLocalResult = await tryDispatchDeterministicLocalLane({
    ctx: finalized,
    cfg: params.cfg,
    deliver: params.dispatcherOptions.deliver,
  });
  if (deterministicLocalResult) {
    return deterministicLocalResult;
  }

  const { dispatcher, replyOptions, markDispatchIdle } = createReplyDispatcherWithTyping(
    params.dispatcherOptions,
  );
  try {
    return await dispatchInboundMessage({
      ctx: finalized,
      cfg: params.cfg,
      dispatcher,
      replyResolver: params.replyResolver,
      replyOptions: {
        ...params.replyOptions,
        ...replyOptions,
      },
    });
  } finally {
    markDispatchIdle();
  }
}

export async function dispatchInboundMessageWithDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: OpenClawConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);
  const deterministicLocalResult = await tryDispatchDeterministicLocalLane({
    ctx: finalized,
    cfg: params.cfg,
    deliver: params.dispatcherOptions.deliver,
  });
  if (deterministicLocalResult) {
    return deterministicLocalResult;
  }

  const dispatcher = createReplyDispatcher(params.dispatcherOptions);
  return await dispatchInboundMessage({
    ctx: finalized,
    cfg: params.cfg,
    dispatcher,
    replyResolver: params.replyResolver,
    replyOptions: params.replyOptions,
  });
}
