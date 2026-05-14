# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.4.5] - 2026-05-14

### ⚡ Changed

- **Popout window compatibility**: Replaced bare `document`, `setTimeout`, `clearTimeout`, `requestAnimationFrame`, and `cancelAnimationFrame` with their window-scoped equivalents (`activeDocument`, `window.setTimeout`, etc.) for full popout window support.
- **Cross-window type checks**: Use Obsidian's `.instanceOf()` instead of `instanceof` for cross-window safe type checking.
- **Language detection**: Use Obsidian's `getLanguage()` API instead of `localStorage.getItem("language")`.
- **Build provenance**: Added GitHub artifact attestation to the release workflow.

<details>
<summary> 点我查看中文更新日志</summary>

### ⚡ 变更

- **弹出窗口兼容性**：将全局 `document`、`setTimeout`、`clearTimeout`、`requestAnimationFrame`、`cancelAnimationFrame` 替换为窗口作用域版本（`activeDocument`、`window.setTimeout` 等），以完整支持弹出窗口。
- **跨窗口类型检查**：使用 Obsidian 的 `.instanceOf()` 替代 `instanceof`，确保跨窗口类型检查安全。
- **语言检测**：使用 Obsidian 官方 `getLanguage()` API 替代 `localStorage.getItem("language")`。
- **构建来源证明**：在发布工作流中添加 GitHub artifact attestation。

</details>

---

## [1.4.4] - 2026-05-13

### 🐛 Fixed

- **Popover mispositioned to top-left on line-ending links**: Fixed the popover appearing in the top-left corner when right-clicking a Markdown link at the end of a line. In Live Preview, `](url)` is folded — `coordsAtPos` on `match.end` returned `null` for line-ending positions. The virtual reference now uses the visible end (`]` position) instead of raw `match.end`, with mouse coordinates as the final fallback.
- **Live Preview expansion on right-click**: Fixed the editor line briefly expanding and then collapsing when right-clicking a link, causing text jitter. The plugin now intercepts `pointerdown(button=2)` in capture phase and calls `preventDefault` to block `mousedown` from reaching CM6, preventing the cursor from moving into the link line.

<details>
<summary> 中文说明（点击展开）</summary>

### 🐛 修复

- **行尾链接弹窗定位到左上角**：修复右键点击位于行尾的 Markdown 链接时，浮窗出现在左上角的问题。Live Preview 折叠 `](url)` 后，`coordsAtPos` 对行尾位置返回 `null`，定位退化为 `(0, 0)`。现在用链接可见结尾（`]` 的位置）替代原始的 `match.end`，并以鼠标坐标作为最终 fallback。
- **右键时 Live Preview 先展开再收缩（文字跳动）**：修复右键点击链接时，编辑器行短暂展开然后因失去焦点而收缩导致文字跳动的问题。现在在 capture 阶段拦截 `pointerdown(button=2)` 并调用 `preventDefault`，阻止 `mousedown` 传递给 CM6，防止光标移入链接行触发展开。

</details>

---

## [1.4.3] - 2026-05-08

### 🐛 Fixed

- **iOS click mode on collapsed links**: Fixed tap on collapsed (rendered) links in Live Preview not triggering the editor popover. Obsidian's internal widget handler intercepted touch events before the plugin's pointer/click listeners. The plugin now uses `touchstart` (capture, passive:false) to block the native navigation and opens the popover on `touchend`.

### ⚡ Changed

- **Debug mode setting**: Added a "Debug mode" toggle at the bottom of the settings page. When enabled, detailed logs are printed to the developer console for troubleshooting mobile issues.

### ⚠️ Known limitation

- **iOS scroll on links**: In "Click" trigger mode on iOS, scrolling cannot begin from a link area because `touchstart` is intercepted. Start scroll gestures from non-link areas.

<details>
<summary> 中文说明（点击展开）</summary>

### 🐛 修复

- **iOS 点击模式折叠链接不生效**：修复在 Live Preview 中点击折叠（渲染后）链接时编辑浮窗无法弹出的问题。Obsidian 内部的 widget handler 会在插件的 pointer/click 监听器之前拦截触屏事件。现在使用 `touchstart`（capture, passive:false）阻止原生跳转，并在 `touchend` 时打开浮窗。

### ⚡ 变更

- **调试模式设置**：设置页底部新增「调试模式」开关，开启后在开发者控制台输出详细日志，方便排查移动端问题。

### ⚠️ 已知限制

- **iOS 链接区域无法发起滚动**：「点击」触发模式下，iOS 上从链接区域无法开始滚动手势（因 `touchstart` 被拦截）。请从非链接区域发起滑动。

</details>

---

## [1.4.2] - 2026-04-29

### 🐛 Fixed

