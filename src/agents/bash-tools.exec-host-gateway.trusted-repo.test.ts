import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withEnvAsync } from "../test-utils/env.js";

const registerExecApprovalRequestForHostOrThrow = vi.fn();

vi.mock("./bash-tools.exec-approval-request.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./bash-tools.exec-approval-request.js")>();
  return {
    ...actual,
    registerExecApprovalRequestForHostOrThrow,
  };
});

describe("gateway exec trusted repo inspection", () => {
  it("bypasses approval wait for git rev-parse --abbrev-ref HEAD", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-trusted-"));
    await withEnvAsync({ HOME: home }, async () => {
      const { processGatewayAllowlist } = await import("./bash-tools.exec-host-gateway.js");
      registerExecApprovalRequestForHostOrThrow.mockReset();

      const result = await processGatewayAllowlist({
        command: "git rev-parse --abbrev-ref HEAD",
        workdir: process.cwd(),
        env: process.env as Record<string, string>,
        pty: false,
        timeoutSec: 10,
        defaultTimeoutSec: 10,
        security: "allowlist",
        ask: "on-miss",
        safeBins: new Set<string>(),
        safeBinProfiles: {},
        warnings: [],
        approvalRunningNoticeMs: 10000,
        maxOutput: 10000,
        pendingMaxOutput: 5000,
      });

      expect(result.pendingResult).toBeUndefined();
      expect(registerExecApprovalRequestForHostOrThrow).not.toHaveBeenCalled();
    });
  });
});
