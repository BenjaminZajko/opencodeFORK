$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$repo = 'https://github.com/BenjaminZajko/opencodeFORK/releases/latest/download'
$base = if ($env:OLIVECODE_RELEASE_BASE_URL) { $env:OLIVECODE_RELEASE_BASE_URL.TrimEnd('/') } else { $repo }
$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
$target = switch ($arch) {
  'AMD64' { 'Windows-x64' }
  'ARM64' { 'Windows-arm64' }
  default { throw "OliveCode has no Windows installer for $arch yet." }
}
$archive = "OliveCode-$target.zip"
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("olivecode-install-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $zip = Join-Path $temp $archive
  $checksum = "$zip.sha256"
  if ($env:OLIVECODE_ARCHIVE_PATH) {
    Copy-Item $env:OLIVECODE_ARCHIVE_PATH $zip
    if (-not $env:OLIVECODE_SHA256_PATH) { throw 'Set OLIVECODE_SHA256_PATH for a local archive.' }
    Copy-Item $env:OLIVECODE_SHA256_PATH $checksum
  } else {
    Invoke-WebRequest "$base/$archive" -OutFile $zip
    Invoke-WebRequest "$base/$archive.sha256" -OutFile $checksum
  }
  $expected = ((Get-Content $checksum -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  if ($expected -notmatch '^[a-f0-9]{64}$') { throw 'Invalid checksum file.' }
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw 'The download did not match its published checksum. Nothing was installed.' }
  $unpacked = Join-Path $temp 'unpacked'
  Expand-Archive $zip -DestinationPath $unpacked
  $source = Join-Path $unpacked 'olivecode.exe'
  if (-not (Test-Path $source)) { throw 'The archive has no OliveCode executable.' }
  $output = @(& $source --version)
  if ($LASTEXITCODE -ne 0 -or $output.Count -ne 1) { throw 'The downloaded executable did not start correctly.' }
  $version = $output[0].Trim()
  if ($version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$') { throw "Unexpected executable version: $version" }
  $root = Join-Path $env:LOCALAPPDATA 'OliveCode'
  $versionDir = Join-Path $root "versions\$version"
  $commandDir = Join-Path $root 'bin'
  New-Item -ItemType Directory -Force -Path $versionDir, $commandDir | Out-Null
  $installed = Join-Path $versionDir 'olivecode.exe'
  if (Test-Path $installed) {
    if ((Get-FileHash $installed -Algorithm SHA256).Hash -ne (Get-FileHash $source -Algorithm SHA256).Hash) { throw 'This version already exists with different contents. Stop OliveCode and use a new release version.' }
  } else { Copy-Item $source $installed }
  $command = Join-Path $commandDir 'olivecode.exe'
  $temporaryCommand = Join-Path $commandDir ('olivecode-' + [guid]::NewGuid() + '.new')
  try {
    Copy-Item $installed $temporaryCommand
    Move-Item $temporaryCommand $command -Force
  } catch { throw 'Could not update the olivecode command. Close running OliveCode processes and run the installer again.' }
  finally { Remove-Item $temporaryCommand -Force -ErrorAction SilentlyContinue }
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  $entries = @($current -split ';' | Where-Object { $_ })
  if ($entries -notcontains $commandDir) {
    [Environment]::SetEnvironmentVariable('Path', (($entries + $commandDir) -join ';'), 'User')
  }
  if (($env:Path -split ';') -notcontains $commandDir) { $env:Path += ";$commandDir" }
  Write-Host "Installed OliveCode $version. Run olivecode in any project folder."
} finally {
  Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
