# Open the awesome-dsh-plugin listing PR through the GitHub API.
#
# Why this script: this machine can reach api.github.com but not github.com:443,
# so `git push` and `gh` do not work — the REST API does.
#
# Usage (run from anywhere; the token is passed as an argument and never stored):
#   pwsh -File open-pr.ps1 -Token <github-pat>
#
# Preconditions checked by the awesome list's CI:
#   * the repo declares dsh.bundle            -> yes (package.json -> cordis.patch.yml)
#   * the repo carries the dsh-plugin topic   -> yes
#   * the repo is at least 1 day old          -> wait until the day after creation
#
param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$Owner = 'xuanbing2241',
  [string]$Repo = 'dsh-deliverables-panel',
  [string]$Upstream = 'awesome-dsh-plugin/awesome-dsh-plugin'
)

$ErrorActionPreference = 'Stop'
$headers = @{
  'User-Agent'    = 'dsh-deliverables-panel-submission'
  'Authorization' = "Bearer $Token"
  'Accept'        = 'application/vnd.github+json'
}
$entryPath = "data/plugins/$($Owner)__$($Repo).yml"
$branch    = "add-$Owner-$Repo"
$entry     = @"
url: https://github.com/$Owner/$Repo
name: $Owner/$Repo
category: ui
description:
  en: Right-Sidebar Deliverables panel that lists the files a Session delivered and hides process, temporary and tooling script files.
  zh: 右侧栏交付物面板：列出本会话交付的文件，自动隐藏过程、临时与脚本文件。
icon: https://raw.githubusercontent.com/$Owner/$Repo/main/assets/icon-180.png
"@

# 1) fork (idempotent: 422 when it already exists)
try {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$Upstream/forks" -Method Post -Headers $headers -Body '{}' -ContentType 'application/json' | Out-Null
  Write-Host "fork requested; GitHub needs a moment to create it"
} catch {
  Write-Host "fork already exists or was rejected: $($_.Exception.Message)"
}

$fork = "$Owner/$($Upstream.Split('/')[1])"
for ($i = 0; $i -lt 30; $i++) {
  try {
    $head = Invoke-RestMethod -Uri "https://api.github.com/repos/$fork/git/ref/heads/main" -Headers $headers
    break
  } catch {
    Start-Sleep -Seconds 10
  }
}
if ($null -eq $head) { throw "fork $fork was not ready after 5 minutes" }
$baseSha = $head.object.sha
Write-Host "fork base = $baseSha"

# 2) branch
try {
  Invoke-RestMethod -Uri "https://api.github.com/repos/$fork/git/refs" -Method Post -Headers $headers `
    -Body (@{ ref = "refs/heads/$branch"; sha = $baseSha } | ConvertTo-Json -Compress) -ContentType 'application/json' | Out-Null
  Write-Host "branch $branch created"
} catch {
  Write-Host "branch may already exist: $($_.Exception.Message)"
}

# 3) one entry file, one commit
$body = @{ message = "Add $Owner/$Repo"; content = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($entry)); branch = $branch } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "https://api.github.com/repos/$fork/contents/$entryPath" -Method Put -Headers $headers -Body $body -ContentType 'application/json' | Out-Null
Write-Host "committed $entryPath"

# 4) pull request
$pull = @{
  title = "Add $Owner/$Repo"
  head  = "${Owner}:$branch"
  base  = 'main'
  body  = @"
Adds ``$Owner/$Repo`` — a right-Sidebar panel that lists one Session's deliverables and filters out the working files.

- **Entry file**: ``$entryPath``
- **Category**: ``ui`` — the plugin contributes a right-Sidebar tab type and a start-page card.
- **Manifest**: ``package.json`` declares ``dsh.bundle`` (``./cordis.patch.yml``) and ``dsh.client`` (``platform: web``); the patch inserts one row, ``deliverables-panel``.
- **What it does**: reads the Session log on the Host through an authenticated ``GET /api/deliverables-panel.list`` route, folds the ``present`` declarations and the successful ``write`` / ``edit`` / ``str_replace_editor`` targets, and lists them in the right Sidebar. Process files, temporary files, lock/log/backup names and executable script types are filtered out.
- **Tested on**: DSH ``0.2.2-rc.5`` (Desktop, Windows 11). The entry declares no ``engines.dsh``, so the compatibility column stays unknown rather than claiming an untested range.
"@
} | ConvertTo-Json -Compress
$pr = Invoke-RestMethod -Uri "https://api.github.com/repos/$Upstream/pulls" -Method Post -Headers $headers -Body $pull -ContentType 'application/json'
Write-Host "PR opened: $($pr.html_url)"