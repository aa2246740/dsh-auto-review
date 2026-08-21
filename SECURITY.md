# Security policy

## Reporting a vulnerability

Please do not publish unpatched vulnerabilities as ordinary issues. Use the
repository's private vulnerability-reporting channel when available, or contact
the maintainer through the GitHub account `aa2246740`.

Include the affected commit, DSH version, plugin configuration, tool name and
arguments after removing secrets, the observed decision, and the expected
decision. A minimal reproduction is especially useful for parser or approval
correlation bugs.

## Trust boundary

DSH Auto Review is an approval reviewer, not a sandbox. DeepSeek Harness remains
responsible for filesystem, network, process, and tool enforcement. The plugin
does not expand writable roots or convert `workspace-write` into Full access.
Bounded, non-sensitive local reads may be admitted outside writable roots;
writes and runtime effects remain subject to DSH's sandbox and approval hooks.

Only registered tool calls that enter DSH's tool runtime are covered. Slash
commands, Host RPC, Creator activation, background plugin work, external
processes, and other pipeline-external actions require separate controls.

The OAuth provider is trusted to review bounded request context. Credentials
remain owned by `dsh-oauth-login`; this plugin reads its same-origin status API
and never reads OAuth credential files from the browser.

Direct user requests and DSH request-header developer instructions are trusted
authorization context. Tool arguments, prior tool results, and quoted content
are untrusted evidence and cannot expand task scope by themselves.
