# DSH Auto Review

An unofficial external plugin that adds a Codex-style **Approve for me** mode to
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It keeps
the official workspace sandbox in place and delegates eligible approval
questions to a model already signed in through
[dsh-oauth-login](https://github.com/aa2246740/dsh-oauth-login).

> Project: `dsh-auto-review` · plugin ID: `dsh-approve-for-me` · permission
> preset: `approve-for-me`. The plugin ID is intentionally retained for
> compatibility with existing installations.

This project is not affiliated with or endorsed by DeepSeek or OpenAI.

## What it does

- Adds a real DSH permission preset named **Approve for me**. It is not a visual
  switch layered over an official mode.
- Keeps DSH's official `workspace-write` sandbox and `ask` approval policy.
  Auto-review changes who answers an eligible approval question; it does not
  grant Full access.
- Uses the current session's latest authenticated OAuth model by default, or a
  model selected in the plugin settings. Reasoning defaults to the lowest level
  advertised by that model.
- Allows proven, side-effect-free local observations without an LLM round trip.
  Bounded, non-sensitive `read`, `grep`, `glob`, `lsp`, and `read_image` calls
  may target local paths outside the writable root. The conservative Bash
  parser recognizes metadata commands such as `pwd`, `ls`, `head`, `stat`,
  `file`, `readlink`, `realpath`, `df`, `du`, `wc`, and a bounded `find` subset.
  It also proves sequences made only from those commands, stdout pipes, and the
  non-writing `2>&1` descriptor merge.
- Rejects catastrophic machine-wide deletion deterministically.
- Sends other eligible actions to a reviewer that classifies intrinsic risk
  separately from user authorization. The reviewer receives bounded direct
  user requests plus the trusted DSH request-header instructions; prior tool
  output remains untrusted evidence. Transport failure,
  malformed output, unavailable OAuth, timeout, or uncertainty falls back to
  DSH's ordinary human approval UI.
- Never overrides a downstream denial or DSH's monotonic tool guards.

The primary gate is `tools/pre-execute`. Sandbox escalation and other late
permission questions are correlated through `approval/request`.

## Coverage boundary

The plugin covers registered tools, Code Mode sub-dispatches, and registered
MCP tools that pass through DSH's tool runtime. It does not intercept slash
commands, static plugin background work, Creator activation or Host RPC,
process-external subagents, or other work outside the tool pipeline.

## Requirements

- DeepSeek Harness `v0.1.0-rc.8`.
- Node.js `^22.19.0` or `>=24.0.0`.
- A working `dsh-oauth-login` installation with at least one authenticated
  model.
- The unofficial [dshx devkit](https://github.com/aa2246740/dsh-external-plugin-devkit)
  for the RC8 external-client build and bounded activation workflow.

## Install on RC8

Run these commands from a DeepSeek Harness checkout. Keep the destination name
`dsh-approve-for-me`, because it is the stable plugin ID:

```sh
git clone https://github.com/aa2246740/dsh-auto-review.git my-plugins/dsh-approve-for-me
pnpm --dir my-plugins/dsh-approve-for-me install --ignore-workspace
pnpm --dir my-plugins/dsh-approve-for-me build
dshx check dsh-approve-for-me
dshx activation-plan dsh-approve-for-me --change new-client
dshx activate-new-client dsh-approve-for-me --profile web --port <current-web-port>
```

After `activate-new-client` reports both `HOST_TREE_ACTIVE` and
`CLIENT_MANIFEST_PRESENT`, reload or reopen the WebUI once. Select **Approve for
me** from the composer permission menu, then choose the reviewer model in the
plugin settings.

Do not also mount the plugin manually through another bundle or patch. A second
mount creates a duplicate Loader ID instead of a second safety layer.

## Safety model

The fast path is an allowlist, not a shell denylist. It accepts `;` and `|` only
when every segment is independently proven read-only, and accepts only the
non-writing `2>&1` redirect. Substitutions, expansions, output redirects,
writes, sensitive paths, broad roots, background commands, malformed quoting,
and anything the parser cannot prove safe go to review.

The reviewer policy follows the public Codex Auto-review design: swapping the
reviewer does not widen the sandbox, an outside-writable-root path is not
dangerous by itself, and decisions are based on intrinsic risk plus trusted
authorization. See OpenAI's [Auto-review documentation](https://learn.chatgpt.com/docs/sandboxing/auto-review)
and the open-source Codex [reviewer policy template](https://github.com/openai/codex/blob/main/codex-rs/core/src/guardian/policy_template.md).

Provider-classified transport truncation is retried once by default. Each
attempt receives its own deadline. Every failure after route resolution names
the requested provider and model before preserving the adapter's original
error, so a protocol-specific error cannot be mistaken for a route switch.

See [SECURITY.md](SECURITY.md) for reporting and trust-boundary details.

## Develop

The repository must be placed at `my-plugins/dsh-approve-for-me` inside an RC8
Harness checkout because its TypeScript and external-client build configuration
intentionally reuse that checkout's official packages plus dshx's
`externalClientBundle` adapter.

```sh
pnpm install --ignore-workspace
pnpm test
pnpm run typecheck
pnpm run build
dshx check dsh-approve-for-me
```

The build must produce a lazy-CJS `lib/client.js` handoff. Passing the source
tests alone does not prove live activation or browser behavior.

## License

[MIT](LICENSE)
