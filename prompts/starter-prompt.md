### Obsidian Plugin Starter Prompt

**Objective**: Build a production-ready Obsidian plugin using the [Obsidian Sample Plugin Plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) template.

**1. Bootstrap & Skills Initialization**
Before writing any code, perform these environment setup steps:
- Verify `pnpm` is installed (install if missing).
- Run `pnpm obsidian-dev-skills` to initialize the localized skill set (`.agent/skills/`). This script intelligently detects the project type, seeds a `project-specific` skill template, and automatically generates/updates `AGENTS.md`.
- Run `scripts/setup-ref-links` (use `.bat` for Windows, `.sh` for Unix) to symlink core Obsidian API and documentation references into the `.ref/` folder.

**2. Load Domain Knowledge**
Load the following skills to ensure your implementation follows current best practices. **Read these files completely before proceeding**:
- `./.agent/skills/obsidian-dev/SKILL.md` (Core Development Patterns)
- `./.agent/skills/obsidian-ops/SKILL.md` (Operations & Workflow)
- `./.agent/skills/obsidian-ref/SKILL.md` (Technical References & UX Guidelines)
- `./.agent/skills/project/SKILL.md` (Project-specific architecture)

**3. Plugin Specification**
- **Name**: [My Plugin]
- **ID**: [my-plugin]
- **Description**: [Detailed description of what the plugin does.]
- **Author**: [Name]
- **Author URL**: [URL]
- **Funding**: [URL]
- **Desktop Only**: [Yes/No]
- **External Refs (Optional)**: [GitHub URLs for reference patterns]. If used, examine licenses and credit in README.

**4. Project Instructions**
- [Describe your primary instructions, functional requirements, and creative brief here.]

**5. Implementation Workflow**
1. **Clarify**: Ask any necessary questions before changing code.
2. **Scaffold**: Update `manifest.json`, `package.json`, and `README.md`. Set version to `0.0.1`.
3. **Clean**: Remove all "sample plugin" boilerplate. Delete `styles.css` if it is not required for the implementation.
4. **Develop**: Implement functionality following the loaded skills—prioritizing async safety, lifecycle management (`onload`/`onunload`), and Mobile/Desktop UI consistency.
5. **Verify**: 
    - Run `pnpm build`: Must result in zero errors.
    - Run `pnpm lint`: Must result in zero issues. Fix all lints without using `eslint-disable` or `any` types. However, sentence case for UI text can sometimes throw false positives. Just ignore those and move on if so.
6. **Project Continuity**: 
    - **Discovery Mandate**: If `./.agent/skills/project/SKILL.md` is currently a template or lacks detail, your first task is to audit the codebase and document the core architecture, key files, and unique conventions before proceeding with implementation.
    - Summarize the final architecture and unique conventions into the `./.agent/skills/project/SKILL.md` file for future agents.

**Constraints**: Do not perform any `git` operations (commit/push) without explicit approval.
