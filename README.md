中文 | [English](README.en.md)

# 替我审批

```sh
dsh plugin --profile web add github:aa2246740/dsh-auto-review
```

当前版本 **0.4.1**；**`main` 是唯一维护分支**。插件 ID 仍为 `dsh-approve-for-me`，安装时无需改名或选择兼容分支。

需要 DeepSeek Harness **0.1.7-rc.2**（peer `>=0.1.7-rc.1 <0.1.8`，接受 `0.1.7-rc.2`，拒绝 `0.1.7` alpha）、Node `^22.19.0` 或 `>=24`，以及 PATH 中的 `pnpm`。仓库包含编好的 `lib/`，普通安装不需要构建或 Creator Mode。官方 `dsh plugin add` 写入下次启动的 profile 组合；首次安装后，通过原启动器重新打开该 Host，再刷新页面。

在 DeepSeek Harness 的权限菜单选择 **Approve for me** 后，对 DSH 原本会询问的注册工具调用进行独立模型审核。沙箱仍是 Workspace Write；全局开关不等于当前会话已启用，也不会改变用户的 `never` 策略或升级成 Full access。

没有全局 `dsh` 命令时，可用 `npx @deepseek-ai/dsh plugin --profile web add github:aa2246740/dsh-auto-review`。安装包和 SHA-256 校验文件见 [最新 Release](https://github.com/aa2246740/dsh-auto-review/releases/latest)。

## 当前功能

- **故障不再伪装成危险操作拒绝。** 模型离线、超时、传输/格式错误默认暂停本次动作，交给官方人工审批。无人工答复、人工拒绝、取消都不会执行。高级设置仍可选择严格拒绝。
- **审核有完整总期限。** 默认 90 秒，覆盖模型解析、网络等待及最多两次额外重试；即使服务商忽略取消信号，晚到结果也不能成为许可。
- **可查看审核记录。** 设置 → 自动审批，提供概览、规则、审核历史、高级四页，以及中英文设置卡。审批决定与工具返回结果分开显示；工具成功不等于插件功能验收成功。
- **规则由用户显式管理。** 精确会话、工具、阶段、参数指纹或固定插件，最长 30 天；支持人工确认、拒绝、预览、编辑、撤销、版本冲突提示。规则操作也进入历史。预览不执行工具，没有重放历史动作的接口。
- **不猜测 Creator 的来源。** 当前公开协议不能证明工具注册来源与最终执行绑定，所以保存规则的免审放行通道保持关闭。现有独立 AI 审核仍可判断 Creator+ 注册工具；普通 Creator 的独立 `cordis/request-run` 仍使用官方单版本人工审批，不会自动批准未来版本。

明确的安全拒绝、已有 guard 拒绝以及有效 `never` 策略不会因为模型或审计存储故障变成允许。每次原生审批单独决定；不能按请求对象、相同工具名或重用 callId 缓存一次性许可。

## 使用与数据

1. 会话权限菜单选 **Approve for me**。
2. 设置 → **自动审批** → 概览，选择跟随会话模型或固定模型；故障处理默认“人工审批”。
3. 在审核历史查看新记录，按会话、状态、工具筛选；可从记录创建规则草稿。历史只覆盖安装此版本后进入本插件的请求，不是完整会话日志，不反向补造旧模型解释。

插件存储为 `$DSH_HOME/approve-for-me/history-v1.json`，未设置 Home 时使用 `~/.dsh`。新目录权限 0700、原子替换文件 0600；默认保留 30 天、最多 1000 条（配置范围 1–365 天、100–10000 条）。只保留有界、脱敏的元数据和参数摘要，不保存完整程序/文件正文。导出只包含当前页的字段白名单；自动脱敏不能识别任意形式的秘密，分享前仍应复核。

存储损坏或不可写时展示健康错误、保留原文件，并停止新的自动许可；确定的拒绝仍然拒绝。卸载/HMR 不恢复待决许可。这个插件不是文件完整性沙箱，不能约束同用户权限的任意本机程序，见 [SECURITY.md](SECURITY.md)。

## 安装、更新与验证

插件 ID 保持 `dsh-approve-for-me`，仓库名仍为 `dsh-auto-review`。使用官方插件管理器安装一次，不要通过多个 bundle/patch 重复挂载。

本版本面向带有公共 Connection Fetch、configForms、locale、settings.section 与 settings.plugins.tab 的官方 WebUI；新增客户端/连接依赖以包内 `package.json` 为准。Node 要求 `^22.19.0` 或 `>=24`。

已有 Creator+ 安装保持原目录：构建、`dshx_check` 后，服务端通过受控 `dshx_hot_reload`，客户端按 client 分支验证。是否需要页面刷新或外部启动器操作必须遵循 DSHX 证据，不能一律重启 Host、另开端口或修改核心。构建、模块替换、客户端加载、功能验收是不同状态。

```sh
pnpm test
pnpm run typecheck
pnpm run build
```

构建使用 DSHX 的外部客户端适配器；目标 Harness 配置见 [开发说明](docs/development.md)。

旧版截图仍保留在 `docs/screenshots/`，不代表本次四页管理界面已完成浏览器验收。新版不再装饰官方权限菜单 DOM。

## 许可

[MIT](LICENSE)。
