[中文](README.md) | English

# Approve for me

```sh
dsh plugin --profile web add github:aa2246740/dsh-auto-review
```

That is official `dsh plugin add`. It runs [pnpm](https://pnpm.io) inside `$DSH_HOME/profiles/web`, so `pnpm` must be on `PATH`. If `dsh` is not installed, use `npx @deepseek-ai/dsh plugin --profile web add github:aa2246740/dsh-auto-review`. Then **restart that Host and reload the page**. `add` writes the profile; it does not hot-load a running process.

This repo ships built `lib/` and declares `dsh.bundle.patch`. For stock DeepSeek Harness **0.1.5-rc.2** that is the whole install. You do not need Creator Mode, and you do not need a second plugin checkout.

Loader id: `dsh-approve-for-me`. The GitHub repo is `dsh-auto-review`. Existing installs do not need a rename.

DeepSeek Harness asks before some tool calls. This plugin adds **Approve for me** to the permission menu. The sandbox stays Workspace Write. Calls DSH already allows are not sent for review. Calls that still need approval go to a separate review model you pick in DSH.

Local observation that can be proved safe is allowed quickly. Destructive cases such as wiping a whole disk are denied locally. If the model is down, times out, returns junk, or lacks the original call context, the plugin fails closed. It does not fall back to a human prompt.

![Approve for me settings card](docs/screenshots/settings-card.png)

![Approve for me permission menu](docs/screenshots/permission-menu.png)

![Allow through deny](docs/screenshots/review-loop.gif)

![Allow](docs/screenshots/allow.png)

![Model review pending](docs/screenshots/pending.png)

![Deny](docs/screenshots/deny.png)

![Safety limits and advanced settings](docs/screenshots/settings-advanced.png)

After install, pick **Approve for me** in the composer permission menu, then choose the review model in plugin settings. The plugin only adds the shield-star glyph to that row. The three official modes stay as they are. Do not mount a second copy through another bundle or patch.

From a local clone, still use the official CLI (pnpm required):

```sh
git clone https://github.com/aa2246740/dsh-auto-review.git
dsh plugin --profile web add ./dsh-auto-review
```

```sh
dsh plugin --profile web remove dsh-approve-for-me
```

Needs DeepSeek Harness `0.1.5-rc.2`, Node `^22.19.0` or `>=24`, and at least one working DSH model. An API key or [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) is enough.

## How it decides

- Keeps DSH `workspace-write` and `ask`. Does not grant Full access.
- Only reviews calls DSH would have asked about.
- Can follow the current Agent model or pin a separate one. Requests `low` reasoning when the model supports it.
- The fast path is an allowlist: `pwd`, `ls`, bounded `find`, non-sensitive `read` / `grep` / `glob`, and only when they are proved safe.
- The review model must return `risk_level`, `user_authorization`, `outcome`, and `rationale`. Critical cannot pass. High needs clear user authorization.
- Each review is independent. The model cannot create always-allow rules.
- Default budget is 90 seconds, shared with at most two extra tries on transport or format failure.
- Missing call linkage, a down model, timeout, or bad output all fail closed.

Covers registered tools, Code Mode child calls, and MCP tools that go through the DSH tool runtime. Slash commands, background plugin jobs, Creator activation, Host RPC, and out-of-process subagents are out of scope.

See [SECURITY.md](SECURITY.md).

## Develop

```sh
pnpm install --ignore-workspace
pnpm test
```

`dsh plugin add github:` loads the committed `lib/`. Rebuild and commit `lib/` together when you change source.

## License

[MIT](LICENSE).
