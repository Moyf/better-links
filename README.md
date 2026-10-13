# Better Links

[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=Downloads&query=%24%5B%22better-links%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://obsidian.md/plugins?id=better-links) [![Release](https://img.shields.io/github/v/release/Moyf/better-links?label=Release)](https://github.com/Moyf/better-links/releases) [![GitHub Issues](https://img.shields.io/github/issues/Moyf/better-links?label=Issues)](https://github.com/Moyf/better-links/issues) [![Stars](https://img.shields.io/github/stars/Moyf/better-links?logo=github&label=Stars)](https://github.com/Moyf/better-links/stargazers)

![preview](assets/preview.jpg)

[中文](#中文) | [English](#english)

## English

Better Links is an Obsidian plugin for quick link editing in the Markdown editor.
Click a link to open a small popover where you can edit text/target and run quick actions.

### Features

- Supports WikiLinks, Markdown links, plain URLs, and image-form links.
- Normal click opens the editor popover.
- Ctrl/Cmd + Click opens the link directly.
- Quick actions:
  - Open link
  - Copy link in preferred format
  - Copy URL or file name (for image links)
  - Delete link (hidden for image links)
- Localized UI (English + Chinese).
- Support suggestion for internal links and heading. ![internal link suggestion](assets/suggestion.gif)
  - Auto-complete files and headings in the vault, quickly select and insert link targets.
  - Automatically update display text.

### Notes

- External URLs are always copied as Markdown links.
- Internal links and image links follow Obsidian link format setting (WikiLink vs Markdown).
- **Mobile (iOS)**: In "Click" trigger mode, tapping a collapsed link in Live Preview will open the editor popover instead of navigating. Due to technical constraints, scrolling cannot begin from a link area — start your scroll gesture from a non-link area instead.

### Declaration

1. This idea and solution are inspired by [Octarine](https://octarine.app/).
2. This project is based on David V. Kimbal's [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) and was developed with AI assistance; I actively install it in my own vault for frontline testing and daily use.

### More from Moy

If you appreciate my plugin design and quality, check out my other Obsidian plugins:

| Plugin | Description | Stats |
| --- | --- | --- |
| [Yearly Glance](https://github.com/Moyf/yearly-glance) | See your whole year's key events at a glance. | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22yearly-glance%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/yearly-glance?logo=github&label=Stars) |
| [Easy Copy](https://github.com/Moyf/easy-copy) | Easily copy formatted text, or quickly generate elegant links. | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22easy-copy%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/easy-copy?logo=github&label=Stars) |
| [Style Context](https://github.com/Moyf/style-context) | Set your Obsidian background to any image in your vault. | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22style-context%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/style-context?logo=github&label=Stars) |
| [Colorful Highlights](https://github.com/Moyf/colorful-highlights) | Enhanced colorful highlights with multiple styles, or define your own color schemes. | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22colorful-highlights%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/colorful-highlights?logo=github&label=Stars) |
| [Harbor Tab](https://github.com/Moyf/harbor-tab) | A beautiful new tab page with quick file search and creation. | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22harbor-tab%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/harbor-tab?logo=github&label=Stars) |
| [Single Choice Property](https://github.com/Moyf/single-choice-property) | Keep selected list properties to only one value. | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22single-choice-property%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/single-choice-property?logo=github&label=Stars) |

> See all my plugins on my [Obsidian Community page](https://community.obsidian.md/users/moyf).

Friend plugins I contributed to: [Note Toolbar](https://github.com/chrisgurney/obsidian-note-toolbar) & [Typify](https://github.com/leike-dev/Obsidian-Typify) ❤️

### Support

If you like Better Links, consider [buying me a coffee on Ko-fi](https://ko-fi.com/moy) ☕

---

## 中文

![preview](assets/preview-zh.jpg)

Better Links 是一个 Obsidian 插件，用于在 Markdown 编辑器中快速编辑链接。
点击链接会弹出轻量浮窗，可直接修改文本和目标，并执行快捷操作。

### 功能

- 支持 Wikilink、Markdown 链接、纯 URL、图片类链接。
- 普通点击打开浮窗。
- Ctrl/Cmd + 点击直接打开链接。
- 快捷操作：
  - 打开链接
  - 按设置复制链接格式
  - 复制 URL（图片类复制文件名）
  - 删除链接（图片类隐藏删除按钮）
- 支持中英文界面。
- 内部链接建议功能。![内部链接建议](assets/suggestion.gif)
  - 支持自动补全库内文件和标题，快速选择并插入链接目标。
  - 自动更新显示名称。

### 说明

- 外部网址始终按 Markdown 链接格式复制。
- 内部链接和图片链接会跟随 Obsidian 的链接格式设置（Wikilink / Markdown）。
- **移动端（iOS）**：「点击」触发模式下，点击 Live Preview 中折叠的链接会打开编辑浮窗而非跳转。由于技术限制，从链接区域无法发起滚动手势——请从非链接区域开始滑动。

### 声明

1. 这个想法和方案灵感来自 [Octarine](https://octarine.app/)。
2. 该项目基于 David V. Kimbal 的 [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) ，由 AI 进行开发；我会第一时间将插件安装到自己的库中进行测试和实际使用。

### 来自 Moy 的更多插件

如果你欣赏我的插件设计和质量，可以看看我的其他 Obsidian 插件：

| 插件 | 简介 | 数据 |
| --- | --- | --- |
| [Yearly Glance](https://github.com/Moyf/yearly-glance) | 年度一览，一眼纵览你全年的关键事件。 | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22yearly-glance%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/yearly-glance?logo=github&label=Stars) |
| [Easy Copy](https://github.com/Moyf/easy-copy) | 轻松复制格式文本，或快速生成优雅的链接。 | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22easy-copy%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/easy-copy?logo=github&label=Stars) |
| [Style Context](https://github.com/Moyf/style-context) | 将你的 Obsidian 背景设成任意库内图片。 | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22style-context%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/style-context?logo=github&label=Stars) |
| [Colorful Highlights](https://github.com/Moyf/colorful-highlights) | 彩色高亮效果增强，提供多种样式，或自定义新配色。 | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22colorful-highlights%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/colorful-highlights?logo=github&label=Stars) |
| [Harbor Tab](https://github.com/Moyf/harbor-tab) | 非常好看的新标签页，快速搜索和创建文件。 | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22harbor-tab%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/harbor-tab?logo=github&label=Stars) |
| [Single Choice Property](https://github.com/Moyf/single-choice-property) | 让选定的列表属性始终只保留一个值。 | ![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&logoColor=white&color=%23483699&label=downloads&query=%24%5B%22single-choice-property%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json) ![GitHub Stars](https://img.shields.io/github/stars/Moyf/single-choice-property?logo=github&label=Stars) |

> 全部插件见 [Moy 的 Obsidian Community 页面](https://community.obsidian.md/users/moyf)。

参与开发的友情插件：[Note Toolbar](https://github.com/chrisgurney/obsidian-note-toolbar) & [Typify](https://github.com/leike-dev/Obsidian-Typify) ❤️

### 支持作者

如果 Better Links 对你有帮助，欢迎[请我喝杯咖啡（Ko-fi）](https://ko-fi.com/moy) ☕
