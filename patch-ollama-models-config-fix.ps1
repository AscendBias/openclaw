$ErrorActionPreference = "Stop"

$path = "src/agents/models-config.providers.ts"

if (-not (Test-Path -LiteralPath $path)) {
    throw "File not found: $path"
}

$content = Get-Content -Raw -LiteralPath $path

if ([string]::IsNullOrWhiteSpace($content)) {
    throw "File is empty or unreadable: $path"
}

$old = @'
  const ollamaBaseUrl = explicitOllama?.baseUrl;
  const hasExplicitOllamaConfig = Boolean(explicitOllama);
  const hasExplicitOllamaModels =
    Array.isArray(explicitOllama?.models) && explicitOllama.models.length > 0;

  if (hasExplicitOllamaConfig && hasExplicitOllamaModels) {
    return {
      ollama: {
        ...explicitOllama,
        baseUrl: resolveOllamaApiBase(explicitOllama.baseUrl),
        api: explicitOllama.api ?? "ollama",
        apiKey: ollamaKey ?? explicitOllama.apiKey ?? OLLAMA_LOCAL_AUTH_MARKER,
      },
    };
  }

  const ollamaProvider = await buildOllamaProvider(ollamaBaseUrl, {
    quiet: !ollamaKey && !hasExplicitOllamaConfig,
  });

  if (ollamaProvider.models.length === 0 && hasExplicitOllamaConfig) {
    return {
      ollama: {
        ...explicitOllama,
        baseUrl: resolveOllamaApiBase(explicitOllama.baseUrl),
        api: explicitOllama.api ?? "ollama",
        apiKey: ollamaKey ?? explicitOllama.apiKey ?? OLLAMA_LOCAL_AUTH_MARKER,
      },
    };
  }
'@

$new = @'
  const ollamaBaseUrl = explicitOllama?.baseUrl;
  const hasExplicitOllamaConfig = Boolean(explicitOllama);
  const hasExplicitOllamaModels =
    Array.isArray(explicitOllama?.models) && explicitOllama.models.length > 0;

  if (hasExplicitOllamaConfig && hasExplicitOllamaModels) {
    const explicitOllamaConfig = explicitOllama!;
    return {
      ollama: {
        ...explicitOllamaConfig,
        models: explicitOllamaConfig.models ?? [],
        baseUrl: resolveOllamaApiBase(explicitOllamaConfig.baseUrl),
        api: explicitOllamaConfig.api ?? "ollama",
        apiKey: ollamaKey ?? explicitOllamaConfig.apiKey ?? OLLAMA_LOCAL_AUTH_MARKER,
      },
    };
  }

  const ollamaProvider = await buildOllamaProvider(ollamaBaseUrl, {
    quiet: !ollamaKey && !hasExplicitOllamaConfig,
  });

  if (ollamaProvider.models.length === 0 && hasExplicitOllamaConfig) {
    const explicitOllamaConfig = explicitOllama!;
    return {
      ollama: {
        ...explicitOllamaConfig,
        models: explicitOllamaConfig.models ?? [],
        baseUrl: resolveOllamaApiBase(explicitOllamaConfig.baseUrl),
        api: explicitOllamaConfig.api ?? "ollama",
        apiKey: ollamaKey ?? explicitOllamaConfig.apiKey ?? OLLAMA_LOCAL_AUTH_MARKER,
      },
    };
  }
'@

if (-not $content.Contains($old)) {
    throw "Expected block not found in $path"
}

$updated = $content.Replace($old, $new)
Set-Content -LiteralPath $path -Value $updated -NoNewline
Write-Host "Patched $path"
