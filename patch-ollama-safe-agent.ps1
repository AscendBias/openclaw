$ErrorActionPreference = "Stop"

function Replace-OrThrow {
    param(
        [string]$Path,
        [string]$Pattern,
        [string]$Replacement
    )

    $content = Get-Content -Raw -LiteralPath $Path
    $updated = [regex]::Replace(
        $content,
        $Pattern,
        $Replacement,
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    if ($updated -eq $content) {
        throw "No change made in $Path. Pattern not found."
    }

    Set-Content -LiteralPath $Path -Value $updated -NoNewline
    Write-Host "Patched $Path"
}

# 1) Stop local Ollama from entering provider cooldown
Replace-OrThrow `
    -Path "src/agents/auth-profiles/usage.ts" `
    -Pattern 'return normalized === "openrouter" \|\| normalized === "kilocode";' `
    -Replacement 'return normalized === "openrouter" || normalized === "kilocode" || normalized === "ollama";'

Write-Host ""
Write-Host "Patch 1 applied successfully."
Write-Host "Now inspect these files manually before we patch them:"
Write-Host "  src/commands/onboard-auth.config-core.ts"
Write-Host "  src/agents/models-config.providers.ts"
Write-Host ""
Write-Host "Use:"
Write-Host '  rg -n "ollama|models:\s*\[\]|buildOllamaProvider|providers\.ollama|ollama-local" src/commands/onboard-auth.config-core.ts src/agents/models-config.providers.ts'
Write-Host '  rg -n "runTimeoutSeconds|minRunTimeoutSeconds|sessions_spawn" src'
