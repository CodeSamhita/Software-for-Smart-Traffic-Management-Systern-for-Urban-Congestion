param(
    [ValidateSet("camera", "video", "image")]
    [string]$SourceType = "camera",
    [string]$SourceValue = "0",
    [int]$Port = 8501,
    [switch]$Debug,
    [switch]$InstallSystemTools,
    [switch]$DisableOpenAI,
    [switch]$DisableOllama
)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

function Resolve-PythonCommand {
    try {
        $python = Get-Command python -ErrorAction Stop
        return @($python.Source)
    }
    catch {
    }

    try {
        $py = Get-Command py -ErrorAction Stop
        $probe = & $py.Source -3 -c "import sys; print(sys.executable)" 2>$null
        if ($LASTEXITCODE -eq 0 -and $probe) {
            return @($py.Source, "-3")
        }
    }
    catch {
    }

    try {
        $candidate = Get-ChildItem "$env:LOCALAPPDATA\Programs\Python" -Recurse -Filter python.exe -ErrorAction Stop |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($candidate) {
            return @($candidate.FullName)
        }
    }
    catch {
    }

    return $null
}

function Install-PythonIfNeeded {
    $pythonCommand = Resolve-PythonCommand
    if ($pythonCommand) {
        return $pythonCommand
    }

    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $winget) {
        throw "Python is not installed and winget is unavailable. Install Python 3.11+ or rerun this script on a machine with winget."
    }

    Write-Host "Python was not found. Installing Python 3.11 via winget..."
    winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "Python installation failed."
    }

    Start-Sleep -Seconds 5
    $pythonCommand = Resolve-PythonCommand
    if (-not $pythonCommand) {
        throw "Python seems installed, but the launcher could not locate python.exe."
    }

    return $pythonCommand
}

function Install-FFmpegIfRequested {
    if (-not $InstallSystemTools) {
        return
    }
    if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
        return
    }
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Warning "FFmpeg is missing and winget is unavailable. Skipping FFmpeg installation."
        return
    }

    Write-Host "Installing FFmpeg via winget..."
    winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
}

try {
    $pythonCommand = Install-PythonIfNeeded
    Install-FFmpegIfRequested

    $pythonExe = $pythonCommand[0]
    $pythonArgs = @()
    if ($pythonCommand.Length -gt 1) {
        $pythonArgs = $pythonCommand[1..($pythonCommand.Length - 1)]
    }

    $appArgs = @(
        (Join-Path $ProjectRoot "run_traffic_ai.py"),
        "--source-type", $SourceType,
        "--source-value", $SourceValue,
        "--port", $Port.ToString()
    )

    if ($Debug) {
        $appArgs += "--debug"
    }
    if ($InstallSystemTools) {
        $appArgs += "--install-system-tools"
    }
    if ($DisableOpenAI) {
        $appArgs += "--disable-openai"
    }
    if ($DisableOllama) {
        $appArgs += "--disable-ollama"
    }

    & $pythonExe @pythonArgs @appArgs
    exit $LASTEXITCODE
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
