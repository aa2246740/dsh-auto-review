[中文](README.md) | English

# Approve for me

```sh
dsh plugin --profile web add github:aa2246740/dsh-auto-review
```

Current release: **[0.4.0](https://github.com/aa2246740/dsh-auto-review/releases/latest)**. **`main` is the only maintained branch.** The plugin ID remains `dsh-approve-for-me`; no rename or compatibility-branch selection is required.

Requires DeepSeek Harness **0.1.7-rc.1** (`>=0.1.7-rc.1 <0.1.8`), Node `^22.19.0` or `>=24`, and `pnpm` on PATH. Built `lib/` is committed, so installation needs neither a build nor Creator Mode. Official `dsh plugin add` writes the profile composition for the next boot. After a first install, reopen that Host through its original launcher and reload the page.

Select **Approve for me** in a session's permission menu to review registered tool calls that DSH would otherwise ask about. The sandbox remains Workspace Write. The global enable switch does not identify or activate a session and does not override `never` or grant Full access.

If `dsh` is not installed globally, use `npx @deepseek-ai/dsh plugin --profile web add github:aa2246740/dsh-auto-review`. The install archive and SHA-256 checksum are available in the [latest release](https://github.com/aa2246740/dsh-auto-review/releases/latest).

## Quick start

1. Install, reopen the Host through its original launcher, and reload the page.
2. Choose **Approve for me** in the session permission menu.
3. Open Settings → **Automatic approval** → Overview to follow the session model or select a fixed reviewer. Review failures default to human approval.
4. Use Review history to inspect decisions and Rules to manage explicit rules. Advanced contains deadline and retention tuning.

## Features

- Reviewer outages, timeout, transport failure and invalid output now **pause the action and hand it to the official human approval flow** by default. Missing human availability, rejection and cancellation do not authorize execution. Strict reject remains an advanced setting.
- The default 90-second deadline includes route lookup, streaming and up to two extra retries. Uncooperative providers and late answers cannot turn an expired review into a grant.
- Settings → **Automatic approval** provides Overview, Rules, Review history and Advanced, in English and Chinese. Approval and tool-result status are separate; a successful tool result is not deployment or feature acceptance.
- User-owned rules bind an exact session, tool, stage and argument fingerprint or fixed plugin, with a maximum 30-day lifetime. Human-required and deny rules can be managed, previewed and revoked with optimistic revisions. Rule changes are audited. Preview never executes an action and there is no historical-action replay endpoint.
- **Saved-rule allow fast paths remain disabled** because the public tool protocol does not authenticate registration ownership and the eventual execution binding. Independent AI review can still evaluate Creator+ registered tools. Ordinary Creator's separate `cordis/request-run` retains its official per-version human approval; future versions are not automatically authorized.

Known security denials, guards and the effective `never` policy cannot be downgraded by audit or reviewer failure. A borrowed request object or reused call ID is not a reusable authorization capability.

## History and boundaries

New records begin with this version. They are not a complete session log and do not invent retrospective reviewer explanations. The store is `$DSH_HOME/approve-for-me/history-v1.json`, with `~/.dsh` as the default Home. New directories use 0700 and atomic replacement files use 0600. Defaults are 30 days and 1000 records; bounds are 1–365 days and 100–10000 records.

Only bounded, redacted metadata and argument summaries are retained; full file/program bodies are omitted. Export includes only the displayed page's allowlisted fields. Redaction is not a guarantee for arbitrary secrets: inspect exports before sharing. Corrupt/unwritable storage is visible, preserves the original file and prevents new automatic grants. Existing safety denials remain denials. Pending approvals are not restored across disposal/HMR.

This is an approval plugin, not a same-user filesystem or plugin-code integrity sandbox. See [SECURITY.md](SECURITY.md).

## Installation and development

The plugin ID remains `dsh-approve-for-me`; the repository is `dsh-auto-review`. Install once with the official plugin manager and avoid duplicate bundle/patch mounts. Required public Connection Fetch, locale, configForms, settings.section, and settings.plugins.tab package versions are declared in `package.json`; Node is `^22.19.0` or `>=24`.

An existing Creator+ install keeps its original source directory. Build/check, then use controlled same-PID server replacement and the client lifecycle branch. A rebuild, module replacement, client load and actual feature acceptance are separate proofs. Follow DSHX evidence rather than restarting the Host or starting a second port by default.

```sh
pnpm test
pnpm run typecheck
pnpm run build
```

Builds use the DSHX external client adapter; see [development setup](docs/development.md) for the target Harness configuration. Old screenshots in `docs/screenshots/` are historical, not acceptance evidence for the new management UI. The client no longer decorates official permission-menu DOM.

## License

[MIT](LICENSE).