- **Smart split creating empty tab**: Fixed smart split reusing the sibling pane's active leaf, which replaced its content. Now correctly creates a new tab in the sibling pane via `createLeafInParent`.
- **Smart split not detecting existing splits**: Fixed `findSiblingLeaf` only looking one level up (leaf → tabs) instead of two (leaf → tabs → split). The workspace tree is `split(direction) → tabs → leaf`, so the direction check was never matching.

<details>
<summary> 中文说明（点击展开）</summary>

### 🐛 修复

- **智能分屏创建空标签页**：修复智能分屏复用了兄弟面板的当前活动 leaf 导致其内容被替换的问题。现在通过 `createLeafInParent` 在兄弟面板中正确创建新标签页。
- **智能分屏无法识别已有分屏**：修复 `findSiblingLeaf` 只往上查找一层（leaf → tabs）而非两层（leaf → tabs → split）的问题。workspace 结构为 `split(direction) → tabs → leaf`，之前的 direction 检查始终不匹配。

</details>

---

## [1.4.1] - 2026-04-27

### ✨ Added

- **Current tab option**: Added "Current tab" to the internal link open mode setting. Opens the link target in the same tab, replacing the current note.

<details>
<summary> 中文说明（点击展开）</summary>

### ✨ 新增

- **当前标签页选项**：内部链接打开方式新增「当前标签页」选项，在当前标签页原地打开链接目标，替换当前笔记。

</details>

---

## [1.4.0] - 2026-04-27

### ✨ Added

- **Internal link open mode**: New setting "Open internal links in" below the existing external link option. Choose where to open internal links via the popover's "Open link" button: new tab (default), new window, split left & right, or split top & bottom.
- **Smart split**: When a split mode is selected, an additional toggle (enabled by default) reuses an existing pane in the same direction instead of creating yet another split.

<details>
<summary> 中文说明（点击展开）</summary>

### ✨ 新增

- **内部链接打开方式**：在「外部链接打开方式」设置下方新增「内部链接打开方式」选项。可选择通过浮窗「打开链接」按钮打开内部链接时的位置：新标签页（默认）、新窗口、左右分屏、上下分屏。
- **智能分屏**：选择分屏模式时额外显示的开关（默认开启），已有同方向分屏时复用另一个面板而非再新建分屏。

</details>

---

## [1.3.1] - 2026-04-22

### 🐛 Fixed

- **Mobile touch interception**: Fixed `pointerdown` capture not working on touch devices. Touch events report `event.button === -1`, which was incorrectly filtered out. Changed filter to `button > 0` so only right/middle clicks are excluded. Also added a coordinate fallback using the target element's center when `clientX/Y` is 0.
- **Disable native click option**: When the trigger method is not "Click", a new toggle lets you suppress the default left-click link navigation. Only bare left-clicks on links are blocked — Ctrl+Click and other modified clicks still work as usual.
- **Mobile click mode**: Fixed touch-tap on links not opening the popover on mobile. The plugin now intercepts `pointerdown` in capture phase before Obsidian processes the native link jump.

<details>
<summary> 中文说明（点击展开）</summary>

### 🐛 修复

- **移动端触屏拦截**：修复触屏事件无法被 `pointerdown` capture 拦截的问题。触屏事件的 `event.button` 为 `-1`，之前的 `!== 0` 判断将其全部过滤，现改为 `> 0`，仅排除右键/中键。同时对部分移动端 WebView 中 `clientX/Y` 为 0 的情况，增加了以 target 元素中心坐标作为 fallback。
- **禁用左键原生点击**：当触发方式非「点击」时，新增开关可屏蔽左键点击链接的默认跳转行为。Ctrl+Click 等带修饰键的点击不受影响。
- **移动端点击模式**：修复移动端触屏点击链接时编辑浮窗无法弹出的问题。插件现在在 `pointerdown` capture 阶段抢先拦截，使点击触发在触屏设备上正常工作。

</details>

---

## [1.2.2] - 2026-04-02

### ✨ Added

- **Right-click trigger mode**: Added a new "Right click" option in trigger method settings to open the popover via context menu interaction.
- **Alt modifier option**: Added `Alt` as a trigger modifier key option alongside None/Ctrl/Shift.

### 🐛 Fixed

- **Right-click popover anchor stability**: Reworked right-click positioning to use an editor-range virtual reference, preventing the popover from jumping to the top-left corner after editor scroll.
- **Popover follow behavior on scroll/resize**: Added throttled Popper updates while the popover is open so right-click mode follows viewport/editor movement consistently.

<details>
<summary> 中文说明（点击展开）</summary>

### ✨ 新增

- **右键触发方式**：在触发方式设置中新增「右键」选项，可通过右键打开编辑浮窗。
- **新增 Alt 修饰键**：触发修饰键新增 `Alt` 选项，与无/Ctrl/Shift 并列。

### 🐛 修复

