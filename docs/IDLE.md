# 主动聊天与重启恢复

v0.3.0 会记住你明确开启的会话。插件定时调用原会话的 `followup()`，由所选模型结合人设与记忆回复；不是预先写好的聊天文本。

## 首次启用一次

按[桌面端安装说明](DESKTOP.md)安装 v0.3.0。在希望陪聊的会话发送：

> 请用 assist_use 切换到 little-fish。我同意在本会话开启主动聊天，请调用 assist_idle_start，再调用 assist_idle_status 确认。

start 成功返回 `enabled: true`、`remembered: true` 后，才算保存了启用状态。
旧版 v0.2.x 的内存计时订阅无法迁移；升级后首次需重新启用一次。新会话不会自动开启。
只读 SKILL.md、导入角色 JSON 或运行记忆 CLI 都不会授权主动聊天。

| 参数 | 默认 | 范围 |
|---|---:|---|
| idleMinutes | 15 | 整数 1–1440，空闲等待分钟数 |
| cooldownMinutes | 30 | 整数 1–1440，两次主动触发的最短间隔 |
| maxUnanswered | 2 | 整数 1–5，连续无人回应时的上限 |
| quietStart | 23 | 0–23，安静时段开始小时，包含边界 |
| quietEnd | 8 | 0–23，安静时段结束小时，不包含边界 |

参数是工具输入，示例见 [idle-settings.json](../examples/idle-settings.json)，不属于角色 JSON。
安静时段使用后端本地时区，status 中的 timeZone 可供核对；起止相等表示不设安静时段，支持跨午夜。
每 15 秒检查一次，到期后可能稍晚触发。

## 重启后如何恢复

- 只恢复曾经成功 start 的会话，不为其他会话新增授权。
- 桌面端重新加载原会话的主 agent 后恢复；通常需要打开原会话。插件不会自行加载所有历史聊天。
- 恢复时重新等待完整空闲时间与冷却时间，不立即补发关机期间错过的消息。
- 间隔、安静时段和连续无人回应次数保留。已到上限的会话继续暂停，直到收到真正的人类消息。
- 保存的错误暂停也保留；需明确重新 start 才重试。
- status 返回 `restored: true` 表示当前订阅从保存状态恢复。检查状态用 status，不要为了查询反复 start 重置次数。
- 已保存最多 200 个会话；重建的主 agent 必须具有相同稳定 session ID。子代理不能继承。
- 多个控制器竞争相同保存状态时，过期控制器暂停，不能覆盖新授权或复活已关闭的会话。

## 查询、关闭与调整

- “请调用 assist_idle_status”查询当前会话。
- “请调用 assist_idle_stop”关闭当前会话，并删除保存的启用状态；成功关闭后重启不会恢复。
- 明确重新调用 start 可以调整设置、重新计时并重置次数。
- 若 stop 报告无法保存，当前进程已停止该会话的触发，但持久关闭未完成；先处理提示的存储错误并重试，不要把报错当作成功。

会话忙碌、有排队输入、处于安静时段或达到上限时不触发。
只有 source.kind=user 的真正用户输入重置无人回应次数，插件触发消息不会重置。
派发前先保存配额占用及暂停标记，确认提交后才解除标记；中途崩溃或确认写入失败会保留暂停，需明确 start 才重试。
保存失败时暂停发送。若暂停本身无法保存，lastError 会明确提示重启可能恢复，需处理存储问题后确认状态。已提交但模型失败的回合仍占一次触发次数。

## 运行与数据位置

**应用后端必须保持运行**；退出后端、睡眠或关机时不会聊天，也不是系统计划任务。
会话卸载、插件停用/卸载时清除运行中的计时器。保存的设置会保留，重新加载插件和原会话后可恢复。
如果不希望重装后恢复，先对相关会话调用 stop。停止和卸载不能撤回已经提交的模型回合。

启用记录单独保存在插件 home 下的 `idle-consents.json`，与 `state.json` 中的角色和记忆分离。
它包含会话 ID、设置、计数及暂停状态，不包含聊天正文、密钥或模型凭据；不会进入公开角色导出和项目发布包。
写入使用文件锁、版本检查和原子替换。损坏文件或异常路径不会被静默覆盖，也不会自动发消息。

每次触发会调用所选模型并产生正常用量，仍遵守宿主审批。
插件不包含 QQ、微信、X 推送，也不保证操作系统通知弹出。

## 一分钟试用与恢复验收

在测试聊天明确 start：
`{"idleMinutes":1,"cooldownMinutes":1,"maxUnanswered":1,"quietStart":0,"quietEnd":0}`。

等待回复完成后保持不输入，约 1 分钟至 1 分 15 秒应触发一次，实际回复速度取决于模型。
未回应前继续等待或重启，不应额外触发。返回原会话并发一条真正的消息，会重置次数。
另可在尚未触发时重启，打开原会话、查询 status，确认 remembered/restored，再等待完整间隔。
最后 stop，重启后 status 应报告未启用。

离线测试覆盖重启、首次输入、等待/冷却、上限、夜间、停止、崩溃前配额和并发保存。
已验证 Windows Desktop 安装与组件加载；真实模型的主动聊天回合尚未完成验收。

接口来源：[Agent 公共接口](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md)、
[事件与状态](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/src/runtime-types.ts)、
[消息来源](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/message.ts)。
