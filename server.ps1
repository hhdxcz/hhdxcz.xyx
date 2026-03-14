param(
  [int]$Port = 5173
)

$root = (Resolve-Path $PSScriptRoot).Path

$contentTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".gif"  = "image/gif"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".txt"  = "text/plain; charset=utf-8"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
  $listener.Start()
}
catch {
  Write-Host "Failed to listen on http://localhost:$Port/ (port in use or URL reservation conflict)."
  Write-Host "Try: stop the other server, or run: powershell -ExecutionPolicy Bypass -File .\\server.ps1 -Port 5173"
  Write-Host "For multiplayer: all windows must use the same URL (same host + same port)."
  exit 1
}

Write-Host "Serving $root at http://localhost:$Port/"
Write-Host "Press Ctrl+C to stop"

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $path = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
    if ([string]::IsNullOrWhiteSpace($path)) { $path = "index.html" }
    $path = $path -replace "/", "\"

    $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $path))
    if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      $context.Response.StatusCode = 403
      $context.Response.Close()
      continue
    }

    if (Test-Path $fullPath -PathType Container) {
      $fullPath = Join-Path $fullPath "index.html"
    }

    if (-not (Test-Path $fullPath -PathType Leaf)) {
      $context.Response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $context.Response.ContentType = "text/plain; charset=utf-8"
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $context.Response.Close()
      continue
    }

    $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
    $ct = $contentTypes[$ext]
    if (-not $ct) { $ct = "application/octet-stream" }

    $data = [System.IO.File]::ReadAllBytes($fullPath)
    $context.Response.StatusCode = 200
    $context.Response.ContentType = $ct
    $context.Response.ContentLength64 = $data.Length
    $context.Response.OutputStream.Write($data, 0, $data.Length)
    $context.Response.Close()
  }
}
finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
