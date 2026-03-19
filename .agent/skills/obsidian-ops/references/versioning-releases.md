<!--
Source: Based on Obsidian Sample Theme
Last synced: See sync-status.json for authoritative sync dates
Update frequency: Check Obsidian Sample Theme repo for updates
-->

# Versioning & releases

**Before releasing**: Use the comprehensive [release-readiness.md](release-readiness.md) checklist to verify your theme is ready for release.

- Bump `version` in `manifest.json` (SemVer).
- Create a GitHub release whose tag exactly matches `manifest.json`'s `version`. Do not use a leading `v`.
- Attach `manifest.json` and `theme.css` to the release as individual assets.
- After the initial release, follow the process to add/update your theme in the community catalog as required.

## GitHub Actions release workflow (better-links pattern)

File: `.github/workflows/package.yml`

### Key rules learned from this project

0. **Maintain a bilingual changelog and let release read from it**:
  - Keep version headers in this format so workflow extraction works: `## [x.y.z] - YYYY-MM-DD`
  - Under each version, always write full English section first, then full Chinese section. Do not interleave line-by-line.
  - Recommended structure:
    - `### English` + `#### Added/Changed/Fixed`
    - `### 中文` + `#### 新增/变更/修复`
  - Current workflow extracts the tagged version section from `CHANGELOG.md` into `release/release-notes.md` and appends GitHub-generated notes.

1. **Do not specify `version:` in `pnpm/action-setup`** — it conflicts with `packageManager` in `package.json`. Let the `packageManager` field alone control the pnpm version:
   ```yaml
   - uses: pnpm/action-setup@v4
     # no 'with: version:' here
   ```

2. **Tag pattern must match your actual tag format** — if you use bare semver tags (`1.0.1` without `v`), set:
   ```yaml
   on:
     push:
       tags:
         - "*"
   ```
   The default `v*` will silently skip non-`v` tags.

3. **Release must include dist files as individual assets** (not just a zip), so Obsidian can find `main.js`, `manifest.json`, `styles.css` directly in the release:
   ```yaml
   - uses: softprops/action-gh-release@v2
     with:
       generate_release_notes: true
       files: |
         release/main.js
         release/manifest.json
         release/styles.css
         better-links-${{ github.ref_name }}.zip
   ```

4. **`permissions: contents: write`** is required for `softprops/action-gh-release` to create releases.

5. **When squashing CI fixup commits** that are interleaved with non-CI commits, use separate `GIT_SEQUENCE_EDITOR` and `GIT_EDITOR` env vars so rebase is fully non-interactive:
   ```bash
   GIT_SEQUENCE_EDITOR="python reorder_squash.py" GIT_EDITOR="./write_msg.sh" git rebase -i <base>
   ```
   After squash, force-push branch and re-push the version tag:
   ```bash
   git push origin main --force
   git tag -f <version>
   git push origin :refs/tags/<version>
   git push origin <version>
   ```


