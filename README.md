# Obsidian Sample Plugin Plus

This is a sample plugin for [Obsidian](https://obsidian.md) with AI-assisted development tools and best practices.

This project uses TypeScript to provide type checking and documentation. The repo depends on the latest plugin API (obsidian.d.ts) in TypeScript Definition format, which contains TSDoc comments describing what it does.

This sample plugin demonstrates some of the basic functionality the plugin API can do:
- Adds a ribbon icon, which shows a Notice when clicked.
- Adds a command "Open modal (simple)" which opens a Modal.
- Adds a plugin setting tab to the settings page.

## What Makes This Plus Version Different?

This template includes additional tools and documentation to improve your development experience:

### AI-Assisted Development System  
  
This template uses the OpenSkills system with skills available via npm package.  
  
**Setup:**  
```bash  
# 1. Install dependencies (includes obsidian-dev-skills)
pnpm install

# 2. Initialize localized skill set (.agent/skills/)
pnpm obsidian-dev-skills

# 3. Set up reference materials (symlinks to core Obsidian repos)
.\scripts\setup-ref-links.bat  # Windows  
# or  [header-9](#header-9)
bash scripts/setup-ref-links.sh  # macOS/Linux
```

**What's included:**
- **`AGENTS.md`** - OpenSkills entry point for AI agent guidance
- **`.agent/skills/` folder** - Symlinks to centralized skills repository
- **Plugin development skills** - TypeScript, API patterns, lifecycle management
- **Operations skills** - Build, release, and maintenance workflows
- **Technical references** - API docs, manifest rules, file formats
- **Project-specific skills** - Your custom patterns and conventions

**Benefits:**
- Single source of truth for development knowledge
- Automatic updates when skills are improved
- Consistent guidance across all your projects
- Specialized knowledge for plugin vs theme development
- Helps AI assistants understand your project structure and coding conventions
- Provides quick reference guides and common task examples

### Reference Materials System (`.ref` folder)

- **Symlinks to Obsidian repositories** - Easy access to API docs, sample code, and examples
- **Centralized storage** - All projects share the same reference repos (no duplication)
- **6 core Obsidian projects** - API definitions, documentation, sample plugins, ESLint rules
- **Project-specific references** - Add your own plugin/theme references as needed

### ESLint 9 with Obsidian Rules

- **Exact parity with Review Bot** - Uses the same `obsidianmd.configs.recommended` configuration
- **Automatic migration** - Upgrades from ESLint 8 to ESLint 9 automatically
- **Smart detection** - Handles `main.ts` in root or `src/` folder automatically
- **Catches common issues** - Command naming, style manipulation, deprecated APIs, and more

**See also:** [obsidian-sample-theme-plus](https://github.com/davidvkimball/obsidian-sample-theme-plus) - The companion theme template with similar enhancements.

## Recommended Tools and Plugins for Plugin Development

These tools can significantly improve your plugin development workflow:

### Hot Reload Plugins

**[Hot Reload](https://github.com/pjeby/hot-reload)** - Automatically reload your plugin when code changes. Dramatically speeds up development by eliminating manual reloads.

**[Hot Reload Mobile](https://github.com/shabegom/obsidian-hot-reload-mobile)** - Mobile-compatible version of Hot Reload for testing on mobile devices.

## Improve Code Quality with ESLint

[ESLint](https://eslint.org/) is a tool that analyzes your code to quickly find problems. You can run ESLint against your plugin to find common bugs and ways to improve your code.

- This project already has ESLint preconfigured, you can invoke a check by running `pnpm lint`
- Together with a custom ESLint [plugin](https://github.com/obsidianmd/eslint-plugin-obsidian) for Obsidian specific code guidelines

## Quick Start

### For New Plugins (Using This as a Template)

1. **Use this template** - Click "Use this template" on GitHub or clone this repo
2. **Install dependencies**: `pnpm install`
3. **Initialize skills**: `pnpm obsidian-dev-skills`
4. **Optional: Setup reference materials** (recommended):
   - **Windows**: `scripts\setup-ref-links.bat`
   - **macOS/Linux**: `./scripts/setup-ref-links.sh`
4. **Optional: Setup ESLint** (recommended):
   ```bash
   node scripts/setup-eslint.mjs
   pnpm install
   pnpm lint
   ```
5. **Start developing**: `pnpm dev`

### For Existing Plugins (Upgrading to This System)

You can add these enhancements to your existing plugin:

1. **Copy these folders/files to your plugin**:
   - `AGENTS.md` → Your plugin root
   - `.agents/` folder → Your plugin root
   - `scripts/` folder → Your plugin root

2. **Initialize skills**: 
   - Run `pnpm obsidian-dev-skills` to seed the `.agent/skills/` folder and automatically generate `AGENTS.md`.

3. **Setup reference materials**:
   - **Windows**: `scripts\setup-ref-links.bat`
   - **macOS/Linux**: `./scripts/setup-ref-links.sh`
   - This creates symlinks to Obsidian reference repos in `.ref/` folder

3. **Setup ESLint** (recommended):
   ```bash
   node scripts/setup-eslint.mjs
   pnpm install
   pnpm lint
   ```
   
   **What the setup script does automatically:**
   - Updates `package.json` with ESLint 9 dependencies and lint scripts
   - Creates/updates `eslint.config.mjs` (ESLint 9 flat config)
   - Updates `esbuild.config.mjs` (fixes builtinModules import, adds entry point detection, ensures output to root)
   - Creates `scripts/lint-wrapper.mjs` (adds helpful success messages)
   - Removes legacy `.eslintrc` files if present
   
   **Note:** The script will update your existing `esbuild.config.mjs` and `eslint.config.mjs` files, but it preserves your custom configuration where possible. Review the changes after running the script.
   
   **Important:** Don't copy `package.json` from this template - it contains template-specific values. The setup script will update your existing `package.json` with only the necessary ESLint dependencies and scripts.

## First Time Developing Plugins?

- Check if [someone already developed a plugin for what you want](https://obsidian.md/plugins)!
- Make a copy of this repo as a template with the "Use this template" button
- Clone your repo to a local development folder
- Install NodeJS (v16+), then run `pnpm install`
- Run `pnpm dev` to compile your plugin (builds to `main.js` in root)
- For releases, run `pnpm build` which creates `main.js` in root
- Reload Obsidian to load the new version of your plugin
- Enable plugin in settings window

## How to Use

### Basic Development

- Clone this repo
- Make sure your NodeJS is at least v16 (`node --version`)
- `pnpm install` to install dependencies (or `npm install` - it will automatically proxy to pnpm)
- **Development**: `pnpm dev` - Builds to `main.js` in root with watch mode
- **Production**: `pnpm build` - Builds to `main.js` in root (one-time build)

**Note**: This project uses pnpm, but `npm install`, `npm run build`, `npm run dev`, and `npm run lint` will also work for backwards compatibility. The `npm install` command automatically proxies to `pnpm install` via a preinstall hook.

### Using the AI System

- **Bootstrapping with AI**: Before providing instructions to your AI agent, visit the `prompts/` folder. Copy the `starter-prompt.md`, fill in your project details, and provide it to your agent to perfectly initialize the development environment.
- **Initialize Skills**: Run `pnpm obsidian-dev-skills` to populate or update the `.agent/skills/` folder with the latest localized knowledge and automatically update `AGENTS.md`.
- Read `AGENTS.md` for project-specific instructions
- Use `npx openskills read <skill-name>` to load specialized knowledge
- Check `.agent/skills/*/references/` for deep technical guides

### Using ESLint

- **Check for issues**: `pnpm lint` (shows helpful success message when passing)
- **Auto-fix issues**: `pnpm lint:fix`

The lint commands use `scripts/lint-wrapper.mjs` which adds helpful success messages. This file is automatically created/updated when you run `node scripts/setup-eslint.mjs`.

## Releasing New Releases

- Update your `manifest.json` with your new version number and minimum Obsidian version
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"`
- **Build for production**: Run `pnpm build`
  - Creates `main.js` in the root directory (compiled from TypeScript)
- Create new GitHub release using your new version number as the "Tag version" (no `v` prefix)
- **Upload these files** to the release:
  - `main.js` (from root)
  - `manifest.json` (from root)
  - `styles.css` (from root, if present)
- Publish the release

> **Tip:** You can simplify the version bump process by running `pnpm version patch`, `pnpm version minor` or `pnpm version major` after updating `minAppVersion` manually in `manifest.json`.


## Adding Your Plugin to the Community Plugin List

- Check the [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- Publish an initial version
- Make sure you have a `README.md` file in the root of your repo
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin

## Manually Installing the Plugin

- Copy over `main.js`, `manifest.json`, and `styles.css` (if present) from the root directory to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`

## Funding URL

You can include funding URLs in your `manifest.json` file:

```json
{
    "fundingUrl": "https://buymeacoffee.com"
}
```

Or for multiple URLs:

```json
{
    "fundingUrl": {
        "Buy Me a Coffee": "https://buymeacoffee.com",
        "GitHub Sponsor": "https://github.com/sponsors"
    }
}
```

## Troubleshooting

### Upgrade Issues

If you're upgrading an existing plugin and encounter issues:

1. **ESLint errors after setup**: Run `pnpm install` to ensure all dependencies are installed
2. **Build errors**: Check that `esbuild.config.mjs` was updated correctly (the setup script should handle this automatically)
3. **Entry point not found**: The setup script adds entry point detection - verify `esbuild.config.mjs` has the detection logic for both `src/main.ts` and `main.ts`
4. **Package.json conflicts**: Don't copy `package.json` from the template - the setup script updates your existing one with only the necessary additions

### Common Issues

- **`.ref` folder is empty**: Run the setup script (`scripts\setup-ref-links.bat` or `.sh`)
- **Linting fails**: Make sure you ran `pnpm install` after running the ESLint setup script
- **Build fails**: Check that `esbuild.config.mjs` exists and has the correct entry point detection

## API Documentation

See https://docs.obsidian.md
