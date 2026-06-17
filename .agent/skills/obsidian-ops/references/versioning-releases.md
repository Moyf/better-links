# Versioning & releases

## Complete release flow

```bash
# 1. Bump version in package.json manually, then run version-bump to sync manifest + versions
$env:npm_package_version='x.y.z'; node version-bump.mjs
# version-bump.mjs only adds to versions.json when minAppVersion is NEW — add manually if needed

# 2. Write CHANGELOG.md (see format below)

# 3. Build
pnpm build

# 4. Stage and commit
git add manifest.json package.json versions.json CHANGELOG.md src/
git commit -m "build: x.y.z"

# 5. Push + tag (triggers GitHub Actions)
git push
git tag x.y.z
git push --tags
```

> CHANGELOG edits must be in the same commit as the tag (or before), because GitHub Actions extracts release notes from CHANGELOG.md at tag push time.

---

## CHANGELOG.md format

Each version entry: **English body** first, then **Chinese in a `<details>` block**.

```markdown
## [x.y.z] - YYYY-MM-DD

### ✨ Added / 🐛 Fixed / ⚡ Changed / 🗑️ Removed

- **Feature name**: One-sentence description of what changed and why.

<details>
<summary> 点我查看中文更新日志</summary>

### ✨ 新增 / 🐛 修复 / ⚡ 变更

- **功能名称**：中文描述。

</details>

---
```

Rules:
- `<details>` summary text is exactly ` 点我查看中文更新日志` (with a leading space)
- English descriptions: user-visible effect only — omit internal implementation details (no `coordsAtPos`, no CM6 internals)
- Chinese section inside `<details>` does **not** repeat version headers; content mirrors English structure
- Separate versions with `---`
- **Content granularity**: group related iterative improvements under the feature they belong to. Sub-details of a single feature (e.g. "new-link popup also shows embed button", "cursor jumps to link end after close", "cursor just past `]]` triggers edit") do NOT need their own bullet when they are refinements developed as part of that feature in the same release. Only write bullets for things that are meaningfully independent from a user's perspective — i.e. changes to behavior that existed in a previous release, or genuinely separate new capabilities.

---

## GitHub Release Notes format

The GitHub release body follows a different format from CHANGELOG:

```markdown
## [x.y.z] YYYY-MM-DD

### 🐛 Fixed

- **Issue name**: Short user-facing description.

<details>
<summary> 中文说明（点击展开）</summary>

### 🐛 修复

- **问题名称**：中文描述。
</details>

## [x.y.(z-1)] YYYY-MM-DD

...
```

Key differences from CHANGELOG:
- Version header: `## [x.y.z] YYYY-MM-DD` (no dash between version and date)
- A **single release covers multiple patch versions** of the same minor — users upgrading from any older patch see the full diff
- `<details>` summary: ` 中文说明（点击展开）` (leading space)
- Chinese section mirrors English structure (`### 🐛 修复` etc.) — no separate version title inside `<details>`
- Descriptions are **concise** — no internal API names, no implementation rationale

---

## GitHub Actions workflow rules

File: `.github/workflows/package.yml`

1. **Do not specify `version:` in `pnpm/action-setup`** — conflicts with `packageManager` in `package.json`:
   ```yaml
   - uses: pnpm/action-setup@v4
     # no 'with: version:' here
   ```

2. **Tag pattern**: uses bare semver (no `v` prefix), so set:
   ```yaml
   on:
     push:
       tags:
         - "*"
   ```

3. **Release assets** must include individual files (not just zip):
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

4. **`permissions: contents: write`** required for release creation.

5. **Re-tagging after force-push**:
   ```bash
   git push origin main --force
   git tag -f <version>
   git push origin :refs/tags/<version>
   git push origin <version>
   ```

