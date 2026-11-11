# 格墨：设计语言方向稿

Ollupi 的品牌与界面方向稿的源文件。定下来的规则在 [design-guidelines.md](../design-guidelines.md) 第 0 节，以准则为准；这里留着推导过程和示意。

在线画布：https://claude.ai/artifact/BJZhy98W4ED51eRQtreWoQ （私有，需要所有者分享才能打开）

## 画板

| 文件 | 内容 |
|---|---|
| `Main.dc.html` | 01 方向：现在的四个源头 → 一个源头（小狼），五条原则 |
| `Color.dc.html` | 02 颜色：夜、鸢尾、薰衣、雪、腮红；浅色与深色中性灰；状态色；颜色预算 |
| `Type.dc.html` | 03 字标与字体：新旧字标、App 图标、传播与工作两种字体声音 |
| `Pixels.dc.html` | 04 像素小狼 · 产品里：每张脸对应的状态、像素光标、像素加载、像素发送箭头 |
| `Screen.dc.html` | 05 对话页 · 浅色（`mode` 属性切深色） |
| `ScreenDark.dc.html` | 06 对话页 · 深色（引用 `Screen`） |
| `Home.dc.html` | 07 官网首屏 |
| `Spread.dc.html` | 08 传播：README 头图、头像、发版卡片、招牌瞬间、表情包 |
| `Pup.dc.html` | 组件：像素小狼，按 `face`、`cell`、`animate` 画出 20×20 网格，其他画板都引用它 |
| `canvas.json` | 画布索引：每块画板的位置和尺寸 |

## 格式

`.dc.html` 是 Claude Design 画布的组件格式，要在画布里才能渲染（`./support.js` 由画布提供），直接用浏览器打开不会显示。改完后发布回画布时，每个文件发布到 `project/<文件名>`。