- **右键定位稳定性**：右键模式改为基于编辑器范围的虚拟锚点定位，修复编辑区滚动后弹窗跑到左上角的问题。
- **滚动/缩放跟随**：弹窗打开期间为滚动与窗口尺寸变化增加节流更新，右键模式下弹窗可稳定跟随视图变化。

</details>

---

## [1.2.1] - 2026-03-31

### ✨ Added

- **Multiple trigger modes**: Added "Hover", "Ctrl+Click", and "Shift+Click" trigger modes. Default changed to **Hover** — the popover opens when your cursor rests on a link.
- **Universal protocol support**: Links with custom protocols like `zotero://`, `file://`, etc. now open correctly through the system shell.
- **"Always show DisplayText" setting** (off by default): When off, links without explicit display text (plain URLs, `[[notename]]`) will not have the display name pre-filled in the editor.
- **Force save on validation failure**: When target validation fails, a ⚠️ warning icon appears inside the destination input and a ✓ button appears to force save, skipping validation.

### ✨ Improved

- **Same-note heading suggestions**: When selecting a heading from the current note in the suggestion list, the link no longer includes the redundant note name.
- **External → internal link format conversion**: When changing an external link destination to an internal path, the output format automatically follows Obsidian's "Use Wiki Links" setting.
- **Popover fade-in animation**: The popover now appears with a 150ms opacity transition.
- **User interaction protection**: The popover will not auto-close when the mouse leaves while an input is focused or the suggestion dropdown is open.

### 🐛 Fixed

- Plain URLs inside inline code (e.g. `` `www.a.com` ``) are no longer detected as editable links.
- Double tooltip on popover buttons (removed redundant `title` attribute).
- Clearing display text on a Markdown link produced `[](url)` instead of a plain URL.

<details>
<summary> 中文说明（点击展开）</summary>

### ✨ 新增

- **多种触发方式**：新增「悬浮」「Ctrl+点击」「Shift+点击」三种触发方式，默认改为**悬浮触发**——鼠标停留在链接上即弹出编辑窗口。
- **通用协议支持**：`zotero://`、`file://` 等任意自定义协议链接均可正确通过系统打开。
- **新增「总是显示 DisplayText」设置**（默认关闭）：关闭时，纯 URL 或 `[[笔记名]]` 等没有显式显示文本的链接，编辑窗中不会预先填入显示名称。
- **校验失败强制保存**：目标校验失败时，输入框内右侧浮动显示 ⚠️ 警告图标，出现 ✓ 按钮可跳过校验强制保存。

### ✨ 优化

- **当前笔记标题建议优化**：链接建议中选中当前笔记的标题时，不再生成额外的笔记名称。
- **外部→内部链接格式自动转换**：将外部链接目标改为内部路径时，自动根据 Obsidian「使用 Wiki 链接」设置选择输出格式。
- **编辑窗渐入动画**：popover 以 150ms 不透明度过渡显示。
- **用户交互保护**：输入框获焦或建议下拉列表打开时，鼠标移出不会触发弹窗自动关闭。

### 🐛 修复

- 修复：内联代码中的纯 URL（如 `` `www.a.com` ``）不再被识别为可编辑链接。
- 修复：编辑窗按钮的双层 tooltip 问题（移除冗余的 `title` 属性）。
- 修复：Markdown 链接 display text 清空后保存为 `[](url)` 的问题，现在正确退化为纯 URL。

</details>

---

## [1.1.0] - 2026-03-19

### ✨ Added

- **Link suggestion dropdown**: When editing a wiki/markdown link destination, an autocomplete dropdown appears showing matching notes and headings from the vault.
  - File mode (default): fuzzy-search all vault files; non-Markdown files are shown in a dimmed style with their file extension.
  - Heading mode: type `#` after a filename to list and search headings within that file.
  - Respects Obsidian's internal link format setting (shortest path / absolute / relative).
- **Alias sync on selection** (optional, off by default): when selecting a heading from the suggestion list, automatically fill in the display text (alias).
- **Embed toggle button**: a dedicated button in the popover footer to toggle the `!` embed prefix on wiki/markdown links.
- **Ctrl+Click to force-delete**: Ctrl/Cmd+clicking the delete button removes the link completely regardless of the "preserve text" setting.
- **Icon**: Plugin now shows an icon in the settings sidebar.

### 🐛 Fixed

- Suggestion dropdown no longer reopens after selecting an item.
- Mouse clicks on the suggestion dropdown no longer close the popover editor prematurely.
- Language detection now correctly identifies from Obsidian's interface language instead of the system language.

<details>
<summary> 中文说明（点击展开）</summary>

### ✨ 新增

