$ErrorActionPreference = "Stop"

$path = "src/agents/subagent-spawn.ts"

if (-not (Test-Path -LiteralPath $path)) {
    throw "File not found: $path"
}

$content = Get-Content -Raw -LiteralPath $path

if ([string]::IsNullOrWhiteSpace($content)) {
    throw "File is empty or unreadable: $path"
}

$pattern = [regex]::Escape(@'
  const cfgSubagentTimeout =
    typeof cfg?.agents?.defaults?.subagents?.runTimeoutSeconds === "number" &&
    Number.isFinite(cfg.agents.defaults.subagents.runTimeoutSeconds)
      ? Math.max(0, Math.floor(cfg.agents.defaults.subagents.runTimeoutSeconds))
      : 0;
  const runTimeoutSeconds =
    typeof params.runTimeoutSeconds === "number" && Number.isFinite(params.runTimeoutSeconds)
      ? Math.max(0, Math.floor(params.runTimeoutSeconds))
      : cfgSubagentTimeout;
'@)

$replacement = @'
  const cfgSubagentTimeout =
    typeof cfg?.agents?.defaults?.subagents?.runTimeoutSeconds === "number" &&
    Number.isFinite(cfg.agents.defaults.subagents.runTimeoutSeconds)
      ? Math.max(0, Math.floor(cfg.agents.defaults.subagents.runTimeoutSeconds))
      : 0;

  const paramRunTimeoutSeconds =
    typeof params.runTimeoutSeconds === "number" && Number.isFinite(params.runTimeoutSeconds)
      ? Math.max(0, Math.floor(params.runTimeoutSeconds))
      : 0;

  const runTimeoutSeconds = Math.max(paramRunTimeoutSeconds, cfgSubagentTimeout);
'@

$updated = [regex]::Replace($content, $pattern, $replacement, 1)

if ($updated -eq $content) {
    throw "Expected timeout block not found in $path"
}

Set-Content -LiteralPath $path -Value $updated -NoNewline
Write-Host "Patched $path"
