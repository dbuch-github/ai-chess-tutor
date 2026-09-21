param([switch]$RuntimeOnly)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-Location $PSScriptRoot
if ($RuntimeOnly) {
    $runtime = Get-Content (Join-Path $PSScriptRoot 'scripts/windows-runtime.json') -Raw | ConvertFrom-Json
    $minimum = [version]$runtime.version
    function Test-CppRuntime {
        foreach ($view in @([Microsoft.Win32.RegistryView]::Registry32, [Microsoft.Win32.RegistryView]::Registry64)) {
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, $view)
            $key = $null
            try {
                $key = $base.OpenSubKey('SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64')
                if ($key -and $key.GetValue('Installed') -eq 1) {
                    $versionText = [string]$key.GetValue('Version')
                    $installed = [version]($versionText.TrimStart('v'))
                    if ($installed -ge $minimum) { return $true }
                }
            } finally {
                if ($key) { $key.Dispose() }
                $base.Dispose()
            }
        }
        return $false
    }
    if (Test-CppRuntime) { exit 0 }
    $work = Join-Path ([IO.Path]::GetTempPath()) ('chess-runtime-' + [guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        $installer = Join-Path $work 'vc_redist.x64.exe'
        Write-Host 'Installing Microsoft Visual C++ Runtime required by Maia/lc0...'
        Invoke-WebRequest -UseBasicParsing -Uri $runtime.url -OutFile $installer
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash -ne $runtime.sha256) {
            throw 'Microsoft runtime download failed SHA-256 verification.'
        }
        $result = Start-Process -FilePath $installer -ArgumentList '/install', '/passive', '/norestart' -Verb RunAs -Wait -PassThru
        if ($result.ExitCode -eq 3010) {
            Write-Host 'Microsoft runtime installed. A Windows restart is required.'
            exit 3010
        }
        if (($result.ExitCode -notin @(0, 1638)) -or -not (Test-CppRuntime)) {
            throw "Microsoft runtime installation failed (exit $($result.ExitCode))."
        }
    } finally { Remove-Item -LiteralPath $work -Recurse -Force }
    exit 0
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Install Node.js 22.12+ from https://nodejs.org and reopen PowerShell.'
}
& node scripts/setup.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
