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

While **Approve for me** is active, review failures default to the official human
approval waterfall. This pauses the action: an unavailable, rejected or cancelled
human outcome never grants execution. Strict reject remains optional. A known
catastrophic, rule or model denial is never downgraded by audit-storage failure.
The effective approval policy includes both the session override and deployment
default; `never` is checked before fast paths and after awaited decisions.
Parent cancellation and plugin disposal invalidate late results.

Each native ask is independent, including callers that reuse a borrowed request
object. Simultaneous execution/call-ID collisions are treated as ambiguous and
cannot supply guessed arguments to automatic review. A pre-execute failure may
hand off only its exact pending ask; a later escalation needs a fresh decision.
Audit execution updates use the original execution object's association, not a
call-ID-only match. A Host/HMR boundary cannot reconstruct an old grant.

Saved rules require explicit authenticated management requests, exact bounded
identity, optimistic revisions and expiration within 30 days. There is no model
tool that creates an allow-always rule. Current saved-rule **allow fast paths are
disabled**: the public tool protocol does not authenticate registration ownership
and eventual execution binding. A name, schema or prose is not that proof.
Human-required and deny rules work; previews never run tools. Independent AI
review remains active for registered tools and is not represented by the saved-
rule capability flags. Ordinary Creator's separate client activation is not
automatically intercepted.

The management route is installed only through authenticated public
`connection.fetch`. Connection applies its Host/Origin/authentication fence
before its HTTP bridge creates the synthetic `dsh.internal` Request URL. The
plugin checks the real carrier authority plus a same-origin UI intent header;
that header is CSRF defense in depth, not proof that the caller is a human.

The plugin-owned bounded store uses atomic replacement and restrictive file
permissions, rejects symlink paths and invalid persisted schemas, and exposes
storage faults rather than silently granting. It keeps bounded/redacted metadata,
not full executable payloads or hidden model reasoning. Known credential patterns
are removed from prompts as well as audit/export fields, but arbitrary secrets
cannot be detected reliably. Inspect exports before sharing. Power-loss durability
and hostile same-UID programs are not guaranteed by these snapshots.

A guard rejects direct write/edit attempts against this store while reviewer mode
is active. This is not a filesystem-integrity sandbox: arbitrary same-user shell
code, installed Host plugins, Full access, compromised browser code or manually
edited files remain outside that guard's guarantee. No change here widens DSH's
sandbox or claims to contain arbitrary plugin code.

Repeated explicit denials stop the current turn after three consecutive denials
or ten in the last fifty reviews under the same direct user request. Reviewer
outages and human unavailability are not counted as safety-denial attempts.
