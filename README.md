中文 | [English](README.en.md)

# 替我审批

```sh
dsh plugin --profile web add github:aa2246740/dsh-auto-review
```

这条命令走官方 `dsh plugin add`：它在 `$DSH_HOME/profiles/web` 里调用 [pnpm](https://pnpm.io)，所以 PATH 上要有 `pnpm`。没有 `dsh` 时用 `npx @deepseek-ai/dsh plugin --profile web add github:aa2246740/dsh-auto-review`。装完**重启这个 Host，再刷新页面**。`add` 只写 profile，不会热挂正在跑的进程。

仓库已提交编好的 `lib/`，并声明 `dsh.bundle.patch`。面向 DeepSeek Harness **0.1.5-rc.2** 的 stock 用户：不要走 Creator Mode，也不需要再 clone 一份插件目录。

Loader id：`dsh-approve-for-me`。仓库名是 `dsh-auto-review`，已有安装不用改名。

DeepSeek Harness 跑工具前会按权限策略决定是否询问。这个插件在权限菜单里加一档 **Approve for me**：沙箱仍是 Workspace Write。已经被 DSH 直接放行的调用不会送审。真正需要审批的调用交给你在 DSH 里指定的独立审批模型。

能严格证明安全的本地观察可以快速放行。整盘删除这类操作在本地拒绝。模型不可用、超时、输出不合规或缺少原始调用上下文时直接失败关闭，不再退回人工审批。

![替我审批设置卡](docs/screenshots/settings-card.png)

![Approve for me 权限菜单](docs/screenshots/permission-menu.png)

![从放行到拒绝](docs/screenshots/review-loop.gif)

![放行](docs/screenshots/allow.png)

![模型审核中](docs/screenshots/pending.png)

![拒绝](docs/screenshots/deny.png)

![安全边界与高级参数](docs/screenshots/settings-advanced.png)

输入框选中 **Approve for me** 后，插件只给这一档补盾牌星标。另外三种官方模式不变。装好后在输入框权限菜单选 **Approve for me**，再到插件设置里选审批模型。不要再通过另一份 bundle 或 patch 重复挂载。

本地 clone 时同样用官方 CLI（仍需要 pnpm）：

```sh
git clone https://github.com/aa2246740/dsh-auto-review.git
dsh plugin --profile web add ./dsh-auto-review
```

```sh
dsh plugin --profile web remove dsh-approve-for-me
```

需要 DeepSeek Harness `0.1.5-rc.2`、Node `^22.19.0` 或 `>=24`、至少一个可用的 DSH 模型。API key 或 [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) 都可以。

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

```sh
pnpm install --ignore-workspace
pnpm test
```

`dsh plugin add github:` 加载的是仓库里的 `lib/`。改源码后重新构建并一起提交 `lib/`。

## 许可

[MIT](LICENSE)。
