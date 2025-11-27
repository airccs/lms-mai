# Moodle Quiz Solver - GitHub Deploy Script

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Moodle Quiz Solver - GitHub Deploy" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check Git
Write-Host "Checking Git..." -ForegroundColor Yellow
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Git is not installed!" -ForegroundColor Red
    Write-Host "Install Git: https://git-scm.com/download/win" -ForegroundColor Yellow
    exit 1
}
Write-Host "Git is installed" -ForegroundColor Green
Write-Host ""

# Check repository
Write-Host "Checking repository..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
    Write-Host "Initializing Git repository..." -ForegroundColor Yellow
    git init
    git add .
    git commit -m "Initial commit: Moodle Quiz Solver with server sync"
    Write-Host "Repository initialized" -ForegroundColor Green
} else {
    Write-Host "Repository already initialized" -ForegroundColor Green
}
Write-Host ""

# Get GitHub info
Write-Host "Enter GitHub information:" -ForegroundColor Cyan
$username = Read-Host "GitHub username"
$repoName = Read-Host "Repository name (default: moodle-quiz-solver)"
if ([string]::IsNullOrWhiteSpace($repoName)) {
    $repoName = "moodle-quiz-solver"
}

Write-Host ""
Write-Host "IMPORTANT: Create repository on GitHub first!" -ForegroundColor Yellow
Write-Host "1. Go to https://github.com/new" -ForegroundColor White
Write-Host "2. Repository name: $repoName" -ForegroundColor White
Write-Host "3. DO NOT check 'Initialize with README'" -ForegroundColor White
Write-Host "4. Click 'Create repository'" -ForegroundColor White
Write-Host ""
$continue = Read-Host "Have you created the repository? (y/n)"

if ($continue -ne "y" -and $continue -ne "Y") {
    Write-Host "Cancelled by user" -ForegroundColor Yellow
    exit 0
}

# Connect to GitHub
Write-Host ""
Write-Host "Connecting to GitHub..." -ForegroundColor Yellow
$remoteUrl = "https://github.com/$username/$repoName.git"

# Remove existing remote if exists
$existingRemote = git remote get-url origin 2>$null
if ($existingRemote) {
    Write-Host "Removing existing remote..." -ForegroundColor Yellow
    git remote remove origin
}

git remote add origin $remoteUrl
git branch -M main

Write-Host "Remote added: $remoteUrl" -ForegroundColor Green
Write-Host ""

# Push to GitHub
Write-Host "Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "NOTE: Use Personal Access Token as password!" -ForegroundColor Yellow
Write-Host "Create token: https://github.com/settings/tokens" -ForegroundColor Yellow
Write-Host ""

git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Code uploaded to GitHub!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Repository: https://github.com/$username/$repoName" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Deploy on Railway: https://railway.app/" -ForegroundColor White
    Write-Host "2. Or setup Cloudflare Tunnel" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "ERROR during push!" -ForegroundColor Red
    Write-Host "Try manually: git push -u origin main" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to exit"
