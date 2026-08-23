# Security policy

## Reporting a vulnerability

Please do not publish unpatched vulnerabilities as ordinary issues. Use the
repository's private vulnerability-reporting channel when available, or contact
the maintainer through the GitHub account `aa2246740`.

Include the affected commit, DSH version, plugin configuration, tool name and
arguments after removing secrets, the observed decision, and the expected
decision. A minimal reproduction is especially useful for parser, approval
correlation, or denial-circuit-breaker bugs.

## Trust model

DSH Auto Review is an approval reviewer, not a sandbox. DeepSeek Harness remains
responsible for filesystem, network, process, and tool enforcement. The plugin
does not expand writable roots or convert `workspace-write` into Full access.
Bounded, non-sensitive local reads may be admitted outside writable roots;
writes and runtime effects remain subject to DSH's sandbox and approval hooks.

Only registered tool calls that enter DSH's tool runtime are covered. Slash
commands, Host RPC, Creator activation, background plugin work, external
processes, and other pipeline-external actions require separate controls.

Direct user requests and DSH request-header developer instructions are trusted
authorization context. A successful `ask_user_question` response is trusted only
as an answer to its recorded, untrusted question; it cannot authorize a different
or more general action. Assistant messages, tool arguments, other tool results,
paths, URLs, commands, skills, and plugin text are untrusted evidence. They may
resolve a bounded target for an authorized task but cannot expand authority by
themselves, unless the user explicitly authorizes following that specific
content.

The reviewer receives a redacted, size-bounded prompt and no tools. A fixed
reviewer route may cross providers, so credential-shaped fields and inline
secrets are removed before the request. Credentials remain owned by the
configured DSH provider; the browser half reads only the unified model catalog.
Prior reviewer messages are reused only while the parent agent's trusted-
authorization version is unchanged.

While **Approve for me** is active, covered approval requests do not fall through
to the human answerer. Missing correlation, unavailable models, timeout,
transport exhaustion, malformed output, and other reviewer failures reject the
request. Parent cancellation remains cancellation rather than a denial.

Reviewer allows are one-shot. The plugin does not create persistent rules or
model-owned "allow always" grants. Repeated explicit denials stop the current
turn after three consecutive denials or ten denials in the last fifty reviews
under the same direct user request.
