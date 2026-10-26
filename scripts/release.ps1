param()
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$env:npm_config_cache = Join-Path $root '.work\npm-cache'
$pkg = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding utf8 | ConvertFrom-Json
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Path $dist -Force | Out-Null
$tar = Join-Path $dist ("dsh-assist-" + $pkg.version + ".tgz")
$zip = Join-Path $dist ("dsh-assist-" + $pkg.version + "-source.zip")
foreach ($path in @($tar,$zip,(Join-Path $dist ("dsh-assist-" + $pkg.version + "-manifest.json")))) {
  if (Test-Path -LiteralPath $path) { throw "Refusing to overwrite existing artifact: $path" }
}
$node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
$npmCli = $env:npm_execpath
if (-not $npmCli) { $npmCli = Join-Path (Split-Path -Parent $node) 'node_modules/npm/bin/npm-cli.js' }
if (-not (Test-Path -LiteralPath $npmCli -PathType Leaf)) { throw 'Cannot locate npm CLI. Run this script through npm run release.' }
& $node $npmCli test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
& $node $npmCli run check
if ($LASTEXITCODE -ne 0) { throw 'Checks failed' }
& $node $npmCli pack --ignore-scripts --offline --pack-destination $dist
if ($LASTEXITCODE -ne 0) { throw 'npm pack failed' }
$stage = Join-Path $root ('.work\release-' + [guid]::NewGuid().ToString('N'))
$project = Join-Path $stage 'dsh-assist'
New-Item -ItemType Directory -Path $project -Force | Out-Null
$names = @('src','packs','schemas','examples','docs','test','scripts','package.json','cordis.patch.yml','README.md','SKILL.md','LICENSE','NOTICE','CHANGELOG.md','.gitignore','.gitattributes')
foreach ($name in $names) {
  $source = Join-Path $root $name
  if (-not (Test-Path -LiteralPath $source)) { throw "Missing release input: $name" }
  Copy-Item -LiteralPath $source -Destination $project -Recurse
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$zip)
$files = foreach ($path in @($tar,$zip)) {
  [ordered]@{file=[IO.Path]::GetFileName($path); bytes=(Get-Item -LiteralPath $path).Length; sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
}
$manifest = [ordered]@{name=$pkg.name;version=$pkg.version;targetHost='0.2.1-rc.3';desktopLiveVerified=$false;files=@($files)}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $dist ("dsh-assist-" + $pkg.version + "-manifest.json")) -Encoding utf8
Write-Output 'Local artifacts ready. No remote repository or registry was modified.'
