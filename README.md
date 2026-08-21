中文 | [English](README.en.md)

# 替我审批

DeepSeek Harness 跑工具前会停下来问你。这个插件在权限菜单里加了一档 **Approve for me**：沙箱还是 Workspace Write，但能证明安全的观察不再弹窗，整盘删除当场拒绝，其余交给你已经在 DSH 里配好的模型。模型失败、超时或不敢判，就还是问你。

它不是把「完全访问」换了个皮。

仓库叫 `dsh-auto-review`，插件 ID 仍是 `dsh-approve-for-me`，已经装过的不用改名。

下面的图都来自官方 DeepSeek Harness Web（RC8 本地构建），插件已加载，输入框选中 **Approve for me**。

![替我审批设置卡](docs/screenshots/settings-card.png)

输入框里选中 **Approve for me** 之后，插件会给这一档补上自己的盾牌星标。另外三种官方模式它不管。

![Approve for me 权限菜单](docs/screenshots/permission-menu.png)

`pwd && ls` 直接跑完，没有普通审批条。

![从放到拒](docs/screenshots/review-loop.gif)

**放行** — 有界、没副作用的本地观察。官方会话里 `pwd && ls` 出了工作区列表，中间没有 Allow once。

![放行](docs/screenshots/allow.png)

**先问模型** — 快速通道证明不了，比如读 `.env`。界面停在官方的 Deep diving / 普通审批；模型也不敢判就还是问你。

![先问模型](docs/screenshots/pending.png)

**拒绝** — `rm -rf /` 到不了审批模型。工具行是官方的失败态：`拒绝自动执行：命令试图递归删除根目录或整个用户目录。`

![拒绝](docs/screenshots/deny.png)

超时、重试、最大输出这些藏在设置卡底部。

![安全边界与高级参数](docs/screenshots/settings-advanced.png)

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
