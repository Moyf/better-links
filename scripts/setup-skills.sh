#!/bin/bash  
# setup-skills-npm.sh  
  
echo "Setting up skills from npm package..."  
  
# Ensure .agent/skills exists  
mkdir -p .agent/skills  
  
# Copy skills from node_modules  
if [ -d "node_modules/obsidian-dev-skills/obsidian-dev-plugins" ]; then  
    cp -r node_modules/obsidian-dev-skills/obsidian-dev-plugins .agent/skills/obsidian-dev  
    cp -r node_modules/obsidian-dev-skills/obsidian-ops .agent/skills/obsidian-ops  
    cp -r node_modules/obsidian-dev-skills/obsidian-ref .agent/skills/obsidian-ref  
    echo "✓ Skills copied successfully"  
else  
    echo "❌ obsidian-dev-skills not found in node_modules"  
    echo "Run: pnpm add -D obsidian-dev-skills"  
    exit 1  
fi