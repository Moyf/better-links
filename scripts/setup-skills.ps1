# setup-skills-npm.ps1  
  
$ErrorActionPreference = "Stop"  
  
Write-Host "Setting up skills from npm package..." -ForegroundColor Cyan  
  
# Check if obsidian-dev-skills is installed  
$sourcePath = "node_modules/obsidian-dev-skills"  
if (-not (Test-Path $sourcePath)) {  
    Write-Host "❌ obsidian-dev-skills not found in node_modules" -ForegroundColor Red  
    Write-Host "Run: pnpm add -D obsidian-dev-skills" -ForegroundColor Yellow  
    exit 1  
}  
  
# Ensure .agent/skills exists  
$skillsDir = ".agent/skills"  
if (-not (Test-Path $skillsDir)) {  
    New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null  
}  
  
# Copy skills with error handling  
try {  
    Write-Host "Copying obsidian-dev..." -ForegroundColor Gray  
    Copy-Item "$sourcePath/obsidian-dev-plugins" "$skillsDir/obsidian-dev" -Recurse -Force  
      
    Write-Host "Copying obsidian-ops..." -ForegroundColor Gray  
    Copy-Item "$sourcePath/obsidian-ops" "$skillsDir/obsidian-ops" -Recurse -Force  
      
    Write-Host "Copying obsidian-ref..." -ForegroundColor Gray  
    Copy-Item "$sourcePath/obsidian-ref" "$skillsDir/obsidian-ref" -Recurse -Force  
      
    Write-Host "✓ Skills copied successfully" -ForegroundColor Green  
} catch {  
    Write-Host "❌ Failed to copy skills: $($_.Exception.Message)" -ForegroundColor Red  
    exit 1  
}