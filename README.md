<h1>
  <img alt="Ollupi" src="docs/logo/logo.svg" width="240">
</h1>

[ollupi](https://github.com/0xfakeSpike/ollupi) 的 macOS 桌面端。所有会话、子代理和定时任务共享一个执行池，可以同时开很多个会话；等你审批或回答的会话不占并发名额，状态存在本机，重启后接着跑。

## 安装

需要 macOS 12 或更新。从 [Releases](https://github.com/0xfakeSpike/ollupi-desktop/releases/latest) 下载：Apple 芯片选 `arm64.dmg`，Intel 选 `x64.dmg`，打开后把 Ollupi 拖进"应用程序"。

应用未经 Apple 公证，第一次打开会被拦下：到 **系统设置 → 隐私与安全性** 底部点"仍要打开"，或者执行：

```bash
xattr -dr com.apple.quarantine /Applications/Ollupi.app
```

## 使用

1. **配置模型**：**设置 → 模型 → 添加提供方**，填名称、Base URL（任意兼容 OpenAI 的 API）和 API 密钥，勾选模型并填上下文和输出上限，点 **保存并重启**。
2. **开始会话**：**添加工作区** 选一个项目文件夹，再点 **新会话**，选好工作区和模型后输入任务。一轮还在跑时可以 **插话** 或 **排队**。
3. **审批**：agent 要跑需要确认的命令时，选 **允许一次**、**在此会话中允许** 或 **拒绝**。命令默认在 macOS 沙箱里跑。

此外还有 **定时任务**（到点向会话发一条消息）、**记忆**（从会话中学习，在会话中使用）、**设置 → MCP** 和 **工作区设置 → 权限**。

配置和数据都在 `~/.ollupi`，配置文件是 `~/.ollupi/config.yaml`，可在 **设置 → 通用** 里打开。后端起不来时，界面会显示原因和后端日志。

## 许可

[MIT](LICENSE)
