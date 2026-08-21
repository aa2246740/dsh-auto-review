中文 | [English](README.en.md)

# 替我审批

DeepSeek Harness 跑工具前会停下来问你。这个插件在权限菜单里加了一档 **Approve for me**：沙箱还是 Workspace Write，但能证明安全的观察不再弹窗，整盘删除当场拒绝，其余交给你已经在 DSH 里配好的模型。模型失败、超时或不敢判，就还是问你。

它不是把「完全访问」换了个皮。

仓库叫 `dsh-auto-review`，插件 ID 仍是 `dsh-approve-for-me`，已经装过的不用改名。

![替我审批设置卡](docs/screenshots/settings-card.png)

三种真实判定：`ls src` 直接过，读 `.env` 交给模型，`rm -rf /` 本地拒绝。

![从放到拒](docs/screenshots/review-loop.gif)

**放行** — 有界、没副作用的本地观察，不必弹窗。

![放行](docs/screenshots/allow.png)

**先问模型** — 快速通道证明不了，比如读 `.env`。模型也不敢判就还是问你。

![先问模型](docs/screenshots/pending.png)

**拒绝** — 整盘删除到不了模型那一步。

![拒绝](docs/screenshots/deny.png)

输入框里选中 **Approve for me** 之后，插件会给这一档补上自己的盾牌星标。另外三种官方模式它不管。

![Approve for me 权限菜单](docs/screenshots/permission-menu.png)

超时、重试、最大输出这些藏在设置卡底部。

![安全边界与高级参数](docs/screenshots/settings-advanced.png)

> 完整 DeepSeek Harness Web 在拍这些图时没能启动。缺 RC8 检出和 dshx，拍图环境的 Node 也还是 22.14，低于官方的 22.19。上面是本仓库的本地演示：设置卡和盾牌图标来自 `src/client` 的原组件，放行 / 拒绝 / 先问模型走的是同一套 `deterministicDecision`。不是官方 Harness 外壳。

## 装上

在 DeepSeek Harness 仓库里执行。目录名必须是 `dsh-approve-for-me`：

```sh
git clone https://github.com/aa2246740/dsh-auto-review.git my-plugins/dsh-approve-for-me
pnpm --dir my-plugins/dsh-approve-for-me install --ignore-workspace
pnpm --dir my-plugins/dsh-approve-for-me build
dshx check dsh-approve-for-me
dshx activation-plan dsh-approve-for-me --change new-client
dshx activate-new-client dsh-approve-for-me --profile web --port <当前 Web 端口>
```

`activate-new-client` 打出 `HOST_TREE_ACTIVE` 和 `CLIENT_MANIFEST_PRESENT` 之后，刷新一次 WebUI。输入框权限菜单选 **Approve for me**，再到插件设置里选审批模型。

需要 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `v0.1.0-rc.8`、Node `^22.19.0` 或 `>=24`、至少一条已经能用的 DSH 模型（API key 或 [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login)），以及 [dshx](https://github.com/aa2246740/dsh-external-plugin-devkit)。

不要再用另一份 bundle 或 patch 挂一次。重复挂载只会多出一个 Loader，不会多一层安全。

## 它怎么判

先走白名单，不靠「看起来不像危险命令」。`ls`、`pwd`、有界的 `find`、工作区内的 `read` / `grep` / `glob` 可以直接过。`rm -rf /`、抹盘、fork bomb 在本地拒绝。读 `.env`、写入、其余说不清的，交给你选的模型。

模型只看到有界的用户原话和 DSH 请求头；之前的工具输出不当成授权。它明确说「这次任务里同样的操作可以再来」时，同一条用户消息内才会复用。换一句、换会话、重启 Host 就作废。选「每次重新审批」连这点也关。

超时、传输出错、输出不像决定、路由不在，一律退回人工审批。斜杠命令、后台任务、Host RPC、流水线外面的子代理，它不管。报告漏洞见 [SECURITY.md](SECURITY.md)。

## 改代码

这个仓库要放在 RC8 检出的 `my-plugins/dsh-approve-for-me`，构建会用到那边的官方包和 dshx 的 `externalClientBundle`。

```sh
pnpm install --ignore-workspace
pnpm test
pnpm run typecheck
pnpm run build
dshx check dsh-approve-for-me
```

测过源码不等于浏览器里已经生效。构建必须产出 lazy-CJS 的 `lib/client.js`。

## 许可

[MIT](LICENSE)。跟 DeepSeek、OpenAI 都没有隶属关系。
