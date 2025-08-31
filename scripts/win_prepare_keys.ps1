#Requires -Version 5.1
<#
.SYNOPSIS
    Prepare SiliconFlow API keys for the local key rotator
.DESCRIPTION
    This script automatically extracts and prepares SiliconFlow API keys from various sources
    and generates a cleaned keys.txt file.
.PARAMETER Source
    Optional path to source file containing keys (txt, csv, json)
.EXAMPLE
    .\win_prepare_keys.ps1
    .\win_prepare_keys.ps1 -Source "C:\path\to\my_keys.txt"
#>

param(
    [string]$Source
)

# Helper function to mask keys for logging
function Mask-Key($key) {
    if (-not $key -or $key.Length -le 8) { return "***" }
    return $key.Substring(0, 4) + "..." + $key.Substring($key.Length - 4)
}

# Helper function to extract keys from text
function Get-KeysFromText($content) {
    $pattern = 'sk-[A-Za-z0-9_-]{12,}'
    $matches = [regex]::Matches($content, $pattern)
    return $matches | ForEach-Object { $_.Value }
}

# Helper function to extract keys from JSON
function Get-KeysFromJson($jsonContent) {
    $keys = @()
    try {
        $data = $jsonContent | ConvertFrom-Json
        
        # Handle array
        if ($data -is [array]) {
            foreach ($item in $data) {
                if ($item -is [string] -and $item -match '^sk-') {
                    $keys += $item
                }
            }
        }
        
        # Handle object that might have key properties
        if ($data -is [pscustomobject]) {
            # Try to find key-like properties
            $data | Get-Member -MemberType NoteProperty | ForEach-Object {
                $value = $data.($_.Name)
                if ($value -is [string] -and $value -match '^sk-') {
                    $keys += $value
                }
                if ($value -is [array]) {
                    $keys += $value | Where-Object { $_ -is [string] -and $_ -match '^sk-' }
                }
            }
        }
    }
    catch {
        Write-Warning "Failed to parse JSON: $($_.Exception.Message)"
    }
    return $keys
}

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host " SiliconFlow Keys Preparation Tool" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan

# Set project directory
$projectDir = Split-Path -Parent $PSScriptRoot
$keysFile = Join-Path $projectDir "keys.txt"

# Step 1: Determine source files
$sources = @()

if ($Source) {
    # Use provided source
    if (Test-Path $Source) {
        $sources += $Source
        Write-Host "Using provided source: $Source" -ForegroundColor Yellow
    } else {
        Write-Error "Provided source file not found: $Source"
        exit 1
    }
} else {
    # Auto-detect common key file names and extensions
    $potentialFiles = @(
        "keys.txt",
        "keys.csv",
        "keys.json",
        "my_keys.txt",
        "siliconflow_keys.txt",
        "api_keys.txt"
    )
    
    # Check in project directory and subdirectories
    foreach ($file in $potentialFiles) {
        $path = Join-Path $projectDir $file
        if (Test-Path $path) {
            $sources += $path
            Write-Host "Found potential key file: $file" -ForegroundColor Green
        }
    }
    
    # If no obvious files found, search for any files with keys
    if ($sources.Count -eq 0) {
        Write-Host "Scanning project directory for files with SiliconFlow keys..." -ForegroundColor Yellow
        $txtFiles = Get-ChildItem -Path $projectDir -Filter "*.txt" -Recurse -ErrorAction SilentlyContinue
        $csvFiles = Get-ChildItem -Path $projectDir -Filter "*.csv" -Recurse -ErrorAction SilentlyContinue
        $jsonFiles = Get-ChildItem -Path $projectDir -Filter "*.json" -Recurse -ErrorAction SilentlyContinue
        
        $allFiles = $txtFiles + $csvFiles + $jsonFiles
        
        foreach ($file in $allFiles) {
            try {
                $content = Get-Content $file.FullName -Raw
                if ($content -match 'sk-[A-Za-z0-9_-]{12,}') {
                    $sources += $file.FullName
                    Write-Host "Found keys in: $($file.Name)" -ForegroundColor Green
                }
            }
            catch {
                Write-Verbose "Skipping unreadable file: $($file.FullName)"
            }
        }
    }
}

# Step 2: Extract keys from sources
$allKeys = @()

foreach ($sourceFile in $sources) {
    Write-Host "Processing: $sourceFile" -ForegroundColor Cyan
    
    try {
        $content = Get-Content $sourceFile -Raw
        $extension = [System.IO.Path]::GetExtension($sourceFile).ToLower()
        
        switch ($extension) {
            ".json" {
                $foundKeys = Get-KeysFromJson $content
                $allKeys += $foundKeys
                Write-Host "  Found $($foundKeys.Count) keys from JSON" -ForegroundColor Green
            }
            default {
                $foundKeys = Get-KeysFromText $content
                $allKeys += $foundKeys
                Write-Host "  Found $($foundKeys.Count) keys from text" -ForegroundColor Green
            }
        }
    }
    catch {
        Write-Warning "Error processing file $sourceFile : $($_.Exception.Message)"
    }
}

# Step 3: Clean and deduplicate keys
$cleanedKeys = $allKeys | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^sk-[A-Za-z0-9_-]+$' }
$uniqueKeys = $cleanedKeys | Sort-Object -Unique

# Step 4: Save cleaned keys
if ($uniqueKeys.Count -gt 0) {
    $outputContent = $uniqueKeys -join "`r\n"
    $outputContent | Out-File -FilePath $keysFile -Encoding UTF8
    
    Write-Host "`n" "=" * 50 -ForegroundColor Green
    Write-Host " Successfully prepared keys! " -ForegroundColor Green
    Write-Host "=" * 50 -ForegroundColor Green
    Write-Host "Total keys found: $($allKeys.Count)" -ForegroundColor Yellow
    Write-Host "Unique keys: $($uniqueKeys.Count)" -ForegroundColor Yellow
    Write-Host "Saved to: $keysFile" -ForegroundColor Green
    Write-Host "`nMasked keys:" -ForegroundColor Cyan
    
    foreach ($key in $uniqueKeys) {
        $masked = Mask-Key $key
        Write-Host "  $masked" -ForegroundColor Gray
    }
    Write-Host "=" * 50 -ForegroundColor Green
} else {
    Write-Host "`n" "=" * 50 -ForegroundColor Red
    Write-Host " No SiliconFlow API keys found! " -ForegroundColor Red
    Write-Host "=" * 50 -ForegroundColor Red
    Write-Host "Please provide your keys in one of these formats:" -ForegroundColor Yellow
    Write-Host "  1. Create 'keys.txt' with one key per line" -ForegroundColor White
    Write-Host "  2. Use 'SILICONFLOW_KEYS' environment variable" -ForegroundColor White
    Write-Host "  3. Provide valid key files with extension .txt, .csv, or .json" -ForegroundColor White
    Write-Host "  4. Keys should start with 'sk-...'" -ForegroundColor White
    Write-Host "=" * 50 -ForegroundColor Red
    exit 1
}