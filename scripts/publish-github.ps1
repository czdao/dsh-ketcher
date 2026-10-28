# Publish dsh-ketcher to a new GitHub repository.
#
# Run this AFTER installing Git for Windows (https://git-scm.com/download/win)
# and opening a NEW PowerShell window so `git` is on PATH.
#
#   cd D:\化学agent\dsh-ketcher
#   powershell -ExecutionPolicy Bypass -File .\scripts\publish-github.ps1 -User yourname -Email you@example.com
#
# It will:
#   1. initialize a git repository in this folder (if not already one),
#   2. stage everything except build artifacts (see .gitignore),
#   3. make the first commit,
#   4. create the repo on GitHub. If you have the GitHub CLI (`gh`) logged in it
#      uses `gh repo create`; otherwise it adds a remote you can push to after
#      creating the empty repo on github.com.
#   5. push `main`.
#
# A repository named `dsh-ketcher` is created/used. Public by default.

param(
  [Parameter(Mandatory = $true)] [string] $User,
  [Parameter(Mandatory = $true)] [string] $Email,
  [string] $RepoName = 'dsh-ketcher',
  [ValidateSet('public', 'private')] [string] $Visibility = 'public',
  [string] $AuthorName = $User
)

$ErrorActionPreference = 'Stop'
function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not (Have git)) {
  Write-Error "git not found on PATH. Install Git for Windows, then open a NEW PowerShell window and re-run."
}
$repoDir = Split-Path -Parent $PSScriptRoot
Set-Location $repoDir

Write-Host "==> Repo directory: $repoDir"

# 1. git init
if (-not (Test-Path (Join-Path $repoDir '.git'))) {
  git init -b main | Out-Host
} else {
  Write-Host "==> Existing git repository detected."
}

# 2. Author identity (repo-local so it does not disturb global config)
git config user.name  $AuthorName | Out-Host
git config user.email $Email | Out-Host

# 3. Stage and commit
git add -A | Out-Host
$hasHead = (git rev-parse --verify HEAD 2>$null); $hasChanges = (git status --porcelain)
if ($hasChanges) {
  git commit -m "feat: dsh-ketcher — Ketcher chemistry editor plugin for DeepSeek Harness" | Out-Host
} elseif ($hasHead) {
  Write-Host "==> Nothing new to commit."
} else {
  git commit --allow-empty -m "chore: initial commit" | Out-Host
}

# 4. Create the GitHub repo + remote
$remoteUrl = "https://github.com/$User/$RepoName.git"
$hasGh = Have gh
if ($hasGh) {
  $ghAuth = gh auth status 2>&1; $ghOk = ($LASTEXITCODE -eq 0)
  if ($ghOk) {
    Write-Host "==> Creating repository with gh (if it already exists this is skipped)."
    gh repo create "$User/$RepoName" "--$Visibility" --source . --remote origin --push 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { Write-Host "==> Done: https://github.com/$User/$RepoName"; exit 0 }
    Write-Host "==> gh repo create did not push; falling back to manual remote + push."
  }
}

if (-not (git remote get-url origin 2>$null)) {
  git remote add origin $remoteUrl | Out-Host
} else {
  git remote set-url origin $remoteUrl | Out-Host
}
Write-Host ""
Write-Host "==> If the repository does not exist yet, create it empty first:"
Write-Host "      https://github.com/new?name=$RepoName&visibility=$Visibility"
Write-Host "    (Do NOT initialize it with a README/.gitignore — this repo already has them.)"
Write-Host ""
Write-Host "==> Pushing to $remoteUrl ... (the credential manager will prompt you for a token if needed)"
git push -u origin main | Out-Host
if ($LASTEXITCODE -eq 0) {
  Write-Host "==> Done: https://github.com/$User/$RepoName"
} else {
  Write-Host "==> Push failed. Confirm the empty repo exists at https://github.com/new and that you are authenticated, then run: git push -u origin main"
}
