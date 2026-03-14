import type { ExecCommandSegment } from "./exec-approvals-analysis.js";
import { analyzeShellCommand } from "./exec-approvals-analysis.js";

function isTrustedGitRevParseArgv(argv: string[]): boolean {
  if (argv.length < 4) {
    return false;
  }
  let index = 1;
  if (argv[index] === "-C") {
    const cwdArg = argv[index + 1] ?? "";
    if (!cwdArg || cwdArg.startsWith("-")) {
      return false;
    }
    index += 2;
  }
  if (argv[index] !== "rev-parse") {
    return false;
  }
  const flag = argv[index + 1] ?? "";
  const ref = argv[index + 2] ?? "";
  if (argv.length !== index + 3) {
    return false;
  }
  if (ref !== "HEAD") {
    return false;
  }
  if (flag === "--abbrev-ref") {
    return true;
  }
  if (/^--short(?:=\d+)?$/.test(flag)) {
    return true;
  }
  return false;
}

const SHELL_WRAPPER_FLAGS = new Set(["-c", "-lc", "/c"]);

function extractNestedShellCommand(argv: string[]): string | null {
  if (argv.length < 3) {
    return null;
  }
  for (let i = 1; i < argv.length - 1; i += 1) {
    if (!SHELL_WRAPPER_FLAGS.has(argv[i]?.toLowerCase() ?? "")) {
      continue;
    }
    const nested = argv
      .slice(i + 1)
      .join(" ")
      .trim();
    return nested.length > 0 ? nested : null;
  }
  return null;
}

function isTrustedRepoInspectionArgv(argv: string[]): boolean {
  const executable = (argv[0] ?? "").toLowerCase();
  if (executable === "git") {
    return isTrustedGitRevParseArgv(argv);
  }
  if (
    executable !== "bash" &&
    executable !== "sh" &&
    executable !== "zsh" &&
    executable !== "cmd"
  ) {
    return false;
  }
  const nestedCommand = extractNestedShellCommand(argv);
  if (!nestedCommand) {
    return false;
  }
  const nested = analyzeShellCommand({
    command: nestedCommand,
    cwd: process.cwd(),
    env: process.env,
  });
  return nested.ok && isTrustedRepoInspectionCommand(nested.segments);
}

export function isTrustedRepoInspectionCommand(segments: ExecCommandSegment[]): boolean {
  let commandSegment: ExecCommandSegment | undefined;
  if (segments.length === 1) {
    commandSegment = segments[0];
  } else if (segments.length === 2) {
    const [first, second] = segments;
    const firstArgv =
      first.resolution?.effectiveArgv && first.resolution.effectiveArgv.length > 0
        ? first.resolution.effectiveArgv
        : first.argv;
    if (firstArgv[0] !== "cd" || firstArgv.length !== 2) {
      return false;
    }
    commandSegment = second;
  } else {
    return false;
  }
  const resolution = commandSegment.resolution;
  const executableName = resolution?.executableName?.toLowerCase();
  if (!executableName) {
    return false;
  }
  const argv =
    resolution?.effectiveArgv && resolution.effectiveArgv.length > 0
      ? resolution.effectiveArgv
      : commandSegment.argv;
  return isTrustedRepoInspectionArgv(argv);
}
