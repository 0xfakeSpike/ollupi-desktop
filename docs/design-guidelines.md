# ollupi desktop 设计准则

这是 [design-brief.md](design-brief.md) 的答复：设计思想、设计语言（token）、组件与模式的规则、文案语气。改写现有界面和新增界面都以它为准。每条规则都尽量落到具体的值或可判断的条件上；拿不准时，回到第 1 节的四个关键词做取舍。

---

## 1. 设计思想

### 1.1 关键词

| 关键词 | 取舍时意味着 |
|---|---|
| **安静** | 默认中性灰。颜色、粗体、底色是预算，一屏之内只该有一处在"说话"。 |
| **可扫读** | 每一块的第一行就说清"它是什么、结果如何"；细节靠展开，不靠堆字。 |
| **诚实** | 状态准确：在跑就显示在跑，失败就显示失败，不做装饰性的"看起来很忙"。 |
| **紧凑** | 长时间使用的工具：行高、内边距偏小，但正文的阅读舒适度不让步。 |

### 1.2 信息的四个层级

从上到下越来越安静：

1. **需要你**：审批、提问。全界面唯一"浮起来"的东西（阴影 + 状态色条）。同时在对话流之外有回响：侧栏会话圆点、顶栏徽标、输入框提示 "Waiting for your answer"。
2. **对话内容**：用户消息、agent 的最终回复。`fg`、`text-body`，是页面的主体。
3. **过程**：推理、工具调用、子代理、计划。`fg-muted`、`text-ui`，每项一行，默认折叠。一轮结束后整段过程收成一行摘要（"Worked for 42s · 6 commands · 2 files changed"），展开见全部；运行中保持展开，让人看到当前在做什么。
4. **系统**：压缩、记忆载入。`fg-subtle`、`text-small`，一行或一条分隔线。token 用量不进对话流，只在 Context 面板。

### 1.3 克制与强调

- **强调色（accent）只用于 5 处**：一个区域里唯一的主按钮、焦点环、表单控件的选中态（单选点、复选框、开关）、链接、进度填充。其余地方一律不用；任何大于一个控件的面积都不能铺 accent 或 `accent-soft`。
- **成功是常态，不着色。** 工具成功、任务完成不显示绿色；只有失败、等待、被拒才有标记。例外：diff 的 `+12 −3`。
- **粗体（600）** 只给标题和按钮。正文里的强调交给 Markdown 本身。500 用于导航选中项、标签、列表行的主名称。
- **底色** 只表示"这是一块独立的内容"（代码、输出、用户消息、设置列表），不表示状态。
- **状态色** 只出现在图标、文字、2px 色条和 soft 徽标上，不做块的整体底色或边框。
- **边框** 一律 1px：`line` 做分隔和普通轮廓，`line-strong` 做输入框和需要用户行动的块。

---

## 2. 设计语言

### 2.1 Token：直接替换 `packages/ui/src/theme.css`

下面是 `packages/ui/src/theme.css` 的完整新内容。`@theme` 里的 `initial` 会清掉 Tailwind 的默认色板、字号、字重、圆角、阴影、缓动，**只留这里定义的几档**，越界的写法（`text-sm`、`rounded-2xl`、`bg-blue-500`、`text-white`、`font-bold`）直接不生成样式，迁移时一眼就能发现。迁移对照见第 5 节。

