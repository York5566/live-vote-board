param([string]$ArchiveName = 'LiveVoteBoard-1.0.0.zip')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ([IO.Path]::GetFileName($ArchiveName) -ne $ArchiveName) { throw 'Pass an archive filename without a path.' }
$archivePath = Join-Path $projectRoot "delivery\$ArchiveName"
$expectedZipHash = ((Get-Content -LiteralPath "$archivePath.sha256" -Raw).Trim() -split '\s+')[0]
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedZipHash) { throw 'ZIP hash mismatch.' }
# A fresh, unique extraction folder: no existing files are deleted or overwritten.
$extractPath = [IO.Path]::GetFullPath((Join-Path $projectRoot ("artifacts\zip-acceptance-" + [Guid]::NewGuid().ToString('N'))))
$allowedParent = [IO.Path]::GetFullPath((Join-Path $projectRoot 'artifacts')) + [IO.Path]::DirectorySeparatorChar
if (-not $extractPath.StartsWith($allowedParent, [StringComparison]::OrdinalIgnoreCase)) { throw 'Extraction path outside artifacts.' }
Expand-Archive -LiteralPath $archivePath -DestinationPath $extractPath
$checkout = Join-Path $extractPath 'LiveVoteBoard'
$manifest = Get-Content -LiteralPath (Join-Path $checkout 'manifest.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
    $path = [IO.Path]::GetFullPath((Join-Path $checkout $entry.path))
    if (-not $path.StartsWith($checkout + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Manifest path outside checkout.' }
    if ((Get-Item -LiteralPath $path).Length -ne $entry.bytes) { throw "Size mismatch: $($entry.path)" }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "Hash mismatch: $($entry.path)" }
}
$fileCount = @(Get-ChildItem -LiteralPath $checkout -File -Recurse -Force).Count
if ($fileCount -ne $manifest.files.Count + 1) { throw 'Unexpected extracted file count.' }
$workingBefore = Get-Location
try {
    Set-Location -LiteralPath $checkout
    & node scripts/build.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Extracted-source build failed.' }
    & node scripts/check.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Extracted static checks failed.' }
} finally { Set-Location -LiteralPath $workingBefore.Path }
$report = [ordered]@{
    status = 'PASS'
    archive = $archivePath
    extracted = $checkout
    files = $fileCount
    hashedFiles = $manifest.files.Count
    zipSha256 = $expectedZipHash
    rebuiltStaticSite = $true
    scope = 'Fresh extraction, exact file hashes, dependency-free build and static links. Does not repeat cloud or browser tests.'
}
$report | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot 'artifacts\archive-report.json') -Encoding utf8
$report | ConvertTo-Json
