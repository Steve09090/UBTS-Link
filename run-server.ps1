param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($PSScriptRoot)
$url = "http://127.0.0.1:$Port/"

$probe = New-Object Net.Sockets.TcpClient
try {
    $probe.Connect('127.0.0.1', $Port)
    $portInUse = $true
}
catch [Net.Sockets.SocketException] {
    $portInUse = $false
}
finally {
    $probe.Dispose()
}

if ($portInUse) {
    try {
        $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
    }
    catch {
        throw "Port $Port is already in use, but UBTS-Link did not respond at $url. Close the other service or change the port in run-server.ps1."
    }

    if ($page.Content -notmatch '<title>UBTS-Link') {
        throw "Port $Port is already in use by another app. Close it or change the port in run-server.ps1."
    }

    Write-Host "UBTS-Link is already running at $url"
    Start-Process $url
    exit 0
}

$listener = New-Object Net.HttpListener
$listener.Prefixes.Add($url)
try {
    $listener.Start()
}
catch {
    $listener.Close()
    throw "Could not start the local server at $url. $_"
}

$rootPrefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$contentTypes = @{
    '.css' = 'text/css; charset=utf-8'
    '.html' = 'text/html; charset=utf-8'
    '.ico' = 'image/x-icon'
    '.jpeg' = 'image/jpeg'
    '.jpg' = 'image/jpeg'
    '.js' = 'text/javascript; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.png' = 'image/png'
    '.svg' = 'image/svg+xml'
    '.webp' = 'image/webp'
}

Write-Host "UBTS-Link is running at $url. Keep this window open; press Ctrl+C to stop."
Start-Process $url

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = 'index.html'
            }

            $file = [IO.Path]::GetFullPath((Join-Path $root $relativePath))
            if (-not $file.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
                -not (Test-Path -LiteralPath $file -PathType Leaf)) {
                $context.Response.StatusCode = 404
                $bytes = [Text.Encoding]::UTF8.GetBytes('Not Found')
                $context.Response.ContentType = 'text/plain; charset=utf-8'
            }
            else {
                $extension = [IO.Path]::GetExtension($file).ToLowerInvariant()
                if ($contentTypes.ContainsKey($extension)) {
                    $context.Response.ContentType = $contentTypes[$extension]
                }
                else {
                    $context.Response.ContentType = 'application/octet-stream'
                }
                $bytes = [IO.File]::ReadAllBytes($file)
            }

            $context.Response.ContentLength64 = $bytes.Length
            if ($context.Request.HttpMethod -ne 'HEAD') {
                $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        }
        catch {
            Write-Warning "Could not serve request $($context.Request.Url): $_"
            $context.Response.StatusCode = 500
        }
        finally {
            $context.Response.Close()
        }
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
