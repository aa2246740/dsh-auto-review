[中文](README.md) | English

# Approve for me

DeepSeek Harness applies its permission policy before a tool runs. This plugin adds a real **Approve for me** preset to that menu: the sandbox remains Workspace Write, calls DSH already admits are not reviewed, and actual approval requests go to a separate reviewer model selected from DSH's unified model directory.

Strictly proven local observations may use a fast path. Catastrophic machine-wide actions are denied locally. An unavailable model, timeout, malformed response, exhausted transport, or missing original call context fails closed instead of reopening the human approval UI.

It does not turn the session into Full access.

The repository is `dsh-auto-review`. The plugin ID remains `dsh-approve-for-me`, so existing installs do not need to be renamed.

The images below come from the official DeepSeek Harness Web UI on a local RC8 build.

![Approve for me settings card](docs/screenshots/settings-card.png)

Once **Approve for me** is selected, the plugin adds its shield-and-spark glyph only to that row. The three official modes remain unchanged.

![Approve for me permission menu](docs/screenshots/permission-menu.png)

Proven read-only observations such as `pwd && ls` may finish without the ordinary approval bar.

![Allow through deny](docs/screenshots/review-loop.gif)

**Fast allow** — bounded, side-effect-free local observations.

![Allow](docs/screenshots/allow.png)

**Model review** — real approval requests the fast path cannot prove, such as sensitive reads or writes, go to the dedicated reviewer model. It must return structured risk, authorization, outcome, and rationale. If the review cannot complete safely, the request is denied.

![Model review pending](docs/screenshots/pending.png)

**Local deny** — `rm -rf /` never reaches the reviewer. The official tool row fails with `拒绝自动执行：命令试图递归删除根目录或整个用户目录。`

![Deny](docs/screenshots/deny.png)

The 90-second overall deadline, three total attempts, and output ceiling live under the settings fold.

![Safety bounds and advanced settings](docs/screenshots/settings-advanced.png)

The settings copy is Chinese because that is the product UI used for these screenshots.

## Install

Run this from a DeepSeek Harness checkout. The destination directory must remain `dsh-approve-for-me`:

```sh
git clone https://github.com/aa2246740/dsh-auto-review.git my-plugins/dsh-approve-for-me
pnpm --dir my-plugins/dsh-approve-for-me install --ignore-workspace
pnpm --dir my-plugins/dsh-approve-for-me build
dshx check dsh-approve-for-me
dshx activation-plan dsh-approve-for-me --change new-client
dshx activate-new-client dsh-approve-for-me --profile web --port <current-web-port>
```

After `activate-new-client` prints `HOST_TREE_ACTIVE` and `CLIENT_MANIFEST_PRESENT`, reload the WebUI once. Select **Approve for me** from the composer permission menu, then choose the reviewer model in plugin settings.

Requirements: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) `v0.1.0-rc.8`, Node `^22.19.0` or `>=24`, at least one working DSH model through an API key or [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login), and [dshx](https://github.com/aa2246740/dsh-external-plugin-devkit).

Do not mount the plugin again through another bundle or patch. A second mount creates another Loader ID, not another safety layer.

## How it decides

- Keeps DSH's `workspace-write` sandbox and `ask` approval policy. It never grants Full access.
- Reviews only requests DSH would otherwise ask about. Calls already allowed or denied by downstream policy are not widened or rewritten.
- Follows the current Agent model or uses a fixed OAuth/API-key reviewer route. It requests `low` reasoning when the model advertises that level.
- Uses an allowlist fast path, not a shell-string denylist. `pwd`, `ls`, bounded `find`, and non-sensitive `read` / `grep` / `glob` calls may pass only when they are strictly proven safe.
- Requires the Codex-style `risk_level`, `user_authorization`, `outcome`, and `rationale` assessment. Critical risk cannot be allowed; high risk requires sufficiently explicit user authorization.
- Direct user messages and DSH request-header developer or `AGENTS.md` instructions are trusted authorization. An `ask_user_question` answer applies only to its paired question. Assistant messages and other tool results are evidence, not authority.
- Every approval is one-shot. The model cannot create task-scoped or persistent allow rules. Retries and permission escalations receive a fresh review.
- Reuses a bounded reviewer conversation only while the parent Agent, model route, policy version, and trusted-authorization version match. Concurrent reviews use empty-history ephemeral forks.
- Uses a 90-second overall deadline by default. Transport and malformed-output failures receive at most two additional attempts inside that same deadline.
- Stops the turn after three consecutive explicit denials, or ten denials within the last fifty reviews under the same direct user request.
- Missing correlation, unavailable routes, timeout, exhausted transport, and invalid responses all fail closed. Parent cancellation remains cancellation.

Coverage includes registered tools, Code Mode sub-dispatches, and MCP tools that pass through DSH's tool runtime. Slash commands, background plugin work, Creator activation, Host RPC, and process-external subagents are out of scope.

See [SECURITY.md](SECURITY.md) for the trust boundary. The primary-source Codex comparison is in [`docs/codex-auto-review-reference-2026-08-23.md`](docs/codex-auto-review-reference-2026-08-23.md).

## Develop

The repository must live at `my-plugins/dsh-approve-for-me` inside an RC8 checkout. Its TypeScript and client build reuse that checkout's official packages plus dshx's `externalClientBundle`.

```sh
pnpm install --ignore-workspace
pnpm test
pnpm run typecheck
pnpm run build
dshx check dsh-approve-for-me
```

Passing source tests does not prove browser activation. The build must emit a lazy-CJS `lib/client.js`, and the lifecycle branch reported by `dshx activation-plan` must be completed and verified in the real GUI.

## License

[MIT](LICENSE). This project is not affiliated with or endorsed by DeepSeek or OpenAI.
