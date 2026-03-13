import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { applyRuntimeHardeningDefaults } from "./defaults.js";
import { withTempHome } from "./test-helpers.js";

describe("runtime hardening defaults", () => {
  it("fills Telegram and exec defaults from owner allowlist", () => {
    const cfg = applyRuntimeHardeningDefaults({
      channels: {
        telegram: {
          enabled: true,
          botToken: "token",
          allowFrom: ["6101296751"],
        },
      },
    });

    expect(cfg.channels?.telegram?.dmPolicy).toBe("pairing");
    expect(cfg.channels?.telegram?.groupAllowFrom).toEqual([]);
    expect(cfg.channels?.telegram?.execApprovals).toEqual({
      enabled: true,
      approvers: ["6101296751"],
      target: "dm",
    });
    expect(cfg.tools?.exec).toEqual({
      host: "gateway",
      security: "allowlist",
      ask: "on-miss",
    });
    expect(cfg.commands?.allowFrom).toEqual({ telegram: ["6101296751"] });
  });

  it("does not override explicit command or exec settings", () => {
    const cfg = applyRuntimeHardeningDefaults({
      channels: {
        telegram: {
          enabled: true,
          allowFrom: ["6101296751"],
          dmPolicy: "open",
          groupAllowFrom: ["777"],
          execApprovals: { enabled: false },
        },
      },
      commands: { allowFrom: { telegram: ["999"] } },
      tools: { exec: { host: "node", security: "full", ask: "always" } },
    });

    expect(cfg.channels?.telegram?.dmPolicy).toBe("open");
    expect(cfg.channels?.telegram?.groupAllowFrom).toEqual(["777"]);
    expect(cfg.channels?.telegram?.execApprovals).toEqual({ enabled: false });
    expect(cfg.commands?.allowFrom).toEqual({ telegram: ["999"] });
    expect(cfg.tools?.exec).toEqual({ host: "node", security: "full", ask: "always" });
  });

  it("inserts safe defaults during loadConfig when fields are missing", async () => {
    await withTempHome(async (home) => {
      const cfgDir = path.join(home, ".openclaw");
      await fs.mkdir(cfgDir, { recursive: true });
      await fs.writeFile(
        path.join(cfgDir, "openclaw.json"),
        JSON.stringify({
          channels: {
            telegram: {
              enabled: true,
              botToken: "token",
              allowFrom: ["6101296751"],
            },
          },
        }),
      );

      const cfg = loadConfig();
      expect(cfg.channels?.telegram?.dmPolicy).toBe("pairing");
      expect(cfg.commands?.allowFrom).toEqual({ telegram: ["6101296751"] });
      expect(cfg.tools?.exec?.host).toBe("gateway");
      expect(cfg.tools?.exec?.security).toBe("allowlist");
      expect(cfg.tools?.exec?.ask).toBe("on-miss");
    });
  });
});