- **链接建议下拉菜单**：在编辑 WikiLink / Markdown 链接目标时，自动显示库内文件和标题的模糊搜索候选列表。
  - 文件模式（默认）：检索所有文件；非 Markdown 文件以减弱颜色和后缀名显示。
  - 标题模式：在文件名后输入 `#`，列出并检索该文件的所有标题。
  - 遵循 Obsidian 的内部链接类型设置（最短路径 / 绝对路径 / 相对路径）。
- **选中时同步别名**（可选，默认关闭）：从候选列表选中标题时，自动填入显示文本。
- **嵌入切换按钮**：弹窗底部新增按钮，可快速切换链接前的 `!` embed 前缀。
- **Ctrl+Click 强制删除**：按住 Ctrl/Cmd 点击删除按钮时，无论「保留文本」设置如何，都会完整移除链接。
- **图标**：插件在设置侧边栏中现在有图标。

### 🐛 修复

- 修复：选中候选项后下拉菜单会重新弹出的问题。
- 修复：在候选菜单上点击鼠标时会意外关闭弹窗编辑器的问题。
- 修复：语言检测现在正确从 Obsidian 的界面语言而非系统语言识别。

</details>

---

## [1.0.4] - 2026-03-19

### ✨ Added

- New setting "Validate internal links" (enabled by default): when editing an internal link target, automatically check whether the destination file or heading exists via Obsidian's metadataCache with 300ms debounce.
- If validation fails, the destination input gets a warning style and saving is blocked with a Notice.
- ESC now discards edits and closes the popover without saving.

### ⚡ Changed

- Increased spacing between the two input fields in the popover editor.
- Added right-side boundary buffer (4px) for edge protection, matching the existing left-side buffer.

<details>
<summary> 中文说明（点击展开）</summary>

### ✨ 新增

- 新增「校验内部链接有效性」设置（默认启用）：编辑内部链接目标时，自动通过 Obsidian metadataCache 检测对应文件或标题是否存在（300ms 防抖）。
- 校验失败时，目标输入框显示警告样式，阻止保存并弹出 Notice 提示。
- ESC 键现在放弃编辑并直接关闭弹窗，不再保存改动。

### ⚡ 变更

- 增大弹窗编辑器中两个输入框的间距。
- 边界保护新增右侧缓冲区（4px），与左侧保持一致。

</details>

---

## [1.0.3] - 2026-03-19

### 🐛 Fixed

- Classify image links by destination file extension instead of `!` embed prefix alone.
- Treat embeds like `![[BetterLinks#related|related]]` as non-image links when the destination has no image extension.
- Preserve the original `!` embed prefix when editing and saving non-image embeds.

<details>
<summary> 中文说明（点击展开）</summary>

### 🐛 修复

- 图片链接改为按目标后缀名识别，不再仅根据 `!` embed 前缀判断。
- 对于 `![[BetterLinks#相关|相关]]` 这类目标不含图片后缀的 embed，按非图片链接处理。
- 编辑并保存非图片 embed 时，保留原始 `!` 前缀。

</details>

---

## [1.0.2] - 2026-03-19

### ⚡ Changed

- Standardized changelog format to keep full English notes first and full Chinese notes second.

### 🐛 Fixed

- Only open the link editor popover when clicking directly on a link, not on surrounding whitespace or non-link text.
- Popover no longer opens when clicking a link that is part of a text selection.

<details>
<summary> 中文说明（点击展开）</summary>

### ⚡ 变更

- 统一 CHANGELOG 格式：英文在前，中文在后。

### 🐛 修复

- 仅在直接点击链接时打开编辑浮窗，点击链接周围的空白或非链接文字不再触发。
- 点击处于选中文本中的链接时，不再弹出编辑浮窗。

</details>

---

## [1.0.1] - 2026-03-15

### ✨ Added

- Copy Markdown and Copy URL buttons in the popover.
- Delete link button with "preserve display text" option.
- Ctrl+Click shortcut on the Open button to open links directly.
- Edge protection to prevent false triggers on link boundaries.
- Exclude keywords setting to skip specific link destinations.

<details>
<summary> 中文说明（点击展开）</summary>

### ✨ 新增

- 浮窗中新增「复制 Markdown」和「复制 URL」按钮。
- 新增删除链接按钮，支持「保留显示文本」选项。
- Open 按钮支持 Ctrl+Click 直接打开链接。
- 边界保护，防止在链接边缘误触发。
- 新增排除关键词设置，可跳过特定链接目标。

</details>

---

## [1.0.0] - 2026-03-13

### ✨ Added

- Initial release: floating link editor popover for Obsidian Live Preview.
- Supports wiki links, Markdown links, and plain URLs.
- Edit display text and destination inline without breaking the editing flow.

<details>
<summary> 中文说明（点击展开）</summary>

### ✨ 新增

- 初始版本：Obsidian Live Preview 内联浮动链接编辑器。
- 支持 WikiLink、Markdown 链接、纯 URL。
- 直接在编辑流中修改显示文本和目标地址。

</details>