```css
/* Design tokens for @ollupi/ui. Components use only these semantic names
   (bg-canvas, text-fg-muted, border-line, text-ui, rounded-lg, ...), so a
   theme is a set of variable values and dark mode needs no per-component
   classes. The resets below remove Tailwind's defaults: a class outside
   these scales produces no style. See docs/design-guidelines.md. */

@theme inline {
  --color-*: initial;
  --color-canvas: var(--ol-canvas);
  --color-sidebar: var(--ol-sidebar);
  --color-surface: var(--ol-surface);
  --color-raised: var(--ol-raised);
  --color-hover: var(--ol-hover);
  --color-selected: var(--ol-selected);
  --color-line: var(--ol-line);
  --color-line-strong: var(--ol-line-strong);
  --color-scrim: var(--ol-scrim);
  --color-knob: var(--ol-knob);
  --color-fg: var(--ol-fg);
  --color-fg-muted: var(--ol-fg-muted);
  --color-fg-subtle: var(--ol-fg-subtle);
  --color-accent: var(--ol-accent);
  --color-accent-fg: var(--ol-accent-fg);
  --color-accent-soft: var(--ol-accent-soft);
  --color-focus: var(--ol-focus);
  --color-success: var(--ol-success);
  --color-success-soft: var(--ol-success-soft);
  --color-warning: var(--ol-warning);
  --color-warning-soft: var(--ol-warning-soft);
  --color-danger: var(--ol-danger);
  --color-danger-fg: var(--ol-danger-fg);
  --color-danger-soft: var(--ol-danger-soft);

  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, 'PingFang SC', monospace;

  --text-*: initial;
  --text-caption: 11px;
  --text-caption--line-height: 16px;
  --text-caption--font-weight: 500;
  --text-small: 12px;
  --text-small--line-height: 18px;
  --text-ui: 13px;
  --text-ui--line-height: 20px;
  --text-body: 14px;
  --text-body--line-height: 23px;
  --text-title: 15px;
  --text-title--line-height: 22px;
  --text-title--font-weight: 600;
  --text-display: 20px;
  --text-display--line-height: 28px;
  --text-display--font-weight: 600;

  --font-weight-*: initial;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  --spacing: 4px;

  --radius-*: initial;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  --shadow-*: initial;
  --shadow-sm: var(--ol-shadow-sm);
  --shadow-md: var(--ol-shadow-md);
  --shadow-lg: var(--ol-shadow-lg);

  --ease-*: initial;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);

  /* Entrances: menus and toasts rise, dialogs scale. Under reduced motion
     an element swaps its entrance for animate-fade. */
  --animate-enter: enter 160ms cubic-bezier(0.2, 0, 0, 1);
  --animate-dialog: dialog 240ms cubic-bezier(0.2, 0, 0, 1);
  --animate-fade: fade 160ms cubic-bezier(0.2, 0, 0, 1);

  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @keyframes dialog {
    from {
      opacity: 0;
      transform: scale(0.98);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }

  --container-thread: 720px;
  --container-dialog: 480px;
  --container-dialog-wide: 640px;
}

:root {
  color-scheme: light dark;
  --ol-canvas: #ffffff;
  --ol-sidebar: #f7f7f6;
  --ol-surface: #f4f4f2;
  --ol-raised: #ffffff;
  --ol-hover: rgb(0 0 0 / 0.045);
  --ol-selected: rgb(0 0 0 / 0.075);
  --ol-line: rgb(0 0 0 / 0.08);
  --ol-line-strong: rgb(0 0 0 / 0.14);
  --ol-scrim: rgb(0 0 0 / 0.3);
  --ol-knob: #ffffff;
  --ol-fg: #1b1b1a;
  --ol-fg-muted: #5f5f5c;
  --ol-fg-subtle: #8a8a85;
  --ol-accent: #1f6feb;
  --ol-accent-fg: #ffffff;
  --ol-accent-soft: rgb(31 111 235 / 0.1);
  --ol-focus: rgb(31 111 235 / 0.35);
  --ol-success: #1a7f37;
  --ol-success-soft: rgb(26 127 55 / 0.1);
  --ol-warning: #9a6700;
  --ol-warning-soft: rgb(212 167 44 / 0.15);
  --ol-danger: #cf222e;
  --ol-danger-fg: #ffffff;
  --ol-danger-soft: rgb(207 34 46 / 0.08);
  --ol-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.06);
  --ol-shadow-md: 0 4px 12px rgb(0 0 0 / 0.08), 0 1px 3px rgb(0 0 0 / 0.06);
  --ol-shadow-lg: 0 16px 48px rgb(0 0 0 / 0.16), 0 2px 8px rgb(0 0 0 / 0.08);
}

@media (prefers-color-scheme: dark) {
  :root {
    --ol-canvas: #161616;
    --ol-sidebar: #1c1c1c;
    --ol-surface: #212121;
    --ol-raised: #262626;
    --ol-hover: rgb(255 255 255 / 0.06);
    --ol-selected: rgb(255 255 255 / 0.1);
    --ol-line: rgb(255 255 255 / 0.08);
    --ol-line-strong: rgb(255 255 255 / 0.15);
    --ol-scrim: rgb(0 0 0 / 0.5);
    --ol-knob: #e8e8e6;
    --ol-fg: #ececea;
    --ol-fg-muted: #a5a5a0;
    --ol-fg-subtle: #75756f;
    --ol-accent: #4c8dff;
    --ol-accent-fg: #ffffff;
    --ol-accent-soft: rgb(76 141 255 / 0.14);
    --ol-focus: rgb(76 141 255 / 0.45);
    --ol-success: #3fb950;
    --ol-success-soft: rgb(63 185 80 / 0.14);
    --ol-warning: #d29922;
    --ol-warning-soft: rgb(210 153 34 / 0.16);
    --ol-danger: #f85149;
    --ol-danger-fg: #ffffff;
    --ol-danger-soft: rgb(248 81 73 / 0.12);
    --ol-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.4);
    --ol-shadow-md: 0 4px 16px rgb(0 0 0 / 0.45);
    --ol-shadow-lg: 0 16px 48px rgb(0 0 0 / 0.6);
  }
}
```

`transparent`、`current`、`inherit` 是 Tailwind 内置的值，不受 `--color-*: initial` 影响。

### 2.2 颜色

**中性色**

| token | 用于 | 不用于 |
|---|---|---|
| `canvas` | 主画布（对话页、Memory、Settings 内容区） | — |
| `sidebar` | 侧栏、Context 面板 | 对话框 |
| `surface` | 代码块、工具输出、用户消息气泡、计划、设置列表卡片、表头 | 浮层 |
| `raised` | 对话框、菜单、toast、气泡提示、**需要用户行动的块** | 流里的普通块 |
| `hover` | 悬停底色；行内代码底色 | 选中态 |
| `selected` | 侧栏项、竖排子标签、菜单的选中项 | 表单控件（用 accent） |
| `line` | 分隔线、普通卡片轮廓、表格线 | 输入框 |
| `line-strong` | 输入框、次要按钮、行动块的边框；滚动条 | 分隔线 |
| `scrim` | 对话框背后的遮罩 | — |
| `knob` | 开关的圆钮（两套主题里都是近白色） | — |

**文字三档**

