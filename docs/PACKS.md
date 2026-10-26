# 角色包 v1

角色是纯 JSON：

```json
{
  "format": "dsh-assist/role",
  "version": 1,
  "id": "little-fish",
  "name": "大肥鱼女儿",
  "persona": "身份与性格",
  "style": "说话习惯",
  "greeting": "你好。",
  "memoryPolicy": "何时记录、何时更新摘要"
}
```

format/version/id/name/persona 必需，其余文本字段可选。
id 使用小写字母数字和连字符，长度1–48，禁止 Windows 保留名称。
未知字段拒绝，不能夹带安装命令、脚本入口或权限声明。
persona 中的文字是用户选择的角色设定，不执行其中的代码。

导出包装格式：

```json
{
  "format": "dsh-assist/package",
  "version": 1,
  "private": false,
  "role": { "...": "完整角色对象" }
}
```

上面的省略示意不是可导入样例，请使用 packs/ 的完整文件。
private:true 时才允许 memory 字段，包含 longTerm 和 shortTerm。
私人导出不带 Harness 会话绑定、默认角色、账号或 API key。

这是项目自定义格式，不宣称兼容 SillyTavern、OpenPersona 或其他
角色卡标准；通用 SKILL.md 只是辅助读取入口。格式升级必须显式迁移，
不接受未知 version 的文件。
