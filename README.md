中文 | [English](README.en.md)

# 替我审批

DeepSeek Harness 跑工具前会按权限策略决定是否询问。这个插件在权限菜单里加一档 **Approve for me**：沙箱仍是 Workspace Write。已经被 DSH 直接放行的调用不会送审。真正需要审批的调用交给你在 DSH 里指定的独立审批模型。

能严格证明安全的本地观察可以快速放行。整盘删除这类操作在本地拒绝。模型不可用、超时、输出不合规或缺少原始调用上下文时直接失败关闭，不再退回人工审批。

仓库名是 `dsh-auto-review`，插件 ID 仍是 `dsh-approve-for-me`。已有安装不用改名。

![替我审批设置卡](docs/screenshots/settings-card.png)

![Approve for me 权限菜单](docs/screenshots/permission-menu.png)

![从放行到拒绝](docs/screenshots/review-loop.gif)

![放行](docs/screenshots/allow.png)

![模型审核中](docs/screenshots/pending.png)

![拒绝](docs/screenshots/deny.png)

![安全边界与高级参数](docs/screenshots/settings-advanced.png)

输入框选中 **Approve for me** 后，插件只给这一档补盾牌星标。另外三种官方模式不变。

## 安装

Loader id：`dsh-approve-for-me`。

```sh
dsh plugin --profile web add github:aa2246740/dsh-auto-review
```

或本地 clone：

```sh
git clone https://github.com/aa2246740/dsh-auto-review.git
dsh plugin --profile web add ./dsh-auto-review
```

然后重启这个 DSH Host，刷新页面。装好后在输入框权限菜单选 **Approve for me**，再到插件设置里选审批模型。不要再通过另一份 bundle 或 patch 重复挂载。

```sh
dsh plugin --profile web remove dsh-approve-for-me
```

需要 DeepSeek Harness `v0.1.0-rc.8`、Node `^22.19.0` 或 `>=24`、至少一个可用的 DSH 模型。API key 或 [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) 都可以。

## 怎么判

- 保留 DSH 的 `workspace-write` 沙箱和 `ask` 审批策略，不授予 Full access。
- 只审核 DSH 原本会询问的请求。
- 可以跟随当前 Agent 模型，也可以固定独立模型。模型支持时请求 `low` reasoning。
- 快速通道是允许列表：`pwd`、`ls`、有界 `find`、非敏感 `read` / `grep` / `glob` 等，只有被证明安全时才直接过。
- 审批模型必须返回 `risk_level`、`user_authorization`、`outcome`、`rationale`。Critical 不能放行。High 必须有足够明确的用户授权。
- 每次审批独立生效。模型不能创建「始终允许」。
- 总期限默认 90 秒。传输或格式故障最多再试两次，共用这个期限。
- 缺少调用关联、模型不可用、超时、格式错误全部失败关闭。

覆盖注册工具、Code Mode 子调用，以及经过 DSH 工具运行时的 MCP 工具。斜杠命令、后台插件任务、Creator 激活、Host RPC 和进程外子代理不在范围内。

安全边界见 [SECURITY.md](SECURITY.md)。

## 开发

仓库放在 RC8 检出的 `my-plugins/dsh-approve-for-me` 下。

```sh
pnpm install --ignore-workspace
pnpm test
pnpm run typecheck
pnpm run build
dshx check dsh-approve-for-me
```

## 许可

[MIT](LICENSE)。
