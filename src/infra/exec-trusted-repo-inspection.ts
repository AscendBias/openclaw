import type { ExecCommandSegment } from "./exec-approvals-analysis.js";

function isTrustedGitRevParseArgv(argv: string[]): boolean {
  if (argv.length !== 4) {
    return false;
  }
  if (argv[1] !== "rev-parse") {
    return false;
  }
  const flag = argv[2] ?? "";
  const ref = argv[3] ?? "";
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

export function isTrustedRepoInspectionCommand(segments: ExecCommandSegment[]): boolean {
  if (segments.length !== 1) {
    return false;
  }
  const segment = segments[0];
  const resolution = segment.resolution;
  const executableName = resolution?.executableName?.toLowerCase();
  if (!executableName || executableName !== "git") {
    return false;
  }
  const argv =
    resolution?.effectiveArgv && resolution.effectiveArgv.length > 0
      ? resolution.effectiveArgv
      : segment.argv;
  return isTrustedGitRevParseArgv(argv);
}
