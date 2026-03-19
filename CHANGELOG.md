# Changelog

All notable changes to this project will be documented in this file.
本项目的重要变更会记录在此文件中。

## [1.0.3] - 2026-03-19

### English

#### Fixed

- Classify image links by destination file extension instead of `!` embed prefix alone.
- Treat embeds like `![[BetterLinks#related|related]]` as non-image links when the destination has no image extension.
- Preserve the original `!` embed prefix when editing and saving non-image embeds.

### 中文

#### 修复

- 图片链接改为按目标后缀名识别，不再仅根据 `!` embed 前缀判断。
- 对于 `![[BetterLinks#相关|相关]]` 这类目标不含图片后缀的 embed，按非图片链接处理。
- 编辑并保存非图片 embed 时，保留原始 `!` 前缀。

## [1.0.2] - 2026-03-19

### English

#### Changed

- Standardized changelog format to keep full English notes first and full Chinese notes second.
- Added release workflow guidance in the ops skill so future releases consistently include bilingual changelog notes.

#### Fixed

- Only open the link editor when clicking directly on link text.
- Do not open the editor when clicking after a link (for example right after `)`).
- Do not open the editor when the clicked link is inside the current text selection.
- Restore click interception only for valid link clicks so default behavior is not broken elsewhere.

### 中文

#### 变更

- 统一了 changelog 结构：先完整英文，再完整中文。
- 在 ops skill 中补充发布规范，确保后续发版会稳定包含双语 changelog 内容。

#### 修复

- 仅当直接点击链接文本时才打开链接编辑弹窗。
- 点击链接末尾之后的位置（例如 `)` 后）时不再打开弹窗。
- 当被点击链接位于当前选中文本内时，不再打开弹窗。
- 仅在有效链接点击时拦截事件，避免破坏其他位置的默认点击行为。

## [1.0.1] - 2026-03-19

### English

#### Added

- Initial stable release.

### 中文

#### 新增

- 首个稳定版本发布。
