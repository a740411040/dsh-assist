# Changelog

## 0.2.1 — 2026-10-27

- Bundle the rice-loving whale-girl illustration and generation notes in both TGZ and source ZIP.
- Refresh the English-first bilingual README and versioned installation/download links.
- No runtime behavior changes; existing persona data and memories are preserved.

- 安装包与源码包加入爱吃白饭的鲸鱼娘插画及生成说明。
- 更新英文在上的双语 README 与版本化下载安装链接。
- 无运行时行为变更；保留已有角色与记忆，主动聊天仍需明确启用。

## 0.2.0 — 2026-10-27

- 默认示范改为爱吃白饭的大肥鱼女儿；新存储首次启用使用此角色，保留已有用户数据。
- GitHub 发布首页、下载安装步骤、启用/关闭/一分钟验收及已有安装说明。

- 会话内显式启用的主动聊天，通过宿主 followup 唤醒原会话模型。
- 空闲等待、冷却、连续无人回应上限及本地时区安静时段。
- 用户回来后恢复，忽略插件自己的输入；忙碌/排队/子代理隔离。
- 查询、关闭、卸载清理及失败暂停；重启不自动恢复计时订阅。
- 可复制配置示例、中文使用说明及假时钟行为测试。

## 0.1.0 — 2026-10-27

- 可分发的 JSON 角色包，严格版本与字段校验。
- 按角色保存长期记忆，按角色和会话保存带有效期的短期摘要。
- 会话角色绑定、显式续接、记忆检索与修订。
- 默认不含记忆的公开导出，以及显式启用的私人备份。
- 官方 Harness 插件适配与离线 CLI。
- 内置示例、行为测试、打包检查与安装文档。
