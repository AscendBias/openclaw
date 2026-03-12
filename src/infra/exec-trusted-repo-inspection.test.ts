import { describe, expect, it } from "vitest";
import { isTrustedRepoInspectionCommand } from "./exec-trusted-repo-inspection.js";

describe("isTrustedRepoInspectionCommand", () => {
  it("allows git rev-parse branch inspection", () => {
    expect(
      isTrustedRepoInspectionCommand([
        {
          raw: "git rev-parse --abbrev-ref HEAD",
          argv: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
          resolution: {
            rawExecutable: "git",
            executableName: "git",
            effectiveArgv: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
          },
        },
      ]),
    ).toBe(true);
  });

  it("allows git rev-parse short hash inspection", () => {
    expect(
      isTrustedRepoInspectionCommand([
        {
          raw: "git rev-parse --short HEAD",
          argv: ["git", "rev-parse", "--short", "HEAD"],
          resolution: {
            rawExecutable: "git",
            executableName: "git",
            effectiveArgv: ["git", "rev-parse", "--short", "HEAD"],
          },
        },
      ]),
    ).toBe(true);
  });

  it("rejects non-inspection git commands", () => {
    expect(
      isTrustedRepoInspectionCommand([
        {
          raw: "git checkout main",
          argv: ["git", "checkout", "main"],
          resolution: {
            rawExecutable: "git",
            executableName: "git",
            effectiveArgv: ["git", "checkout", "main"],
          },
        },
      ]),
    ).toBe(false);
  });

  it("allows trusted git rev-parse wrapped in bash -lc", () => {
    expect(
      isTrustedRepoInspectionCommand([
        {
          raw: "bash -lc 'git rev-parse --short HEAD'",
          argv: ["bash", "-lc", "git rev-parse --short HEAD"],
          resolution: {
            rawExecutable: "bash",
            executableName: "bash",
            effectiveArgv: ["bash", "-lc", "git rev-parse --short HEAD"],
          },
        },
      ]),
    ).toBe(true);
  });

  it("rejects wrapped shell commands that are not trusted repo inspection", () => {
    expect(
      isTrustedRepoInspectionCommand([
        {
          raw: "bash -lc 'git status'",
          argv: ["bash", "-lc", "git status"],
          resolution: {
            rawExecutable: "bash",
            executableName: "bash",
            effectiveArgv: ["bash", "-lc", "git status"],
          },
        },
      ]),
    ).toBe(false);
  });
});