| token | 用于 |
|---|---|
| `fg` | 对话正文、标题、列表项主名称、输入的值、数值 |
| `fg-muted` | 过程行（推理、工具调用）、次要说明、未选中的标签页、幽灵按钮、默认图标色 |
| `fg-subtle` | 元信息（时间、时长、单位、分母）、占位符、系统信息、分组标题、空状态图标 |

**强调色与状态色**

| token | 用于 |
|---|---|
| `accent` / `accent-fg` | 主按钮；表单控件选中态；链接；进度填充；提问块的色条和图标；"等待你"的圆点 |
| `accent-soft` | 选中的单选/复选行内控件本身的底（不是整行），accent 徽标的底 |
| `focus` | 焦点环：`focus-visible:ring-3 ring-focus outline-none` |
| `success` | diff 的 `+n`；用量条之外几乎不用。成功默认不着色 |
| `warning` | 普通审批的色条和图标；用量接近自动压缩点；可恢复的提醒 |
| `danger` / `danger-fg` | 失败（图标、退出码、错误文字）；沙箱外/不可逆审批；危险按钮；diff 的 `−m` |
| `*-soft` | 只做徽标的底，或 toast/错误块里图标后面的小块底，面积不超过一行 |

### 2.3 字号

| class | 字号 / 行高 / 字重 | 用在 |
|---|---|---|
| `text-caption` | 11 / 16 / 500 | 徽标、快捷键提示（`↵`、`⌘K`） |
| `text-small` | 12 / 18 / 400 | 元信息、时间、辅助说明、错误提示、系统信息、分组标题、Context 面板的数据行 |
| `text-ui` | 13 / 20 / 400 | **界面默认**：侧栏、按钮、表单、工具调用行、列表、设置行 |
| `text-body` | 14 / 23 / 400 | 对话正文（用户消息、agent 回复的 Markdown） |
| `text-title` | 15 / 22 / 600 | 顶栏标题、对话框标题、设置分区标题、页面标题（Memory、Settings） |
| `text-display` | 20 / 28 / 600 | 新会话页标题、整页空状态和整页错误 |

- 字重只用 `font-normal`、`font-medium`、`font-semibold`。`caption`、`title`、`display` 自带字重，不再叠加。
- Markdown 里的标题相对正文放大（h1 1.35em、h2 1.2em、h3 1.05em，600），不使用上面的阶梯，因为它们属于内容，不属于界面。
- **中英混排**：不加 `letter-spacing`、不用 `uppercase`（全大写英文标签和中文放在一起很难看）、中文不用斜体。用户和 agent 的文字原样显示，不自动在中英文之间加空格。
- **等宽**：命令、路径、文件名、模型 ID、环境变量、退出码用 `font-mono`。对话流的工具行里用 12px（`text-small`），代码块和输出用 13px（`text-ui`），Markdown 行内代码 0.88em。`--font-mono` 末尾带 PingFang SC，代码里的中文有回退。
- **数字**：表格、Context 面板、时长、token 数一律 `tabular-nums`。
- **对话列宽**：`max-w-thread`（720px）居中，左右至少 24px 留白。

### 2.4 间距

基数 4px（`--spacing: 4px`，`p-3` = 12px）。只用这几档：

| class 后缀 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|
| px | 2 | 4 | 6 | 8 | 12 | 16 | 20 | 24 | 32 | 48 |

| 场合 | 值 |
|---|---|
| 图标与文字 | 6（`gap-1.5`） |
| 按钮内边距 | sm `px-2`，md `px-2.5`，lg `px-3` |
| 列表行、导航项内边距 | `px-2`，高度由控件高度决定 |
| 块（L1、L2）内边距 | 12（`p-3`）；对话框 20（`p-5`） |
| 列表项之间 | 2（`gap-0.5`） |
| 表单字段之间 | 16（`gap-4`）；标签与字段 6，字段与提示 4 |
| 块内各段之间 | 12（`gap-3`） |
| 过程行之间 | 4（`gap-1`） |
| 对话流中块与块 | 12（`gap-3`） |
| 一轮与一轮（用户消息前） | 24（`mt-6`） |
| 页面内区块之间（设置分区） | 32（`gap-8`） |
| 页面边距 | 24（`px-6`） |

不在表里的值（`p-7`、`gap-2.5`、`mt-[13px]`）就是不对。

### 2.5 圆角、边框、阴影

| class | 值 | 用于 |
|---|---|---|
| `rounded-sm` | 4 | 徽标、行内代码、复选框、快捷键提示 |
| `rounded-md` | 6 | 按钮、输入框、下拉框、侧栏项、菜单项、子标签 |
| `rounded-lg` | 8 | 对话流里的块（代码块、工具输出、计划、行动块）、设置列表卡片 |
| `rounded-xl` | 12 | 对话框、菜单浮层、toast、输入框外壳（Composer）、用户消息气泡 |
| `rounded-full` | — | 圆点、开关、用量条、头像 |

- 嵌套时，内圆角 = 外圆角 − 内边距；内边距 ≥ 外圆角时内层可以是直角。
- 不用无后缀的 `rounded`。

| class | 用于 |
|---|---|
| （无阴影） | 对话流里的所有普通块、设置卡片、侧栏 |
| `shadow-sm` | 需要用户行动的块、输入框外壳 |
| `shadow-md` | 菜单、选择浮层、toast、气泡提示 |
| `shadow-lg` | 对话框 |

