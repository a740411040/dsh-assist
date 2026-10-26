# CLI

运行方式：`node src/cli.js <命令> [参数] --home <绝对目录>`。
公开发布后也可使用包提供的 dsh-assist 命令；当前无需安装即可从源码运行。

| 命令 | 参数 | 行为 |
|---|---|---|
| init | 无 | 在空存储初始化大肥鱼女儿；已存在则验证而非重置 |
| list | 无 | 列出角色 ID 与名称 |
| status | 无 | 版本修订号、默认角色、已绑定会话 |
| validate | 文件 | 校验角色或导出包，不写入 |
| import | 文件 [--apply] [--include-memory] | 默认预览，显式应用；拒绝同 ID 覆盖 |
| export | 角色ID --out 文件 [--include-memory] | 默认公开包；目标文件必须不存在 |
| default | 角色ID | 修改新会话默认角色 |
| use | 会话ID 角色ID | 只切换指定会话 |
| show | 会话ID | 当前角色与有界长期/短期记忆 |
| remember | 会话ID 文本 [--kind 类型] | 保存 fact/preference/decision/inference |
| checkpoint | 会话ID 摘要 [--ttl 小时] | 短期摘要，默认72小时，范围1–720 |
| recall | 会话ID 查询 | 按关键词检索当前角色长期记忆 |
| resume | 当前会话ID 来源会话ID | 显式续接同角色的有效短期摘要 |
| revise | 会话ID 条目ID 新文本 | 更正当前角色已有长期条目 |

带空格或特殊字符的文本使用 PowerShell 单引号。参数错误退出非零。
--help 不创建存储。其他命令 JSON 输出，失败写 stderr。
CLI 无模型调用、无后台进程、无 shell 子命令。

私人备份：

```powershell
node .\src\cli.js export little-fish --out .\fish.private.json --include-memory --home "$PWD\.work\demo"
node .\src\cli.js import .\fish.private.json --apply --include-memory --home "$PWD\.work\restored"
```

备份包含角色和角色记忆，不包含原来的全局默认设置或会话绑定。
角色共享的长期记忆恢复后立即可用；旧短期摘要与原会话标识关联，
不会自动转移到一个不同 ID 的新聊天。不要将私人包上传公开仓库。
