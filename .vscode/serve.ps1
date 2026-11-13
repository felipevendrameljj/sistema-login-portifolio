$ErrorActionPreference = 'Stop'

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:8080/')

Write-Output 'Starting Controle de Gastos at http://localhost:8080/'

try {
  $listener.Start()
  Write-Output 'Server ready at http://localhost:8080/'

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
    if ([string]::IsNullOrWhiteSpace($relativePath)) {
      $relativePath = 'index.html'
    }

    $filePath = [IO.Path]::GetFullPath((Join-Path $root $relativePath))
    $rootPrefix = $root + [IO.Path]::DirectorySeparatorChar

    try {
      if (-not $filePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
        $context.Response.StatusCode = 403
      } elseif (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $context.Response.StatusCode = 404
      } else {
        $extension = [IO.Path]::GetExtension($filePath).ToLowerInvariant()
        $contentTypes = @{
          '.css' = 'text/css; charset=utf-8'
          '.html' = 'text/html; charset=utf-8'
          '.js' = 'text/javascript; charset=utf-8'
          '.json' = 'application/json; charset=utf-8'
          '.svg' = 'image/svg+xml'
        }
        if ($contentTypes.ContainsKey($extension)) {
          $context.Response.ContentType = $contentTypes[$extension]
        } else {
          $context.Response.ContentType = 'application/octet-stream'
        }

        $bytes = [IO.File]::ReadAllBytes($filePath)
        $context.Response.ContentLength64 = $bytes.Length
        $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } finally {
      $context.Response.Close()
    }
  }
} catch {
  Write-Error "Local server failed: $($_.Exception.Message)"
  exit 1
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}