深色模式下阴影几乎看不见，层次由更亮的 `raised` 底色加 `line-strong` 边框承担：所有带阴影的东西也必须有 1px 边框（行动块 `line-strong`，浮层和对话框 `line`）。

### 2.6 图标（lucide）

| 尺寸 | 用于 |
|---|---|
| 14 | `text-ui`、`text-small` 的行内：工具行、元信息、徽标前、sm 按钮 |
| 16 | 默认：md/lg 按钮、导航项、顶栏、表单 |
| 20 | 空状态、整页错误 |

- `strokeWidth={1.75}` 统一（14px 时可用 2，保证清晰）。
- 颜色继承 `currentColor`，默认跟随文字的 `fg-muted`。只有图标本身表达状态时才着状态色（失败的 ✕、提问的 ?、审批的盾牌）。
- 纯图标按钮必须有 `label`（作为无障碍名称和 tooltip）。点击区：sm 24px（紧凑行内），md 28px（默认）。

### 2.7 动效

| 时长 | 用于 |
|---|---|
| `duration-100` | 悬停、按下的颜色变化 |
| `duration-160` | 展开/折叠、浮层出现、箭头旋转 |
| `duration-240` | 对话框出现、侧面板滑入 |

- 缓动统一 `ease-standard`。浮层和 toast 出现用 `animate-enter`（透明度 0→1 加 4px 位移）；对话框用 `animate-dialog`（透明度加 0.98→1 缩放），遮罩用 `animate-fade`。
- **流式输出**：不做逐字淡入，只保留末尾光标 `▍`（`.streaming-caret`），自动贴底滚动；用户向上滚动后停止贴底，出现"回到底部"按钮。
- **加载**：等待 <300ms 不显示任何东西；之后列表用骨架行，其余用 spinner + 动词。对话流里只有"当前那一步"闪 shimmer（`.shimmer`），同一时刻最多一处。
- 超长输出展开不做高度动画，直接出现。
- 遵守 `prefers-reduced-motion: reduce`：带入场动画的元素同时写 `motion-reduce:animate-fade`，只保留透明度变化；shimmer 关掉。

---

## 3. 组件与模式

### 3.1 对话流：三种视觉重量

agent 产出的每一块都用同一个骨架：

```
[图标 14]  动作  对象                          元信息(右对齐, fg-subtle)
           └─ 展开后的正文(可选)
```

区别只在重量，共三档：

| 档 | 样式 | 用于 |
|---|---|---|
| **L0 行** | 无底无框；`text-ui` `fg-muted`；悬停时整行 `hover` 底、`rounded-md`；可点击展开 | 推理、工具调用、文件改动、子代理、记忆载入、一轮的过程摘要 |
| **L1 块** | `bg-surface` `rounded-lg` `p-3`，无边框无阴影 | 代码块、展开后的工具输出、计划、Markdown 表格、用户消息气泡（`rounded-xl`） |
| **L2 行动** | `bg-raised` `border border-line-strong` `rounded-lg` `shadow-sm` `p-3`，左侧 2px 状态色条（`border-l-2` 用状态色或内嵌一条绝对定位的色条） | 审批、提问 |

```
L0  ⌄ Thought for 3.8s
    ▸ Ran  pnpm test                           1.2s · exit 1
    ▸ Edited  src/foo.ts                           +12 −3
    ▸ Loaded 3 memories

L1  ┌──────────────────────────────────────┐
    │ $ pnpm test                          │   surface 底
    │ FAIL src/foo.test.ts …               │
    └──────────────────────────────────────┘

L2  ┃ ? Which branch should I base this on? │   raised 底 + 阴影 + 色条
    ┃   ○ main                              │
    ┃   ● release/1.4                       │
```

| 内容 | 形态 | 折叠时 | 展开后 |
|---|---|---|---|
| 用户消息 | L1 气泡，靠右，最大宽度 85%，`text-body` `fg` | — | — |
| agent 回复 | 直接写在画布上，不加容器，`text-body` `fg` | — | — |
| 推理 | L0，大脑/思考图标 | "Thought for 3.8s"；进行中 "Thinking…" + shimmer | 推理全文，`fg-muted` `text-ui`，左侧 1px `line` 引导线、缩进 16 |
| 命令 | L0 → L1 | `Ran` + 命令首行（mono，单行截断）+ 时长；非零退出码显示 `exit 1`（`text-danger`），图标变 danger | L1：完整命令、输出（mono 13，`max-h-80` 内滚，超长时提供"展开全部"），复制按钮悬停出现 |
| 读文件/搜索/MCP 调用 | L0 → L1 | 动作 + 对象（路径或工具名 mono）+ 结果计数（"12 matches"） | 参数与结果 |
| 文件改动 | L0 → L1 | `Edited` + 路径 + `+n`（success）`−m`（danger） | diff，L1 |
| 子代理 | L0 | 名称 + 任务一句话 + 状态 | 嵌套时间线：缩进 16 + 1px 引导线，里面仍是 L0/L1，**不嵌套卡片** |
| 计划 | L1 | — | 清单：○ 待做（`fg-subtle`）、◐ 进行中（`fg` + shimmer）、✓ 完成（`fg-subtle`）；不用颜色区分 |
| 过程摘要 | L0 | "Worked for 42s · 6 commands · 2 files changed"；有失败时追加 "· 1 failed"（danger） | 这一轮全部过程行 |
| 压缩标记 | 横向分隔线，中间 `text-small` `fg-subtle` | "Context compacted · 182k → 24k tokens" | — |
| 记忆载入 | L0，`text-small` `fg-subtle` | "Loaded 3 memories" | 记忆标题列表，可跳到 Memory 页 |
| 错误通知 | L0 + danger 图标与文字 | 错误一句话 | 原始错误（mono），可复制 |

