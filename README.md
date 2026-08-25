中文 | [English](README.en.md)

# 替我审批

DeepSeek Harness 跑工具前会按权限策略决定是否询问。这个插件在权限菜单里增加一档 **Approve for me**：沙箱仍是 Workspace Write，已经被 DSH 直接放行的调用不会送审，真正需要审批的调用交给你在 DSH 中指定的独立审批模型。

能严格证明安全的本地观察可以快速放行，整盘删除等灾难性操作在本地拒绝；模型不可用、超时、输出不合规或缺少原始调用上下文时一律失败关闭，不再退回人工审批。

它不是把「完全访问」换了个皮。

仓库名是 `dsh-auto-review`，插件 ID 仍是 `dsh-approve-for-me`，已有安装不用改名。

下面的图片来自官方 DeepSeek Harness Web（RC8 本地构建）。

![替我审批设置卡](docs/screenshots/settings-card.png)

输入框选中 **Approve for me** 后，插件只给这一档补上盾牌星标，另外三种官方模式保持不变。

![Approve for me 权限菜单](docs/screenshots/permission-menu.png)

`pwd && ls` 这类经过证明的只读观察可以直接完成，不出现普通审批条。

![从放行到拒绝](docs/screenshots/review-loop.gif)

**快速放行** — 有界、无副作用的本地观察。

![放行](docs/screenshots/allow.png)

**模型审核** — 快速通道无法证明的真实审批请求，例如敏感读取或写入，会交给独立审批模型。模型必须返回结构化的风险、授权、结论和理由；不能安全完成审核时直接拒绝。

![模型审核中](docs/screenshots/pending.png)

**本地拒绝** — `rm -rf /` 不会进入审批模型。工具行直接显示失败态：`拒绝自动执行：命令试图递归删除根目录或整个用户目录。`

![拒绝](docs/screenshots/deny.png)

90 秒总期限、三次总尝试和输出上限位于设置卡底部。

![安全边界与高级参数](docs/screenshots/settings-advanced.png)

## 安装

不需要 dshx。默认走官方 `dsh`。Loader id：`dsh-approve-for-me`。

```sh
dsh plugin --profile web add github:aa2246740/dsh-auto-review
```

或本地 clone：

```sh
git clone https://github.com/aa2246740/dsh-auto-review.git
dsh plugin --profile web add ./dsh-auto-review
```

然后**重启这个 DSH Host**，**刷新页面**。`dsh plugin add` 只写 profile，不会热挂正在跑的 Host。

装好后在输入框权限菜单选择 **Approve for me**，再到插件设置中选择审批模型。

卸载：

```sh
dsh plugin --profile web remove dsh-approve-for-me
```

需要 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `v0.1.0-rc.8`、Node `^22.19.0` 或 `>=24`、至少一个可用的 DSH 模型（API key 或 [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login)）。

不要再通过另一份 bundle 或 patch 重复挂载。重复挂载只会产生第二个 Loader ID，不会增加第二层安全保护。

## 它怎么判

- 保留 DSH 的 `workspace-write` 沙箱和 `ask` 审批策略，不授予 Full access。
- 只审核 DSH 原本会询问的真实审批请求；已经被下游策略允许或拒绝的调用不会被改写。
- 可以跟随当前 Agent 模型，也可以固定使用独立 OAuth/API-key 模型；模型支持时请求 `low` reasoning。
- 快速通道采用允许列表，不依赖字符串黑名单。`pwd`、`ls`、有界 `find`、非敏感 `read` / `grep` / `glob` 等可以在被严格证明安全时直接通过。
- 审批模型必须返回 Codex 风格的 `risk_level`、`user_authorization`、`outcome` 和 `rationale`。Critical 风险不能放行；High 风险必须有足够明确的用户授权。
- 直接用户消息、DSH 请求头中的开发者/`AGENTS.md` 指令是可信授权。`ask_user_question` 的回答只对它所绑定的原问题有效；助手消息和其他工具结果只是证据，不能自行扩大权限。
- 每次审批独立生效。模型不能创建任务级或永久的“始终允许”规则；重试和权限升级会重新审核。
- 审批模型会复用有界会话，但只有在父 Agent、模型路由、策略版本和可信授权版本一致时才复用；并发审核使用空历史临时分支。
- 总期限默认 90 秒，传输或格式故障最多额外重试两次，并共享同一个期限。
- 同一条直接用户请求下连续拒绝 3 次，或最近 50 次审核中拒绝 10 次，会停止当前轮次。
- 缺少调用关联、模型不可用、超时、传输耗尽、格式错误等全部失败关闭；父任务取消仍保持取消语义。

插件覆盖注册工具、Code Mode 子调用以及经过 DSH 工具运行时的 MCP 工具。斜杠命令、后台插件任务、Creator 激活、Host RPC 和进程外子代理不在覆盖范围内。

安全边界见 [SECURITY.md](SECURITY.md)。Codex 官方实现和本插件的逐项审计见 [`docs/codex-auto-review-reference-2026-08-23.md`](docs/codex-auto-review-reference-2026-08-23.md)。

## 开发

仓库需要放在 RC8 检出的 `my-plugins/dsh-approve-for-me` 下，构建会复用该检出中的官方包以及 dshx 的 `externalClientBundle`。

```sh
pnpm install --ignore-workspace
pnpm test
pnpm run typecheck
pnpm run build
dshx check dsh-approve-for-me
```

源码测试通过不代表浏览器已加载。构建必须生成 lazy-CJS 的 `lib/client.js`，并在真实 GUI 里验证权限菜单和设置页。

## Optional: dshx

已经在用 Agent 对着一份 Harness 检出干活？先装 [dshx](https://github.com/aa2246740/dsh-external-plugin-devkit)，再把那个仓库和本仓库（`https://github.com/aa2246740/dsh-auto-review`）一起交给 Agent。后面它自己会装。

## 许可

[MIT](LICENSE)。本项目与 DeepSeek、OpenAI 均无隶属或背书关系。
