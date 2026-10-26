<div align="center">

<img src="assets/fish-daughter.png" width="320" alt="Rice-loving whale-girl mascot / 爱吃白饭的大肥鱼女儿" />

# dsh-assist

**Portable personas. Persistent memory. Opt-in proactive chat.**

A community plugin for **DeepSeek Harness Desktop**.

[![Version](https://img.shields.io/badge/version-0.2.0--preview-f59e0b)](https://github.com/a740411040/dsh-assist/releases/tag/v0.2.0)
[![License: MIT](https://img.shields.io/badge/license-MIT-2563eb)](LICENSE)
[![Harness target](https://img.shields.io/badge/Harness-0.2.1--rc.3-475569)](docs/VERIFICATION.md)

[English](#english) · [简体中文](#简体中文) · [Download](https://github.com/a740411040/dsh-assist/releases/tag/v0.2.0) · [Documentation](#documentation)

</div>

---

## English

Turn a Harness conversation into a reusable AI companion: choose a persona, retain useful memories, and let it start a brief conversation after a period of inactivity.

> **Preview release.** Targets Harness Desktop **0.2.1-rc.3**. Offline tests and simulated-host checks pass; real Desktop installation and model behavior remain unverified. This is an independent community project, not an official DeepSeek product.

### What it does

| Capability | Behavior |
| --- | --- |
| Portable personas | Versioned JSON packs with identity, voice, greeting, and memory guidance |
| Persistent memory | Long-term notes shared within a persona; short-term checkpoints scoped to a session |
| Proactive chat | Opt-in idle triggers with cooldowns, quiet hours, and an unanswered-message limit |
| Shareable packs | Public exports omit stored memories; private backups require an explicit option |
| Inspectable data | Local JSON storage, CLI tools, and documented formats |

### Meet the default companion

**Rice-Loving Chubby Fish Daughter** — **爱吃白饭的大肥鱼女儿** — is a playful fictional fish who loves a bowl of plain steamed rice. She calls you “爸爸” (“Dad”) by default; you can change that address at any time. The bundled persona speaks Chinese by default; ask for another language if preferred.

> “Dad, your chubby fish daughter is here! I'd love a warm bowl of rice today. Shall we chat, or is there something I can help you with?”

This is an example of the persona's voice, not a fixed response. Fresh storage selects this persona automatically. Existing installations retain their saved roles and memories.

**Role ID:** `little-fish` · **Definition:** [packs/fish.json](packs/fish.json)

### Download

Get the files from the [v0.2.0 release](https://github.com/a740411040/dsh-assist/releases/tag/v0.2.0).

| File | Use |
| --- | --- |
| [dsh-assist-0.2.0.tgz](https://github.com/a740411040/dsh-assist/releases/download/v0.2.0/dsh-assist-0.2.0.tgz) | Desktop plugin installer — do not extract |
| [dsh-assist-0.2.0-source.zip](https://github.com/a740411040/dsh-assist/releases/download/v0.2.0/dsh-assist-0.2.0-source.zip) | Complete source for development |
| [SHA-256 manifest](https://github.com/a740411040/dsh-assist/releases/download/v0.2.0/dsh-assist-0.2.0-manifest.json) | Verify downloaded artifacts |

### Installation

The commands below use **Windows PowerShell**. Desktop supplies its own runtime; a separate system Node.js/npm installation is not required for plugin installation.

1. Launch Harness Desktop once to initialize its profile. Use **Manage dsh Command…** in the application menu to install or repair its `dsh` command.
2. **Fully quit Desktop.** Closing the window may only hide it.
3. Open a new PowerShell terminal. Verify that `dsh` comes from Desktop and reports `0.2.1-rc.3`, then install the downloaded package:

```powershell
Get-Command dsh
dsh --version

$package = Join-Path $env:USERPROFILE 'Downloads\dsh-assist-0.2.0.tgz'
dsh plugin --profile desktop add $package
dsh plugin --profile desktop list
```

Adjust the path if your download is elsewhere. Stop if a command fails. Reopen Desktop after installation.

An npm-installed standalone `dsh` cannot modify Desktop's profile. See the [installation and troubleshooting guide](docs/DESKTOP.md) for source-folder installation and existing-user migration.

### Enable proactive chat

In the target conversation, ask:

> Use `assist_list`, select `little-fish` with `assist_use`, and read `assist_memory_read`. Then call `assist_idle_start`: chat after 15 idle minutes, wait at least 30 minutes between triggers, pause after two unanswered triggers, and stay quiet from 23:00 to 08:00.

**Enabled means the tool returned `enabled: true`**, not merely that the model said it would remind you.

| Action | Tool |
| --- | --- |
| Enable or change settings | `assist_idle_start` |
| Inspect this conversation | `assist_idle_status` |
| Stop future triggers | `assist_idle_stop` |

Quiet hours use the backend's local timezone. The backend must remain running; restarting it or unloading the session requires a fresh opt-in. Each trigger uses the selected model and incurs normal usage. Stop does not retract a turn already submitted.

For a one-minute check, use `idleMinutes: 1`, `cooldownMinutes: 1`, `maxUnanswered: 1`, `quietStart: 0`, and `quietEnd: 0`. After the model finishes replying, stop typing. A trigger should occur after roughly 60–75 seconds; the response itself also depends on model latency. No second trigger should occur until you reply. Then call `assist_idle_stop`.

See [idle-chat settings](docs/IDLE.md) for full behavior. Reading [SKILL.md](SKILL.md) in TRAE or another tool does not, by itself, supply a running Harness timer. This package does not connect to QQ, WeChat, or X.

### Data and development

Memory lives in `DSH_ASSIST_HOME`, otherwise `DSH_HOME/dsh-assist`, or `~/.dsh/dsh-assist` when neither variable is set. Public export filters stored memory fields; it does not redact personal information written into the persona itself.

Standalone CLI and development require **Node.js 20.18+**. Core and CLI need no third-party runtime dependencies.

```powershell
node src/cli.js init --home "$PWD\.work\demo"
npm test
npm run check
npm run release
```

The release script builds local artifacts only. It does not publish to GitHub or npm.

### Documentation

This README is bilingual. The detailed guides are currently in Simplified Chinese.

[Installation & troubleshooting](docs/DESKTOP.md) · [Proactive chat](docs/IDLE.md) · [Persona format](docs/PACKS.md) · [CLI reference](docs/CLI.md) · [Verification scope](docs/VERIFICATION.md) · [Changelog](CHANGELOG.md)

---

## 简体中文

为 Harness 聊天加入可复用的人设、持续保存的记忆，以及无人回复时主动聊一句的能力。

> **当前为预发布版。** 面向 Harness Desktop **0.2.1-rc.3**，已通过离线与模拟宿主验证，尚未完成真实桌面端和模型实测。本项目是独立社区插件，并非 DeepSeek 官方产品。

### 功能概览

| 能力 | 说明 |
| --- | --- |
| 可移植人设 | 用版本化 JSON 封装身份、说话风格、开场白和记忆规则 |
| 持久记忆 | 长期记忆按角色共享，短期摘要按会话保存 |
| 主动聊天 | 显式开启后按空闲时间触发，支持冷却、安静时段和无人回应上限 |
| 角色分享 | 公开导出不含已存记忆，私人备份需要明确选择 |
| 可检查数据 | 本地 JSON 存储，配套 CLI 和格式文档 |

### 默认角色：爱吃白饭的大肥鱼女儿

她圆滚滚、俏皮、有自己的小主意，喜欢捧着小饭碗吃热乎乎的白饭。示例默认称呼你“爸爸”，可以随时要求更改称呼。

> “爸爸，大肥鱼女儿来啦！今天也想吃一碗热乎乎的白饭。你想先聊聊天，还是让我陪你做点事情？”

这是虚构角色的示例语气，实际措辞由模型生成。**全新存储首次初始化会默认选中她；已有角色与记忆不会被覆盖。**

**角色 ID：** `little-fish` · **人设文件：** [packs/fish.json](packs/fish.json)

### 下载与安装

在 [v0.2.0 发布页](https://github.com/a740411040/dsh-assist/releases/tag/v0.2.0) 下载：

| 文件 | 用途 |
| --- | --- |
| `dsh-assist-0.2.0.tgz` | 普通用户安装插件，无需解压 |
| `dsh-assist-0.2.0-source.zip` | 完整开发源码 |
| `dsh-assist-0.2.0-manifest.json` | SHA-256 校验清单 |

以下为 **Windows PowerShell** 步骤。桌面端自带运行环境，安装插件无需另行安装系统 Node.js/npm。

1. 先启动一次 Harness Desktop，完成 profile 初始化；在应用菜单的 **Manage dsh Command…** 中安装或修复桌面端命令。
2. **完全退出桌面端**，只关闭窗口可能仍在后台运行。
3. 打开新 PowerShell，确认 `dsh` 来自桌面端且版本为 `0.2.1-rc.3`，再安装：

```powershell
Get-Command dsh
dsh --version

$package = Join-Path $env:USERPROFILE 'Downloads\dsh-assist-0.2.0.tgz'
dsh plugin --profile desktop add $package
dsh plugin --profile desktop list
```

下载到其他位置时修改路径；命令报错时先处理错误。确认安装后重新打开应用。
不要使用全局 npm 安装的另一个 `dsh` 修改 desktop profile。

源码目录安装、已有用户切换人设和故障排查见 [安装指南](docs/DESKTOP.md)。

### 开启、查询与关闭主动聊天

在目标会话中发送：

> 请先调用 assist_list，用 assist_use 切换到 little-fish，再调用 assist_memory_read。
> 然后调用 assist_idle_start：空闲 15 分钟后主动聊天，两次至少间隔 30 分钟，连续两次没人回复就暂停，23:00–08:00 不打扰。

**只有工具返回 `enabled: true` 才算开启**，模型口头说“已开启”不代表计时器已经运行。

| 操作 | 工具 |
| --- | --- |
| 开启或修改设置 | `assist_idle_start` |
| 查询当前会话 | `assist_idle_status` |
| 停止未来触发 | `assist_idle_stop` |

安静时段按后端本地时区计算。**应用后端必须保持运行**；重启或会话卸载后需要重新启用。每次触发产生正常模型用量，停止不会撤回已提交的回合。

一分钟体验可设为 `idleMinutes: 1`、`cooldownMinutes: 1`、`maxUnanswered: 1`、`quietStart: 0`、`quietEnd: 0`。等回复完成后停止输入，约 60–75 秒应触发一个模型回合，实际回复还取决于模型速度。你再次回复前不应有第二次触发；体验后调用 `assist_idle_stop`。

完整参数见 [主动聊天说明](docs/IDLE.md)。只让 TRAE 等工具读取 [SKILL.md](SKILL.md)，不会自动获得 Harness 计时与唤醒能力。本包不连接 QQ、微信或 X。

### 数据与开发

记忆优先存放在 `DSH_ASSIST_HOME`，其次为 `DSH_HOME/dsh-assist`，均未设置时使用 `~/.dsh/dsh-assist`。公开导出会过滤已存记忆，但不会自动脱敏人设正文中的个人信息。

独立 CLI 和开发需要 **Node.js 20.18+**，核心与 CLI 无第三方运行依赖：

```powershell
node src/cli.js init --home "$PWD\.work\demo"
npm test
npm run check
npm run release
```

发布脚本仅生成本地产物，不自动上传 GitHub 或 npm。

### 文档导航

[安装与排错](docs/DESKTOP.md) · [主动聊天](docs/IDLE.md) · [角色包格式](docs/PACKS.md) · [CLI 命令](docs/CLI.md) · [验证范围](docs/VERIFICATION.md) · [更新日志](CHANGELOG.md)

---

Released under the [MIT License](LICENSE). · 本项目采用 [MIT 许可](LICENSE)。