**展开规则**：运行中的那一项自动展开输出的最后几行（最多 6 行），完成后自动收起；失败项完成后保持折叠，只靠 danger 图标和退出码引起注意。用户手动展开过的，不再自动收起。

### 3.2 需要用户行动的块

醒目靠"浮起来"，不靠满底颜色。色条和图标的颜色就是危险分级：

| 级别 | 色条 / 图标 | 标题 | 按钮（从右到左） |
|---|---|---|---|
| 提问 | accent | 问题本身 | `Submit`（主） |
| 普通审批：写文件、跑命令、调用 MCP | warning | "Run this command?" / "Edit 3 files?" / "Call `github.create_issue`?" | `Allow once`（主）· `Allow for this session`（次）· `Deny`（幽灵） |
| 危险审批：沙箱外运行、删除、不可逆 | danger | "Run outside the sandbox?"，下一行用一句话说明后果 | `Run outside sandbox`（危险）· `Deny`（次）。不提供"本会话允许"，或者折进 "…" 菜单并二次确认 |

**审批块**
- 结构：图标 + 标题；需要审批的对象放进 L1 mono 块（可复制）；agent 给出的理由 `text-ui` `fg-muted`；按钮行右对齐。
- 键盘：`↵` 执行主按钮，`Esc` 拒绝；在按钮上用 `text-caption` 标出快捷键。
- 危险审批的默认焦点放在 `Deny`，不放在危险按钮上。
- 已处理的审批收成 L0 行："Allowed once · `rm -rf build`" / "Denied · …"，不保留卡片。

**提问块**
- 一个问题：问题（`text-ui` `fg` `font-medium`）→ 选项 → 自由输入。
- 选项是整行可点击的行：左边单选或复选控件，右边标签（`fg`）+ 说明（`text-small` `fg-muted`）。行内边距 `px-2 py-1.5`、`rounded-md`，悬停 `hover` 底。
- 选中态 = 控件填 accent，行底 `hover`。**边框不加粗，整行或整块都不变蓝。**
- 自由输入是最后一行："Other…"，选中后变成输入框。
- 一次问多个：纵向排列，问题之间用 `line` 分隔、间距 12；底部显示 "2 of 3 answered"（`text-small` `fg-subtle`），全部答完才启用 `Submit`。超过 3 个问题时分页，标题旁显示 "1 / 5"。
- 提交后收成 L0 行："Answered 3 questions"，展开可见答案。

**流外的回响**
- 侧栏该会话显示 accent 圆点；顶栏显示 `Needs approval` / `Needs answer` 徽标。
- 输入框上方显示 "Waiting for your answer above"；行动块滚出视野时，在输入框上方浮出胶囊按钮 "1 request waiting ↓"，点击滚到块。
- 窗口不在前台时发系统通知。

### 3.3 状态的表达

| 载体 | 用于 | 规格 |
|---|---|---|
| **圆点** | 列表里表示"这里有事"（侧栏会话、workspace、连接状态） | 6px `rounded-full`，放在行尾元信息的位置 |
| **徽标** | 标题或顶栏里说出状态名，或计数 | `text-caption` 高 18、`px-1.5`、`rounded-sm`；状态色徽标 = `*-soft` 底 + 状态色字；中性徽标 = `hover` 底 + `fg-muted` 字；一行最多一个 |
| **图标 + 文字** | 对话流里 | 见 3.1 |

| 状态 | 表达 |
|---|---|
| 进行中 | shimmer 文字或 14px spinner，`fg-subtle`，**不着色**；侧栏里 spinner 代替时间 |
| 等待用户 | accent（圆点、徽标、色条）；普通审批的块用 warning 色条，但侧栏圆点和顶栏徽标统一用 accent，表示"轮到你了" |
| 完成 | 默认无标记 |
| 失败 | danger（图标、文字、圆点） |
| 被拒绝 | ban 图标 + "Denied"，`fg-muted`。拒绝是用户的选择，不是错误，**不用红色** |
| 已停止 | square 图标 + "Stopped"，`fg-muted` |
| 已断开 / 重连中 | 侧栏底部连接状态：断开 danger 圆点 + "Disconnected"，重连中 spinner + "Reconnecting…" |

### 3.4 按钮

| 尺寸 | 高 | 文字 | 用于 |
|---|---|---|---|
| `sm` | 24（`h-6`） | `text-small` `font-medium` | 块里、行内、列表行的操作 |
| `md` | 28（`h-7`） | `text-ui` `font-medium` | 默认：顶栏、表单、设置 |
| `lg` | 32（`h-8`） | `text-ui` `font-medium` | 对话框底部、新会话页、整页错误 |

