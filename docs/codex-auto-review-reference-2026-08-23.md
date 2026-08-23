# Codex Auto-review reference, August 23, 2026

## Scope and source baseline

This note compares OpenAI Codex's public Auto-review implementation with the local `dsh-approve-for-me` plugin. It uses only OpenAI's official material and the `openai/codex` repository. The repository cutoff is commit [`83d1fe0e`](https://github.com/openai/codex/commit/83d1fe0e67b1323f71febc2925817732b449f1d9), authored August 23, 2026 at 07:19:50 UTC. The latest public tag before the cutoff was [`rust-v0.150.0-alpha.7`](https://github.com/openai/codex/releases/tag/rust-v0.150.0-alpha.7), dated August 22.

The open repository contains the CLI, TUI, app-server protocol, and core agent code. It does not contain the proprietary desktop App UI. Claims about the App label therefore rely on the TUI constants and PR #25017, whose stated purpose was to align TUI permission labels with the App.

## When the harness opened

There are two relevant dates. OpenAI made Codex CLI and its repository open source on April 16, 2025, alongside o3 and o4-mini. On August 19, 2026, OpenAI explicitly presented the repository's Rust core, app-server, SDK, CLI, and integration interfaces as the open-source Codex agent harness in [Codex as a platform: build on the open agent harness](https://developers.openai.com/blog/codex-as-a-platform). The repository uses the Apache License 2.0.

So “when did Codex become open source?” points to April 16, 2025. “When did OpenAI open and document the fuller Codex agent harness as a platform?” points to August 19, 2026.

## Auto-review public timeline

| Date | Public event |
| --- | --- |
| March 13, 2026 | PR [#13860](https://github.com/openai/codex/pull/13860), commit [`bc24017d`](https://github.com/openai/codex/commit/bc24017d64829d0b97b8bc6ed529a389e1e8bc1b), added "Smart Approvals" Guardian review across core, app-server, and TUI. It first appeared in the `0.115.0` release line. |
| March 15, 2026 | PR [#14668](https://github.com/openai/codex/pull/14668), commit [`6fdeb1d6`](https://github.com/openai/codex/commit/6fdeb1d602842b80088641b941dea174435c01b7), reused one Guardian session across approvals. |
| April 17 to 23, 2026 | PRs [#18021](https://github.com/openai/codex/pull/18021), [#18504](https://github.com/openai/codex/pull/18504), and [#19056](https://github.com/openai/codex/pull/19056) changed the public name from Guardian to Auto-review and introduced the `auto_review` wire value while retaining `guardian_subagent` as an input alias. PR [#19063](https://github.com/openai/codex/pull/19063) marked the feature stable and on by default. These changes were in [`rust-v0.124.0`](https://github.com/openai/codex/releases/tag/rust-v0.124.0). |
| April 26, 2026 | PR [#19058](https://github.com/openai/codex/pull/19058) added the Auto-review denials UI. A user can authorize one retry of a rejected action, but the retry still passes through Auto-review. |
| May 8, 2026 | OpenAI's official article [Running Codex safely](https://openai.com/index/running-codex-safely/) documented "Auto-review mode," `approvals_reviewer = "auto_review"`, and review of the proposed action against recent context and authorization. |
| May 29, 2026 | PR [#25017](https://github.com/openai/codex/pull/25017), commit [`1333f4a6`](https://github.com/openai/codex/commit/1333f4a68907e82e6477256c76997c004e363289), aligned TUI labels with the App, including "Approve for me." |
| July 31, 2026 | PR [#36373](https://github.com/openai/codex/pull/36373), commit [`b7a61066`](https://github.com/openai/codex/commit/b7a61066081644e0d8b2c0b4dbfd7408ac1514df), added `--approve-for-me` and the hidden `--not-so-yolo` alias. The flag was announced in stable release [`rust-v0.147.0`](https://github.com/openai/codex/releases/tag/rust-v0.147.0) on August 6. |
| August 7 to 21, 2026 | OpenAI hardened managed-model enforcement and strict review in PRs [#37511](https://github.com/openai/codex/pull/37511), [#38439](https://github.com/openai/codex/pull/38439), [#38492](https://github.com/openai/codex/pull/38492), [#38569](https://github.com/openai/codex/pull/38569), [#38602](https://github.com/openai/codex/pull/38602), [#39307](https://github.com/openai/codex/pull/39307), [#39741](https://github.com/openai/codex/pull/39741), [#39962](https://github.com/openai/codex/pull/39962), [#40021](https://github.com/openai/codex/pull/40021), and [#40031](https://github.com/openai/codex/pull/40031). |

Two proposed behaviors were not released by the cutoff: PR [#27440](https://github.com/openai/codex/pull/27440), which proposed human fallback on timeout, and PR [#20672](https://github.com/openai/codex/pull/20672), which proposed manual escalation after repeated denials. The shipped implementation fails closed instead.

## Did the original plugin cite or use the opened implementation?

The initial public plugin commit, `767094ad98c9b91d7cee298d00a4dfcd0d3aabb6`, was created on August 20, 2026 at 19:59:20 UTC+08:00. Its README called the mode “Codex-style,” but did not link the Codex repository, Guardian source, policy template, or official Auto-review documentation. Its implementation was an independent DSH design with `allow | deny | ask`, human fallback, and model-controlled exact-action reuse rather than a source-level port.

Commit `a8a7a504b0541801fda23bdcbe83dd77d248f0f1`, created on August 21, 2026 at 10:21:27 UTC+08:00, added explicit links to OpenAI's Auto-review documentation and `codex-rs/core/src/guardian/policy_template.md`, and aligned more of the risk and authorization language. Therefore the user's memory is partly correct: the first public version did not explicitly reference the newly documented open harness implementation, while the next-day revision did use its public policy and documentation as a design source.

## Names, config, and CLI behavior

"Approve for me" is the product-facing TUI/App label and CLI spelling. `auto_review` is the config and protocol term. Guardian remains the internal module name.

* `codex-rs/tui/src/chatwidget.rs`, constants `ASK_FOR_APPROVAL_LABEL`, `APPROVE_FOR_ME_LABEL`, and `AUTO_REVIEW_DESCRIPTION`, [lines 495-497](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/tui/src/chatwidget.rs#L495-L497), define "Approve for me" as "Only ask for actions detected as potentially unsafe."
* `codex-rs/tui/src/chatwidget/permissions_menu.rs`, `builtin_permission_mode_selection_item`, [lines 147-187](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/tui/src/chatwidget/permissions_menu.rs#L147-L187), maps the same workspace permission profile to either "Ask for approval" or "Approve for me" according to the reviewer.
* `codex-rs/protocol/src/config_types.rs`, `ApprovalsReviewer`, [lines 175-201](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/protocol/src/config_types.rs#L175-L201), defaults to `user`, accepts `auto_review`, and accepts legacy `guardian_subagent` as an alias.
* `codex-rs/utils/cli/src/shared_options.rs`, `SharedCliOptions::take_auto_review_config_overrides`, [lines 43-87](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/utils/cli/src/shared_options.rs#L43-L87), expands `--approve-for-me` to `approvals_reviewer="auto_review"`, `approval_policy="on-request"`, and `sandbox_mode="workspace-write"`.

The key point is easy to miss: Auto-review changes who answers an approval request. It does not grant Full Access or bypass separate safety checks.

## Implementation architecture

### Configuration and routing

The effective config stores `permissions`, `approvals_reviewer`, and optional Guardian policy configuration in `codex-rs/core/src/config/mod.rs`, `Config`, [lines 637-679](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/config/mod.rs#L637-L679). User TOML exposes top-level `approval_policy`, `approvals_reviewer`, and `[auto_review].policy` in `codex-rs/config/src/config_toml.rs`, `ConfigToml`, [lines 174-185](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/config/src/config_toml.rs#L174-L185).

Managed `requirements.toml` can constrain `allowed_approvals_reviewers` and set `[auto_review].required_on_models` and `ignore_rules`; see `AutoReviewRequirementsToml` in `codex-rs/config/src/config_requirements.rs`, [lines 930-954](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/config/src/config_requirements.rs#L930-L954). Required models preserve a supported approval policy but downgrade Full Access to workspace-write. `ignore_rules` disables saved command-prefix approvals. The app-server summary is in `codex-rs/app-server/README.md`, [lines 902-915](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/app-server/README.md#L902-L915).

`codex-rs/core/src/guardian/review.rs`, `routes_approval_policy_to_guardian`, [lines 201-210](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/review.rs#L201-L210), routes only `OnRequest` or `Granular` approvals when the reviewer is `AutoReview`. `Session::request_approval` and `request_reviewer_approval` in `codex-rs/core/src/tools/approvals.rs`, [lines 438-529](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/tools/approvals.rs#L438-L529), apply permission hooks first, then strict Auto-review or Guardian, otherwise the user. ARC and other guards remain separate.

### Reviewer agent lifecycle and isolation

`codex-rs/core/src/guardian/mod.rs`, [lines 1-12](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/mod.rs#L1-L12), states the design: reconstruct a compact transcript, run a dedicated review session with strict JSON output, and fail closed.

`GuardianReviewSessionManager` in `codex-rs/core/src/guardian/review_session.rs`, [lines 123-150](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/review_session.rs#L123-L150), owns a reusable trunk plus ephemeral review sessions. Each session has a semaphore, transcript cursor, review count, Node REPL evidence state, and fork snapshot. `initialize`, [lines 413-464](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/review_session.rs#L413-L464), eagerly creates the trunk. Concurrent or incompatible reviews fork ephemeral sessions.

`build_guardian_review_session_config`, [lines 1380-1442](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/review_session.rs#L1380-L1442), clones the parent config but forces approval policy `Never`, intersects permissions with read-only, clears MCP servers, disables skills, apps instructions, memories, notifications, and developer instruction inheritance, and retains constrained network-proxy configuration where applicable. PRs #38602 and #39962 further isolated parent extensions and executor MCP servers.

The reviewer model comes from the provider's preferred review model, a model-specific `auto_review_model_override`, or the active model as a fallback. It uses low reasoning when supported. See `guardian_review_session_config` in `codex-rs/core/src/guardian/review.rs`, [lines 826-902](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/review.rs#L826-L902).

### Prompt, evidence, and decision model

The fixed policy is `codex-rs/core/src/guardian/policy_template.md` ([source](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/policy_template.md)). It treats user and developer messages, `AGENTS.md`, and `request_user_input` responses as trusted authorization sources. Assistant text, tools, skills, plugins, and tool results are untrusted evidence. The reviewer scores risk as `low`, `medium`, `high`, or `critical` and authorization as `unknown`, `low`, `medium`, or `high`. Low and medium risk normally pass. High risk requires at least medium authorization and a narrow target. Critical risk is denied even after user re-approval.

`build_guardian_prompt_items_with_parent_turn` in `codex-rs/core/src/guardian/prompt.rs`, [lines 123-209](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/prompt.rs#L123-L209), sends a full transcript first, then deltas when the saved cursor and history version remain valid. `collect_guardian_transcript_entries`, [lines 506-590](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/prompt.rs#L506-L590), retains relevant messages, exact calls, and results while filtering contextual noise. The strict contract is `{risk_level, user_authorization, outcome, rationale}`; parser and schema are `parse_guardian_assessment` and `guardian_output_schema`, [lines 714-833](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/prompt.rs#L714-L833).

### Retry, fallback, and denial controls

The timeout is 90 seconds and the attempt ceiling is three. `run_guardian_review_session_with_retry` retries transient server, HTTP, and stream failures plus parse failures with backoff; see `codex-rs/core/src/guardian/review.rs`, [lines 1037-1110](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/review.rs#L1037-L1110). Timeout returns `TimedOut`; prompt, session, and parse failures produce a high-risk, unknown-authorization denial; cancellation aborts. See `run_guardian_review`, [lines 527-648](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/review.rs#L527-L648).

An installed extension may answer an ordinary review first, but retries, escalated permissions, and managed strict paths still run synchronous Guardian. If the extension does not decide, Codex falls back to Guardian, not a human prompt. See `run_guardian_review`, [lines 313-365](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/review.rs#L313-L365).

The denial circuit breaker stops a standard turn after three consecutive denials or ten denials within the last fifty reviews. Cyber models stop after one. Constants and policy types are in `codex-rs/core/src/guardian/mod.rs`, [lines 53-59 and 125-200](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/guardian/mod.rs#L53-L59).

### Caching and "allow always"

Auto-review returns an ordinary approve or deny. It does not mint persistent rules by itself.

Human approval can return one-shot, session, exec-policy amendment, MCP-policy amendment, or network-policy amendment decisions through `ReviewDecision` in `codex-rs/protocol/src/protocol.rs`, [lines 3877-3915](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/protocol/src/protocol.rs#L3877-L3915). `with_cached_approval` in `codex-rs/core/src/tools/sandboxing.rs`, [lines 64-115](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/tools/sandboxing.rs#L64-L115), skips prompts when all serialized approval keys are cached. `append_amendment_and_update` in `codex-rs/core/src/exec_policy.rs`, [lines 443-490](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/exec_policy.rs#L443-L490), persists command-prefix allow rules. MCP offers "Allow for this session" and "Allow and don't ask me again" where the tool and protocol support them; see `codex-rs/core/src/mcp_tool_call.rs`, `build_mcp_tool_approval_question` and `normalize_approval_decision_for_mode`, [lines 1656-1700](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/mcp_tool_call.rs#L1656-L1700) and [lines 1936-2006](https://github.com/openai/codex/blob/83d1fe0e67b1323f71febc2925817732b449f1d9/codex-rs/core/src/mcp_tool_call.rs#L1936-L2006).

## Local implementation after the alignment pass

The implementation under `my-plugins/dsh-approve-for-me` now follows the public Codex behavior at DSH's supported extension points:

* `src/coordinator.ts` routes only real DSH approval decisions. Calls that downstream policy already allows are not sent to the model. A later sandbox retry or permission escalation always receives a fresh model assessment that includes the new approval reason.
* While the `approve-for-me` preset is active, covered approval requests never fall through to the human answerer. Missing correlation, route failure, timeout, transport exhaustion, malformed output, and unsupported reviewer behavior fail closed with rejection. Parent cancellation remains cancellation.
* `src/reviewer.ts` accepts Codex's `risk_level`, `user_authorization`, `outcome`, and `rationale` contract, including the low-risk `{"outcome":"allow"}` shorthand. It rejects critical allows and high-risk allows without at least medium authorization.
* The reviewer prefers exactly `low` reasoning when the model advertises it, uses a 90-second overall deadline, allows three total attempts, retries transient or malformed responses with bounded backoff, and never supplies tools to the generic LLM request.
* Trusted authorization includes direct user messages and request-header developer and loaded `AGENTS.md` instructions. Each successful `ask_user_question` response remains bound to its recorded, untrusted question and authorizes only that literal scope. Assistant messages and other tool evidence remain untrusted unless the user explicitly authorizes following that specific file, ticket, or content.
* `src/review-session.ts` keeps a bounded reviewer conversation per parent agent, model route, policy version, and trusted-authorization version. Concurrent reviews use ephemeral empty-history forks rather than sharing mutable conversation state, and authorization changes reset prior reviewer history.
* Auto-review decisions are one-shot. The old model-controlled exact-action reuse module was removed. The denial circuit breaker stops a standard turn after three consecutive explicit denials or ten denials in the last fifty reviews under the same direct user request.
* `src/client/index.tsx`, `README.md`, and `SECURITY.md` now describe failure-closed behavior, one-shot reviews, Low reasoning, the 90-second deadline, three attempts, and the denial thresholds.

### Remaining platform differences

| Area | Codex | DSH plugin after alignment |
| --- | --- | --- |
| Reviewer execution | Dedicated read-only child agent with tightly disabled tools, MCP, skills, apps, memories, and collaboration. | Tool-free generic DSH LLM requests with bounded conversation reuse. DSH RC8 exposes no equivalent external approval-review child-agent interface. |
| Transcript transport | Parent transcript cursors and deltas, plus provider-aware reviewer trunks and ephemeral forks. | Bounded current context plus a configurable prior-review window (four pairs by default); trusted-authorization changes reset reuse and concurrent work still forks, but there is no parent transcript cursor protocol. |
| Approval coverage | Typed exec, patch, network, MCP, and permission request variants, including managed strict paths. | Registered tool `pre-execute` plus call-ID-correlated `approval/request`. Work outside DSH's tool pipeline remains out of scope. |
| Managed policy | Administrator requirements can force reviewers, supply policy, constrain models, and disable saved rules. | User-owned plugin settings only; RC8 has no matching external administrator constraint layer. |
| Human denial UI | Codex can show denial history and let the user explicitly re-authorize one rejected action before it is reviewed again. | Rejection rationale is injected back to the agent because DSH RC8's `ApprovalOutcome` cannot carry a denial payload or native retry ledger. A new direct user instruction is still trusted on the next review. |
| Read-only investigation | Guardian may inspect local state with read-only tools before deciding. | The generic reviewer has no tools. Conservative deterministic pre-execute checks handle a narrow set of proven safe observations, but every later escalation still goes to the model. |

## Verification state

The local suite exercises deterministic policy, approval-only routing, fresh review of escalations, failure-closed missing correlation, structured parsing, trusted `ask_user_question` responses, conversation reuse and concurrent forks, Low reasoning, classified retries, one shared deadline, and denial thresholds. At this revision, `pnpm test` passes 49 tests and `pnpm run typecheck` passes.

## Bottom line

The plugin is now behaviorally close to the public Codex Auto-review design at the seams DSH RC8 exposes: workspace-write remains active, only actual approvals are reviewed, decisions are structured and one-shot, failures close, escalations are re-reviewed, reviewer context is isolated and bounded, and repeated denials stop the turn. The remaining differences are platform capabilities rather than retained product choices: DSH lacks Codex's dedicated read-only Guardian child-agent API, unified typed approval variants, managed policy layer, and native denial-retry UI.
