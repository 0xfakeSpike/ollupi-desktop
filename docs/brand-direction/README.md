# 格墨：设计语言方向稿

Ollupi 的品牌与界面方向稿的源文件。定下来的规则在 [design-guidelines.md](../design-guidelines.md) 第 0 节，以准则为准；这里留着推导过程和示意。

**看**：用浏览器打开 [index.html](index.html)，所有画板排成一列，可以从顶部跳转，小狼的动画也会动。字体从 Google Fonts 加载，离线时会退回系统字体。这里是方向稿唯一的一份，没有在线版本。

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

## 格式与生成

每块画板是一个 `.dc.html` 组件文件，单独打开不会显示（它引用的 `./support.js` 不存在）。`index.html` 由 `build.mjs` 生成：它把 `canvas.json` 列出的画板内联进一个文件，用一段小运行时画出来（`{{}}` 插值、`<sc-for>`、`<sc-if>`、`<dc-import>`、`<helmet>`、带 state 的 `DCLogic`）。

改方向稿就改 `.dc.html`；加画板时同时在 `canvas.json` 的 `order` 和 `boards` 里登记。改完重新生成，不要手改 `index.html`：

```bash
node docs/brand-direction/build.mjs
```