| 种类 | 样式 | 用途 |
|---|---|---|
| **主要** | `bg-accent text-accent-fg`，悬停 `brightness-110` | 区域里最推荐的那一个动作。一个区域（一张卡片、一个对话框、一个设置分区、一个空状态）**最多 1 个** |
| **次要** | `bg-raised border border-line-strong text-fg`，悬停 `bg-hover` | 其它正向动作、Cancel |
| **幽灵** | 透明，`text-fg-muted`，悬停 `bg-hover text-fg` | 工具栏、图标按钮、第三选项、`Deny` |
| **危险** | `bg-danger text-danger-fg` | 只用于"确认执行破坏性动作"的那一下（对话框里的 `Delete`、沙箱外的 `Run outside sandbox`） |
| **危险入口** | 幽灵样式 + `text-danger` | 菜单和列表里的 `Forget`、`Delete`、`Remove` 入口；点了之后再确认 |

- 顺序按 macOS 惯例：主按钮在最右，Cancel 在它左边，按钮间距 8。
- 禁用：`opacity-50`，不改颜色；禁用的主按钮旁边或下方要说明为什么不能点（"2 of 3 answered"）。
- 加载：按钮内 spinner 替换图标，文字不变，按钮宽度不跳。
- 焦点：`focus-visible:ring-3 ring-focus`。

### 3.5 表单

```
Label                          ← text-ui font-medium fg，下方 6
[ input                    ]   ← h-7（对话框里 h-8），rounded-md
Help text                      ← text-small fg-subtle，上方 4；出错时替换成错误文字
```

- **输入框 / 下拉框 / 多行文本**：`bg-transparent`（取所在表面的颜色：页面上是 canvas，对话框里是 raised）+ `border border-line-strong` + `rounded-md` + `px-2.5` + `text-ui`。占位符 `fg-subtle`。聚焦：边框 `accent` + `ring-3 ring-focus`。命令、路径、JSON 类的输入用 `font-mono`。
- **错误**：通过 `Field` 的 `error`（不要塞进 `hint`），边框变 `danger`，提示换成 `text-small text-danger` 的错误文字，说清楚哪里不对、怎么改（"Must be a URL starting with http:// or https://"）。在失焦或提交时校验，不在输入过程中报错。
- **开关 vs 复选框**：立即生效的设置用开关，没有保存按钮；需要统一保存的表单里用复选框。
- **设置行**（macOS 系统设置的写法）：左边标签（`text-ui` `fg`）+ 说明（`text-small` `fg-muted`），右边控件，行高至少 44、`px-3 py-2.5`。多行组成一张 `bg-surface rounded-lg` 卡片，行之间 `border-t border-line`。
- **必填** 不打星号；可选字段在标签后写 "(optional)"，`fg-subtle`。

### 3.6 列表与导航

| 元素 | 规格 |
|---|---|
| 侧栏项、竖排子标签（Memory 范围）、菜单项 | 高 28、`rounded-md`、`px-2`、`text-ui`；图标 16 `fg-muted`；悬停 `bg-hover`；选中 `bg-selected` + `font-medium` + `fg` |
| 分组标题（workspace） | `text-small` `font-medium` `fg-subtle` + 折叠箭头；已归档分组默认折叠，放在最底部 |
| 行尾元信息 | `text-small` `fg-subtle`（相对时间、计数）；运行中换成 spinner，等待/失败换成圆点 |
| 悬停才出现的操作 | 直接替换行尾元信息的位置，不额外占宽度，悬停时文字不跳；sm 图标按钮（24px）；行 `focus-within` 或其菜单打开时保持显示；最多 2 个，更多的放进 "…" 菜单 |
| 横排标签（Settings） | `text-ui` `font-medium`；未选中 `fg-muted`，悬停 `fg`；选中 `fg` + 2px 下划线（`fg` 色，不用 accent）；标签栏底部 `border-b border-line` |
| 卡片列表（MCP 服务器、模型提供方） | 用 3.5 的设置卡片：每行名称（`fg` `font-medium`）+ 一行摘要（`text-small` `fg-muted` mono）+ 状态徽标 + 悬停操作；点行打开编辑对话框 |

侧栏底部固定：Memory、Settings 两个导航项，下面是连接状态（圆点 + `text-small`）。

### 3.7 浮层

| 浮层 | 何时用 | 规格 |
|---|---|---|
| **对话框** | 需要专注的多字段编辑：定时任务、会话权限、workspace 设置、MCP 服务器、模型提供方；破坏性动作的确认 | `max-w-dialog`（480）或 `max-w-dialog-wide`（640）；`bg-raised border border-line rounded-xl shadow-lg`；背后 `bg-scrim`；标题区 `px-5 pt-5`，`text-title` + 一句 `text-ui fg-muted` 说明；内容 `px-5 py-4`；底部 `px-5 pb-5` 右对齐按钮（lg），不画分隔线，内容滚动时才在底部出现 `border-t border-line` |
| **菜单 / 选择浮层** | 从触发器展开的选择：模型选择、workspace 选择、行尾 "…" 菜单 | `bg-raised border border-line rounded-xl shadow-md p-1`；菜单项同 3.6；危险项放最后，前面加分隔线 |
| **Toast** | 用户没在原地等待的异步结果；后台动作的失败 | 右下角，宽 360，`bg-raised border border-line rounded-xl shadow-md p-3`；图标 + 一句话 + 可选的一个操作按钮；成功类 4 秒自动消失，错误类要手动关闭；最多同时 3 条 |
| **气泡提示** | 图标按钮的名称和快捷键；截断文字的全文；绝对时间 | 延迟 500ms；`bg-raised border border-line rounded-md shadow-md px-2 py-1 text-small` |

