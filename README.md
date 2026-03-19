# Better Links

Better Links 是一个 Obsidian 插件，用来把 Markdown 编辑器里的链接点击动作改造成“先编辑，再操作”的浮动气泡交互。

点击支持的链接时，插件会在链接旁边打开一个基于 Popper.js 定位的浮动编辑窗，用来快速修改链接名称和目标地址，并提供打开、复制、删除等快捷操作。

## 当前功能

- 支持 3 类链接
   - Wikilink：`[[note]]`、`[[note|alias]]`
   - Markdown 链接：`[label](target)`
   - 纯 URL：`https://example.com`
- 普通点击：打开浮动编辑窗
- `Ctrl+Click` 或 `Cmd+Click`：直接打开链接，跳过编辑窗
- 浮动编辑窗内支持
   - 编辑链接名称
   - 编辑目标地址
   - 保存修改
   - 打开链接
   - 复制为 Markdown 链接
   - 复制 URL
   - 删除链接
- 设置页支持
   - 启用或禁用插件
   - 分别启用或禁用 3 类链接
   - 配置外部链接打开方式
   - 配置删除链接时保留文本还是全部移除

## 交互说明

### 普通点击

在 Markdown 编辑器里普通点击受支持的链接，会在链接附近弹出编辑窗。

### `Ctrl+Click` / `Cmd+Click`

直接打开链接，不显示编辑窗。

### 浮动编辑窗动作

- `Save`：将当前输入写回 Markdown 源文
- `Open`：按当前输入值打开链接
- `Copy as Markdown`：复制为 `[text](url)` 格式
- `Copy URL`：只复制目标地址
- `Delete`：按设置删除链接

## 设置项

插件设置页包含以下配置：

- `Enable link editor`
   - 总开关
- `Wikilinks`
   - 是否处理 `[[note]]` 类链接
- `Markdown links`
   - 是否处理 `[label](target)` 类链接
- `Plain web links`
   - 是否处理裸露的 `https://...` 链接
- `Open external links in`
   - `System browser`
   - `Obsidian window`
- `Delete link behavior`
   - `Preserve text`
   - `Remove everything`

## 目前实现边界

- 当前拦截和编辑逻辑以 CodeMirror Markdown 编辑器为核心。
- 实际适用场景是源码模式和实时预览编辑场景中的链接。
- README 中的“支持三种链接类型”已经覆盖当前编辑器内交互。
- 纯阅读视图里的 DOM 到源文范围映射没有单独实现，因此不把它作为当前版本保证范围。

如果后续要扩展到纯阅读视图，需要额外做预览 DOM 到源文位置的映射层。

## 开发

### 依赖安装

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
```

### 生产构建

```bash
pnpm build
```

当前构建会把以下文件输出到 `dist/`：

- `main.js`
- `manifest.json`
- `styles.css`

### Lint

```bash
pnpm lint
```

## 手动测试清单

建议至少验证以下场景：

### 链接识别

- 点击 `[[note]]` 能弹出编辑窗
- 点击 `[[note|alias]]` 能弹出编辑窗并正确填充名称与目标
- 点击 `[label](https://example.com)` 能弹出编辑窗
- 点击 `https://example.com` 能弹出编辑窗

### 打开行为

- 普通点击显示编辑窗
- `Ctrl+Click` / `Cmd+Click` 直接打开链接
- Wikilink 使用 Obsidian 内部打开
- 外部链接按设置打开

### 编辑行为

- 修改名称并保存后，Markdown 源文正确更新
- 修改目标后保存，Markdown 源文正确更新
- 纯 URL 在填写不同名称后保存，可转换为 Markdown 链接

### 快捷动作

- `Copy URL` 复制成功
- `Copy as Markdown` 复制结果正确
- `Delete` 在“保留文本”模式下只去掉链接语法
- `Delete` 在“全部移除”模式下清空整段链接

### 浮窗定位

- 链接靠近右侧边缘时，浮窗自动翻转或偏移，不被裁切
- 链接靠近底部边缘时，浮窗自动调整位置
- 多次点击不同链接时，浮窗位置会跟随更新

## 构建状态

当前仓库已验证：

- `pnpm build` 通过
- `pnpm lint` 通过

## 发布文件

发布 Obsidian 插件时，需要附带：

- `dist/main.js`
- `manifest.json`
- `styles.css`

如果你的发布流程希望最终产物位于仓库根目录，可以再加一层发布脚本拷贝；当前项目默认以 `dist/` 作为构建输出目录。
