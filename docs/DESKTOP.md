# 下载、安装与故障排查

适用：**DeepSeek Harness 官方桌面应用 0.2.1-rc.3**。dsh-assist 是独立社区插件，
不是普通 DeepSeek 网页聊天的浏览器扩展，也不是一个新的桌面客户端。

当前为 v0.2.2 预发布版：离线测试与 Windows 桌面端安装、加载检查通过；真实模型主动聊天尚未验收。
其他 Harness 版本不要跳过兼容性检查；请先等待适配或在独立测试环境验证。

## 1. 下载安装包

打开 [v0.2.2 Release](https://github.com/a740411040/dsh-assist/releases/tag/v0.2.2)，
在 Assets 下载 `dsh-assist-0.2.2.tgz`。这个文件直接安装，**不需要解压 TGZ**。
可同时下载 `dsh-assist-0.2.2-manifest.json`，用 PowerShell 核对 TGZ 的 SHA-256：

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "$env:USERPROFILE\Downloads\dsh-assist-0.2.2.tgz"
```

结果应与清单中同名文件的 sha256 一致。下载位置不是 Downloads 时请修改路径。
`dsh-assist-0.2.2-source.zip` 是完整开发源码；不需要开发时只下载 TGZ 即可。

## 2. 准备桌面端自己的 dsh 命令

1. 安装并启动一次官方 Harness Desktop，让它完成 desktop profile 初始化。
2. 在应用菜单的 **Manage dsh Command…** 中选择 Install 或 Repair。
3. **完全退出** Harness Desktop。在 Windows 托盘菜单选择退出；仅关闭窗口可能仍在后台运行。
4. 打开新的 PowerShell，执行：

```powershell
Get-Command dsh
dsh --version
```

命令必须来自这份桌面端安装，版本应为 `0.2.1-rc.3`。
不要用全局 npm 安装的另一个 dsh 操作 desktop profile。
桌面端已带运行环境，插件安装不要求另行安装系统 Node.js/npm。

## 3. 安装并重新打开应用

```powershell
$package = Join-Path $env:USERPROFILE 'Downloads\dsh-assist-0.2.2.tgz'
dsh plugin --profile desktop add $package
dsh plugin --profile desktop list
```

确认列表中有 `dsh-assist`，然后重新打开 Harness Desktop。
若安装命令报错，先处理错误，不要直接继续下一步。

也可使用桌面端的 Plugins 页面进行宿主支持的本地包安装；
具体按钮随版本变化，上面的桌面端 CLI 流程更便于核对。
安装由宿主插件管理器负责，不修改桌面端源码。
插件需要宿主的 systemPrompt、tools、agents 服务及 dsh-tools SDK。

如果下载的是源码 ZIP，先解压并进入包含 `package.json`、`cordis.patch.yml` 的根目录，
完全退出桌面端后执行：

```powershell
$project = (Get-Location).Path
dsh plugin --profile desktop add $project
dsh plugin --profile desktop list
```

不要对整个 ZIP 文件执行 add。源码目录安装后保留该目录；
需要迁移位置时按宿主插件管理流程重新安装。

## 默认角色与已有安装

新存储首次初始化默认使用“爱吃白饭的大肥鱼女儿”，角色 ID 保留为 little-fish。
她默认称呼你“爸爸”，可以随时要求改称呼。默认人设见 [fish.json](../packs/fish.json)。
安装本身不会自动开启主动聊天；需要在目标聊天明确启用。

旧版本已初始化的存储不会被新包重置，因此旧 little-fish 可能仍保留原设定。
若希望保留旧角色和记忆，同时使用新示例，可在解压源码的根目录操作：

```powershell
New-Item -ItemType Directory -Path .work -Force
$role = Get-Content -LiteralPath .\packs\fish.json -Raw -Encoding utf8 | ConvertFrom-Json
$role.id = 'fat-fish-daughter'
$role | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath .\.work\fat-fish-daughter.json -Encoding utf8
node .\src\cli.js import .\.work\fat-fish-daughter.json --apply
node .\src\cli.js default fat-fish-daughter
```

此可选迁移需要 Node.js 20.18+，并且 CLI 与桌面端须使用相同的 DSH_ASSIST_HOME/DSH_HOME。
先按 [存储说明](DESIGN.md)备份；不要删除 state.json。
随后在已有聊天明确要求 assist_use 切换到 fat-fish-daughter；新角色不继承旧角色记忆。
若该 ID 已存在，选择另一个新 ID，导入不会覆盖现有角色。

## 4. 在聊天中启用角色和主动聊天

新建测试聊天，发送以下文字：

> 请先调用 assist_list，然后用 assist_use 切换到 little-fish，再调用
> assist_memory_read。接下来使用这个角色聊天。

看到工具成功返回后，继续发送：

> 开启当前聊天的主动聊天：我 15 分钟不说话时可以主动聊一句，
> 两次至少间隔 30 分钟，连续两次没人回复就暂停，23 点到早上 8 点不要打扰。
> 请调用 assist_idle_start 并告诉我是否成功。

只有 `assist_idle_start` 返回 `enabled: true` 才算启用。
仅口头说“已开启”、读取 SKILL.md 或导入角色 JSON 不会创建计时器。

- 查询：“请调用 assist_idle_status，查看当前主动聊天状态。”
- 关闭：“请调用 assist_idle_stop，关闭当前聊天的主动聊天。”
- 所有操作只作用于当前聊天。其他聊天需要分别启用。

默认后端本地时区、参数范围、停止的边界见 [主动聊天说明](IDLE.md)。
触发会使用模型服务并产生正常用量。应用后端必须保持运行；
重启、插件卸载或会话卸载后需要重新启用，记忆数据不会因此删除。

## 5. 一分钟实机验收

在测试聊天要求模型调用 assist_idle_start，参数如下：

```json
{"idleMinutes":1,"cooldownMinutes":1,"maxUnanswered":1,"quietStart":0,"quietEnd":0}
```

等启用后的回复完成，停止输入。约 60–75 秒应触发一个模型回合；
实际回复到达时间还取决于模型响应速度。继续等待不应出现第二次触发。
再发一条真实消息，等待回复结束后，可再次触发一次。
最后调用 assist_idle_stop，确认今后不再自动触发。

stop 不撤回已经提交的回合；终止当前生成用宿主停止按钮。
宿主停止按钮本身不会关闭订阅。当前项目的自动测试使用模拟宿主，
上面这些步骤仍需要在实际应用完成。

## 故障排查

| 现象 | 检查方式 |
|---|---|
| 找不到 dsh | 在桌面端修复 Manage dsh Command，再打开新终端 |
| desktop profile 不存在 | 先启动桌面端一次并完成初始化，再完全退出 |
| profile 正在使用或锁冲突 | 从应用/托盘菜单完全退出，确认没有并行安装命令 |
| 版本不兼容 | 核对 dsh --version；当前仅声明目标 0.2.1-rc.3，不强制绕过检查 |
| 没有 assist_* 工具 | 检查插件列表、是否重新启动、宿主启动日志与服务加载错误 |
| 模型只说已开启却不主动聊 | 让它实际调用 assist_idle_status；未启用则明确要求调用 start |
| enabled=true 仍不触发 | 查看 pausedReason；核对安静时段/时区，是否忙碌、排队或达到无人回应上限 |
| error 暂停 | 查看 lastError，修复宿主/模型问题后明确重新 start；不要无限重试 |
| 重启后不主动聊 | 预期行为，需要重新启用；计时订阅不写入长期记忆 |
| 记忆无法读写 | 不要删除 state.json 修复，先备份并查看 [存储恢复说明](DESIGN.md) |

仍有问题可在 [Issues](https://github.com/a740411040/dsh-assist/issues) 提供版本、
操作系统、复现步骤和已脱敏错误。不要上传账号凭据、私人角色包、state.json 或完整对话。

## 卸载

通过桌面端 Plugins 页面卸载；或完全退出应用后，用桌面端自己的 CLI 执行：

```powershell
dsh plugin --profile desktop remove dsh-assist
```

重新打开应用后插件不再加载。卸载会撤销插件未来的计时触发，
已有私人数据不自动删除，方便恢复。项目不提供删除私人数据的卸载脚本。

## 官方接口来源

- [Desktop 命令与 profile 所有权](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md)
- [插件管理与安装来源](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md)
- [Agent 唤醒与事件](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md)