- **不叠对话框。** 对话框里的删除用对话框内的二次确认（按钮变成 "Click again to delete"）或者一个小确认浮层。
- 原地已经能看到结果的动作不发 toast（保存设置后开关已经变了，就不要再 toast "Saved"）。
- `Esc` 关闭任何浮层；有未保存修改的对话框关闭前确认。

### 3.8 空状态、加载、错误

三种都**出现在内容本该在的位置**，不弹窗。

| 状态 | 写法 |
|---|---|
| **空状态** | 区域内居中：20px `fg-subtle` 图标 → `text-ui font-medium fg` 一行标题 → `text-small fg-subtle` 一行说明 → 最多一个次要按钮。例："No memories yet" / "ollupi saves what it learns about you here." |
| **加载** | 前 300ms 不显示；之后列表用 3 行骨架（`bg-hover rounded-md`，高度同真实行），其余用 spinner + 动词（"Loading models…"） |
| **错误** | danger 图标 + 什么失败了（`fg`）+ 为什么（`fg-muted`）+ 操作按钮（`Retry`）；原始错误放在可展开的 L1 mono 块里，可复制 |
| **后端启动失败页** | 错误写法的整页版：居中，`max-w-dialog-wide`；`text-display` 标题 "ollupi didn't start"；一段原因；日志末尾 L1 mono 块（可复制，`max-h-80` 内滚）；`Retry`（主，lg）+ `Open logs`（次，lg） |

### 3.9 数据展示（Context 面板）

- **数字**：`tabular-nums`，列内右对齐。主值 `fg`，单位和分母 `fg-subtle`：`182.4k` `/ 200k`。
- **键值行**：左边标签 `text-small fg-muted`，右边值 `text-small fg`，行距 6，不画分隔线。分组之间用 `border-t border-line` + 16 间距，组标题 `text-small font-medium fg-subtle`。
- **用量条**：高 6、`rounded-full`、底色 `hover`。组成部分用中性灰的几级（`fg` 不同透明度：60% / 40% / 25% / 15%）区分，**不用彩虹色**；只有"本次调用"之类需要突出的部分用 accent。自动压缩点画成一根 1px 的竖刻度（`fg-subtle`）。用量超过压缩点的 80% 时，填充变成 warning。图例在条下方：色块 8px `rounded-sm` + 名称 + 数值。
- **格式**
  - token：`950`、`1.2k`、`182k`、`1.2M`（≥10k 不留小数）
  - 时长：`820ms`、`3.8s`、`1m 12s`
  - 时间：列表里相对时间（"just now"、"3m ago"、"Yesterday"、"Oct 12"），悬停显示绝对时间
  - 金额：`$0.042`
- **模型调用列表**：每行一个调用，左边模型名（mono `text-small`）+ 时间，右边 token 和时长；点开显示该调用的组成。最近一次调用放在列表上方单独一块。

---

## 4. 文案

- **全部 sentence case**：`Add workspace`、`Allow once`、`New conversation`，不用 Title Case。专有名词保持原样（MCP、ollupi 永远小写）。
- **按钮**：动词开头，1–3 个词，说出结果：`Run outside sandbox`，不写 `OK`、`Yes`、`Confirm`。会打开对话框的按钮加 `…`：`Edit…`、`Add server…`。
- **时态**：进行中用现在分词加省略号（"Running…"、"Thinking…"），完成后用过去式（"Ran 3 commands"、"Thought for 3.8s"）。省略号用单个字符 `…`。
- **语气**：平实、直接。不用感叹号，不写 "Oops"、"Uh-oh"，不拟人卖萌，不道歉堆砌。
- **出错提示** 三段：什么失败了 → 为什么 → 用户能做什么。
  - "Couldn't start ollupi. Port 8421 is already in use. Quit the other instance or change the port in Settings."
  - "Couldn't connect to the MCP server. The command exited with code 127. Check that `npx` is installed."
  - 不知道原因时直接给原始错误，不编造解释。
- **审批和提问** 的标题是一个问句，主语是动作："Run this command?"、"Edit 3 files?"。
- **空状态**：标题说现状（"No scheduled tasks"），说明说它是什么或怎么开始，不重复标题。
- **数字** 一律用阿拉伯数字；复数要对（"1 file"、"2 files"）。
- 界面文案是英文；用户和 agent 的内容原样显示。

---

## 5. 迁移

### 5.1 旧写法 → 新 token

