# dsh-assist

为 DeepSeek Harness 添加可复用角色、长期／短期记忆，以及空闲时主动聊天能力。默认住着一只爱吃白饭的大肥鱼女儿：圆滚滚、俏皮、有主见，也能在你没说话时主动聊一句。

> dsh-assist 是社区插件，并非 DeepSeek 官方产品。当前版本为 0.2.0 预发布版，面向 DeepSeek Harness Desktop 0.2.1-rc.3；尚未在真实 Desktop 和模型环境中验证。遇到问题请查看[故障排查](docs/DESKTOP.md#故障排查)。

## 下载

从 [GitHub Releases v0.2.0](https://github.com/a740411040/dsh-assist/releases/tag/v0.2.0) 下载：

- `dsh-assist-0.2.0.tgz`：Desktop 插件安装包。
- `dsh-assist-0.2.0-source.zip`：开发者源码。
- `dsh-assist-0.2.0-manifest.json`：SHA256 校验清单。

GitHub 的 **Source code (zip)** 也可用于源码开发；解压后在本地文件夹操作即可。

## 安装到 Desktop

Desktop 自带运行环境，无需全局安装 npm。先在应用菜单中选择 **Manage dsh Command** 安装或修复 Desktop 管理的 `dsh`，启动一次 Desktop 以初始化 profile，然后完全退出 Desktop；仅关闭窗口可能只是隐藏。

打开新的 PowerShell，确认命令来自 Desktop：

```powershell
Get-Command dsh
dsh --version
```

必须使用 Desktop 提供的 CLI；npm 全局安装的 `dsh` 不能修改 Desktop profile。

进入安装包所在目录，例如：

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Downloads')
$package = Join-Path $env:USERPROFILE 'Downloads\dsh-assist-0.2.0.tgz'
dsh plugin --profile desktop add $package
dsh plugin --profile desktop list
```

重新打开 Desktop。更多说明见 [Desktop 指南](docs/DESKTOP.md)。

## 使用角色与记忆

新安装首次初始化会默认选中“大肥鱼女儿”（角色 ID：`little-fish`）。她爱吃白饭，默认称呼用户“爸爸”，你可以随时要求改称呼。在聊天中发送：“请先调用 assist_list，再用 assist_use 切换到 little-fish，最后调用 assist_memory_read。”角色 JSON 带版本信息；跨宿主可复用角色和核心 CLI，但 Harness 空闲聊天需要本插件提供的原生能力。

状态默认保存在 `DSH_ASSIST_HOME`；未设置时使用 `DSH_HOME/dsh-assist`，再回退到 `~/.dsh/dsh-assist`。公开导出不含已存记忆；私人备份需明确执行。角色源文本仍可能包含个人信息，分享前请检查。

SKILL 指南不是安装器；仅让 TRAE 阅读指南不会获得宿主定时器能力。

已有安装不会覆盖旧角色和记忆。默认角色文件见 [packs/fish.json](packs/fish.json)，
想切换新版设定请看 [默认角色与已有安装](docs/DESKTOP.md#默认角色与已有安装)。

> “爸爸，大肥鱼女儿来啦！今天也想吃一碗热乎乎的白饭。你想先聊聊天，还是让我陪你做点事情？”

这是虚构角色的示例开场白，实际措辞由模型生成，不会固定重复。

## 开启空闲主动聊天

明确告诉助手所需参数，例如：空闲 15 分钟后主动聊天、冷却 30 分钟、最多连续未回复 2 次、安静时段 23:00 至次日 08:00。

调用 `assist_idle_start`，仅当返回成功且 `enabled: true` 才表示已启用。用 `assist_idle_status` 查询，用 `assist_idle_stop` 停止。

一分钟体验参数：

```json
{
  "idleMinutes": 1,
  "cooldownMinutes": 1,
  "maxUnanswered": 1,
  "quietStart": 0,
  "quietEnd": 0
}
```

等启用后的回复完成，再停止输入；约 60–75 秒应触发一次模型回合，实际回复时间还取决于模型速度。人工回复前不会触发第二次，体验后请调用 assist_idle_stop。

注意：

- 仅在应用后端存活时运行；重启或卸载后的会话需要重新启用。
- 停止只影响未来任务，已排队任务仍可能继续。
- 安静时段按后端本地时区计算，主动聊天会产生正常模型费用。
- 不连接 QQ、微信或 X，也不保证操作系统通知。
- 消息来源类型是插件而非真人；空闲机制不能重置自身未回复预算。

完整参数与行为见 [空闲聊天指南](docs/IDLE.md)。

## 开发与检查

仅独立 CLI 和源码开发需要 Node.js 20.18+。核心 CLI 无第三方运行依赖。

```powershell
node src/cli.js init --home "$PWD\.work\demo"
npm test
npm run check
npm run release
```

`npm run release` 仅执行离线本地流程，不负责发布。安装包也可作为 pnpm 支持的本地 tarball package spec 使用。

## 文档与许可

- [Desktop 安装与故障排查](docs/DESKTOP.md)
- [空闲主动聊天](docs/IDLE.md)
- [角色包格式](docs/PACKS.md)
- [CLI 命令](docs/CLI.md)
- [验证范围](docs/VERIFICATION.md)
- [更新日志](CHANGELOG.md)

本项目采用 [MIT License](LICENSE)。
