$ErrorActionPreference = "Stop"

$path = "src/agents/models-config.providers.ts"

if (-not (Test-Path -LiteralPath $path)) {
    throw "File not found: $path"
}

$content = Get-Content -Raw -LiteralPath $path

if ([string]::IsNullOrWhiteSpace($content)) {
    throw "File is empty or unreadable: $path"
}

$pattern = [regex]::Escape(@'
  const ollamaBaseUrl = explicitOllama?.baseUrl;
  const hasExplicitOllamaConfig = Boolean(explicitOllama);
  const ollamaProvider = await buildOllamaProvider(ollamaBaseUrl, {
    quiet: !ollamaKey && !hasExplicitOllamaConfig,
  });
  if (ollamaProvider.models.length === 0 && !ollamaKey && !explicitOllama?.apiKey) {
    return undefined;
  }
  return {
    ollama: {
      ...ollamaProvider,
      apiKey: ollamaKey ?? explicitOllama?.apiKey ?? OLLAMA_LOCAL_AUTH_MARKER,
    },
  };
}
'@)

$replacement = @'
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

  if (ollamaProvider.models.length === 0 && !ollamaKey && !explicitOllama?.apiKey) {
    return undefined;
  }

  return {
    ollama: {
      ...ollamaProvider,
      apiKey: ollamaKey ?? explicitOllama?.apiKey ?? OLLAMA_LOCAL_AUTH_MARKER,
    },
  };
}
'@

$updated = [regex]::Replace($content, $pattern, $replacement, 1)

if ($updated -eq $content) {
    throw "Expected Ollama block not found in $path"
}

Set-Content -LiteralPath $path -Value $updated -NoNewline
Write-Host "Patched $path"
