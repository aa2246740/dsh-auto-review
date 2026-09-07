[中文](README.md) | English

# Approve for me

DeepSeek Harness asks before some tool calls. This plugin adds **Approve for me** to the permission menu. The sandbox stays Workspace Write. Calls DSH already allows are not sent for review. Calls that still need approval go to a separate review model you pick in DSH.

Local observation that can be proved safe is allowed quickly. Destructive cases such as wiping a whole disk are denied locally. If the model is down, times out, returns junk, or lacks the original call context, the plugin fails closed. It does not fall back to a human prompt.

The GitHub repo is `dsh-auto-review`. The plugin id stays `dsh-approve-for-me`. Existing installs do not need a rename.

![Approve for me settings card](docs/screenshots/settings-card.png)

![Approve for me permission menu](docs/screenshots/permission-menu.png)

![Allow through deny](docs/screenshots/review-loop.gif)

![Allow](docs/screenshots/allow.png)

![Model review pending](docs/screenshots/pending.png)

![Deny](docs/screenshots/deny.png)

![Safety limits and advanced settings](docs/screenshots/settings-advanced.png)

## Install

Loader id: `dsh-approve-for-me`.

```sh
dsh plugin --profile web add github:aa2246740/dsh-auto-review
```

Or from a clone:

```sh
git clone https://github.com/aa2246740/dsh-auto-review.git
dsh plugin --profile web add ./dsh-auto-review
```

Then restart that DSH Host and reload the page. Pick **Approve for me** in the composer permission menu, then choose the review model in plugin settings. Do not mount a second copy through another bundle or patch.

```sh
dsh plugin --profile web remove dsh-approve-for-me
```

Needs DeepSeek Harness `v0.1.0-rc.8`, Node `^22.19.0` or `>=24`, and at least one working DSH model. An API key or [dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login) is enough.

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

Keep the checkout at `my-plugins/dsh-approve-for-me` on an RC8 Harness tree.

```sh
pnpm install --ignore-workspace
pnpm test
pnpm run typecheck
pnpm run build
dshx check dsh-approve-for-me
```

## License

[MIT](LICENSE).