| 旧 | 新 |
|---|---|
| `text-[10px]`、`text-[11px]` | `text-caption` |
| `text-xs`、`text-[12px]` | `text-small` |
| `text-[13px]`、界面里的 `text-sm` | `text-ui` |
| Markdown 和消息里的 `text-sm`、`text-[14px]`、`text-base` | `text-body` |
| `text-[15px]`、`text-lg` | `text-title` |
| `text-xl`、`text-2xl` | `text-display` |
| `font-bold` | `font-semibold` |
| `uppercase tracking-wide` | 删掉，用 `text-small font-medium fg-subtle` |
| `rounded`、`rounded-xs` | `rounded-sm` |
| `rounded-2xl`、`rounded-3xl` | `rounded-xl` |
| 原 `rounded-sm`（2px） | `rounded-sm`（现在是 4px），检查效果 |
| `shadow`、`shadow-xs`、`shadow-xl`、`shadow-2xl` | 按 2.5 选 `shadow-sm` / `md` / `lg` |
| `bg-black/30` | `bg-scrim` |
| `text-white`（危险按钮） | `text-danger-fg` |
| `bg-white` | `bg-raised` 或 `bg-canvas` |
| `ring-2 ring-accent/50` | `ring-3 ring-focus` |
| `Dialog width={…}` | 默认 480；长表单传 `wide`（640） |
| `Field hint={error ?? hint}` | `Field error={error} hint={hint}` |
| `Callout icon={…}` | 去掉：图标由 `tone` 决定 |
| Switch 圆钮 `bg-white` | `bg-knob` |
| 侧栏选中的 `bg-hover` | `bg-selected` |
| 提问卡片 `border-accent/30 bg-accent-soft/40` | L2：`bg-raised border-line-strong shadow-sm` + accent 色条 |
| 审批卡片的黄色底 | L2 + warning 色条（沙箱外为 danger） |
| Button `sm` `h-7` / `md` `h-8` | `sm` `h-6` / `md` `h-7` / 新增 `lg` `h-8` |
| IconButton `size-6` / `size-8` | `size-6` / `size-7` |
| `apps/desktop/src/renderer/src/styles.css` 里 `body { font-size: 14px }` | 改为 13px，行高 20px（界面默认是 `text-ui`）；`.markdown` 加 `font-size: 14px; line-height: 23px` |

不保留任何旧 class 的别名：替换完 token 后，旧写法不生成样式，逐个改掉即可。

### 5.2 顺序

1. 替换 `packages/ui/src/theme.css`（2.1），修改 `styles.css` 的 body 和 `.markdown` 字号。
2. 改 `@ollupi/ui` 的基础组件：Button、IconButton、Input、Dialog、Toast、Tabs，对齐 3.4–3.7。
   `cn`（tailwind-merge）已登记 theme.css 的字号、缓动、动画、容器名；以后在 theme.css 新增一档，也要同步登记到 `packages/ui/src/cn.ts`，否则 `cn('text-ui', 'text-fg')` 会把字号当成颜色合并掉。
3. 新增对话流的三个组件，放在 `@ollupi/ui`：`ProcessRow`（L0，取代原来的 `Disclosure`）、`Block`（L1，`CodeBlock` 建在它上面）、`ActionCard`（L2，接收 `tone: 'accent' | 'warning' | 'danger'`），把 `ToolCallView`、`SystemItems`、推理、`ApprovalCard`、`QuestionsCard` 迁过去。提问和审批先改，差异最大。
4. 侧栏、Memory、Settings、各对话框、Context 面板、后端启动失败页。

### 5.3 自查

改完一个界面，用下面几条判断是否合规：

```bash
# 任意值写法：字号、圆角、颜色、间距都不该出现
rg -n 'text-\[|rounded-\[|bg-\[#|text-\[#|p[xytrbl]?-\[|m[xytrbl]?-\[|gap-\[' apps packages --glob '!**/node_modules/**'
```

```bash
# 全大写标签、粗体
rg -n 'uppercase|font-bold|tracking-' apps packages --glob '!**/node_modules/**'
```

```bash
# 强调色铺底：逐个确认只出现在主按钮、选中控件、进度填充上
rg -n 'bg-accent' apps packages --glob '!**/node_modules/**'
```

- 一个区域里主按钮超过 1 个 → 错。
- 成功状态用了绿色 → 错（diff 计数除外）。
- 对话流里的普通块有阴影或状态色底 → 错。
- 被拒绝显示成红色 → 错。
- 有阴影但没有 1px 边框 → 深色模式下会糊，错。

---

## 6. 覆盖的界面

| 界面 | 主要用到 |
|---|---|
| 侧边栏 | 3.6 列表与导航（新建会话、添加 workspace 为幽灵按钮；分组、悬停操作、已归档分组）、3.3 圆点、底部连接状态 |
| 新会话页 | `text-display` 标题、workspace 与模型的选择浮层（3.7）、输入框外壳（`rounded-xl shadow-sm`）、lg 主按钮 |
| 对话页顶栏 | `text-title` 标题 + `text-small fg-subtle` 的 workspace；状态徽标（3.3）；定时任务、权限、Context 面板开关为 md 图标按钮（开启时 `active`） |
| 对话流 | 3.1、3.2 |
| 输入框 | `bg-raised border-line-strong rounded-xl shadow-sm`；运行中右侧主按钮变为 `Stop`（次要样式 + square 图标），输入内容时为 `Send`（追加）；等待用户时上方提示 |
| Context 面板 | `bg-sidebar`，3.9 |
| Memory 页 | 左侧范围列表（3.6 竖排子标签）；右侧顶部记忆开关（设置行）+ 状态；记忆条目为设置卡片行，悬停操作 Edit / Move to…，Forget 为危险入口 |
| Settings 页 | 横排标签（3.6）；General 为设置卡片；Models、MCP、Tools 为卡片列表 + 编辑对话框 |
| 对话框 | 3.7 对话框 + 3.5 表单：定时任务、会话权限、workspace 设置、MCP 服务器、模型提供方 |
| 后端启动失败页 | 3.8 |
| Toast | 3.7 |
