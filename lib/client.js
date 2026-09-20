window.__ModuleLoader__.load({
	id: "dsh-approve-for-me",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/i18n.ts
		const LOCALE_NS = "settings.approveForMe";
		const en = {
			title: "Automatic approval",
			tabs: "Approval management",
			overview: "Overview",
			rules: "Rules",
			history: "Review history",
			advanced: "Advanced",
			intro: "Inspect review decisions, manage bounded rules, and configure the reviewer.",
			recentActivity: "Recent reviews",
			viewHistory: "View history",
			noActivity: "No reviews yet",
			activityHint: "Actions that need review will appear here.",
			learnMore: "How approval works",
			modeBrief: "Select “Approve for me” in a session to use this reviewer. Your current permissions stay unchanged.",
			autoSave: "Changes save automatically. Press Enter or leave a number field to save.",
			manage: "Open management panel",
			collapse: "Close management panel",
			cardHint: "Also available as its own “Automatic approval” page in Settings.",
			enabled: "Globally enabled",
			disabled: "Globally disabled",
			globalSwitch: "Enable automatic review",
			modeTitle: "Enabled is not the same as active",
			modeExplanation: "The global switch only permits participation. A session must explicitly select “Approve for me” in its permission menu. This page does not know which session is selected and does not infer one.",
			fullAccess: "“Full access” describes file/permission policy, not whether automatic approval is running. Approval and tool execution are separate outcomes.",
			executionHint: "“Succeeded” only means the tool reported success. It does not prove a plugin was deployed, activated, or functionally accepted.",
			boundaries: "Only genuine registered-tool review/approval paths are covered. Slash commands, background jobs and private plugin Host RPC are not blanket-authorized.",
			creatorPlus: "Creator Mode+",
			creator: "Creator",
			supported: "Automatic rule grants supported",
			unsupported: "Automatic rule grants unavailable",
			capabilityHint: "These flags describe saved-rule grants only. Independent AI review remains available for registered tools, including Creator+ tools; a rule cannot skip that review without verified support.",
			autoBlocked: "Human-confirmation and deny rules are available. Automatic rule grants are not supported yet.",
			loading: "Loading…",
			unavailable: "Approval service unavailable",
			settingsUnavailable: "This connection does not expose the approval settings namespace. Settings cannot be edited here.",
			settingsLoading: "Loading Host settings…",
			readOnly: "Host settings are read-only.",
			retryLoad: "Try loading again",
			refresh: "Refresh",
			refreshSettings: "Refresh settings",
			saved: "Saved and confirmed by the Host.",
			saving: "Saving…",
			saveFailed: "The Host did not retain this value. Refresh and try again.",
			requestFailed: "Request failed: {message}",
			conflict: "The data changed elsewhere (409). Refresh and review the latest revision before saving again. Your draft is retained.",
			invalidRequest: "The Host rejected this request (400): {message}",
			storageFailed: "Storage is unavailable (503): {message}",
			stale: "Showing the last successful snapshot; refresh failed.",
			storage: "Audit storage",
			storageOk: "Available",
			storageNotOk: "Unavailable",
			retention: "Retention: {days} days · up to {count} records",
			revision: "Revision {revision}",
			loadedRecords: "Records on this page",
			ruleCount: "Stored rules",
			failureTitle: "When review fails",
			humanFallback: "The default is the official human approval card. Strict reject is optional in Advanced. A denied historical action cannot be executed with one click; initiate a new request through the normal tool flow.",
			noRetry: "There is no supported exact retry endpoint in this version. No “retry old action” control is provided.",
			session: "Exact session ID",
			tool: "Exact tool name",
			status: "Approval status",
			allStatuses: "All statuses",
			filter: "Apply filters",
			reset: "Reset filters",
			next: "Next page",
			first: "First page",
			noRecords: "No review records match these filters.",
			details: "Details",
			createRule: "Create rule draft",
			export: "Export this page (redacted JSON)",
			exportHint: "Exports only this page of new plugin audit records, not the complete session log. Raw arguments and fingerprints are excluded; known credentials and payloads are redacted. Check the file before sharing.",
			approval: "Approval",
			execution: "Execution",
			source: "Decision source",
			model: "Reviewer model",
			reason: "Reason",
			duration: "Review duration",
			rule: "Rule",
			plugin: "Plugin",
			arguments: "Redacted arguments summary",
			permission: "Redacted permission summary",
			created: "Created",
			updated: "Updated",
			stage: "Exact review stage",
			unknown: "Not reported",
			recordId: "Record ID",
			failureKind: "Failure kind",
			risk: "Risk",
			"status.reviewing": "Reviewing",
			"status.pending-human": "Waiting for human",
			"status.allowed": "Allowed",
			"status.denied": "Denied",
			"status.failed": "Review failed",
			"status.cancelled": "Cancelled",
			"status.unavailable": "Unavailable",
			"status.interrupted": "Interrupted",
			"source.model": "Model",
			"source.deterministic": "Deterministic policy",
			"source.rule": "Rule",
			"source.human": "Human",
			"source.failure": "Failure handling",
			"execution.not-started": "Not started",
			"execution.unknown": "Unknown",
			"execution.succeeded": "Succeeded",
			"execution.failed": "Failed",
			"execution.cancelled": "Cancelled",
			"execution.blocked": "Blocked",
			"stage.pre-execute": "Pre-execution review",
			"stage.approval-request": "Approval request",
			"action.allow": "Allow automatically",
			"action.ask": "Ask a human",
			"action.deny": "Deny",
			"action.none": "No action",
			rulesHint: "Create a bounded rule from a historical record. Rules never grant blanket access or replay a tool. Ask and deny rules can be saved even when automatic allow is unsupported.",
			startFromHistory: "Choose a record in Review history",
			noRules: "No saved rules.",
			edit: "Edit",
			delete: "Delete",
			confirmDelete: "Delete this rule? This cannot be undone.",
			confirm: "Confirm delete",
			cancel: "Cancel",
			rememberedTitle: "Remembered across tasks",
			rememberedHint: "These skip the next matching confirmation until they expire or you revoke them. They never bypass never/cancel/sandbox.",
			noRemembered: "No remembered rules.",
			revokeGrant: "Revoke",
			ruleEnabled: "Rule enabled",
			ruleDisabled: "Rule disabled",
			expired: "Expired",
			expires: "Expires",
			scope: "Rule scope",
			exactScope: "This session + stage + tool + exact fingerprint (+ fixed plugin when present)",
			pluginScope: "This session + stage + tool + fixed Creator plugin",
			scopeHint: "Session, stage and tool stay bound to the source record. Plugin scope is only for pre-execution dshx_hot_reload / dshx_activate_new_client and that fixed plugin ID. Other tools require exact arguments. Neither scope covers every plugin or session.",
			ruleEditor: "Rule draft",
			ruleName: "Rule name",
			ruleAction: "Decision",
			lifetime: "Lifetime from creation (hours)",
			expiryHint: "Default 8 hours; maximum 30 days. Editing does not reset the creation time.",
			fingerprint: "Exact argument fingerprint",
			fingerprintHint: "An opaque binding from the Host, not the original arguments.",
			saveRule: "Save rule",
			draftHint: "This is a draft until saved. Preview checks a record without running any tool.",
			preview: "Preview against record",
			previewRecord: "Record ID to preview",
			chooseRecord: "Select a loaded record",
			previewResult: "Preview result",
			matched: "Matched",
			notMatched: "Did not match",
			capabilityBlocked: "Runtime capability blocked",
			ruleNameRequired: "Enter a rule name of 1–120 characters.",
			ruleBindingRequired: "A rule needs an exact session, stage and tool binding.",
			ruleFingerprintRequired: "This record has no valid SHA-256 argument fingerprint; an exact-arguments rule cannot be saved.",
			rulePluginRequired: "A Creator-plugin rule requires a supported pre-execution Creator tool and fixed plugin ID, with no fingerprint in plugin scope.",
			ruleExpiryInvalid: "The expiry must be in the future and no later than 30 days after creation.",
			draftRevisionHint: "Cancel this draft, inspect the refreshed rule below, then reopen it to edit the current revision.",
			fieldRange: "Enter a whole number from {min} to {max}.",
			modelChoice: "Reviewer model",
			followAgent: "Follow the session’s most recently used model (default)",
			offlineModel: "Saved route is currently offline",
			catalogLoading: "Loading the official model catalog…",
			catalogEmpty: "No registered models. Review failures follow the failure mode below; no automatic success is implied.",
			catalogReady: "{count} registered models",
			catalogError: "Could not load model catalog: {message}",
			thinking: "Thinking effort",
			thinkingLow: "Prefer Low; use provider default when unsupported",
			thinkingDefault: "Always use provider default",
			failureMode: "Review failure behavior",
			human: "Human approval (default)",
			reject: "Strict reject",
			rejectHint: "Strict reject denies the pending request after a review failure instead of showing the human approval card.",
			advancedHint: "Changes are saved to the official Host settings namespace. Numeric fields keep a local draft and save only on blur or Enter, not on every keystroke.",
			timeoutMs: "Review timeout (seconds)",
			transportRetries: "Additional transport attempts",
			maxOutputTokens: "Maximum output tokens",
			maxInputChars: "Maximum input characters",
			reviewHistoryPairs: "Reviewer history pairs",
			reviewHistoryChars: "Reviewer history characters",
			historyRetentionDays: "Audit retention (days)",
			historyMaxRecords: "Maximum audit records",
			milliseconds: "{value} ms",
			ruleDraftName: "Review {tool}",
			enabledUnknown: "Global setting not available"
		};
		const zh = {
			title: "自动审批",
			tabs: "审批管理",
			overview: "概览",
			rules: "规则",
			history: "审核历史",
			advanced: "高级",
			intro: "查看审核决定、管理有边界的规则，并配置审批模型。",
			recentActivity: "最近审核",
			viewHistory: "查看历史",
			noActivity: "还没有审核记录",
			activityHint: "需要审核的操作会显示在这里。",
			learnMore: "了解更多",
			modeBrief: "在会话权限菜单选择“Approve for me”后使用，不会改变当前权限。",
			autoSave: "修改自动保存；数字输入按 Enter 或离开输入框时保存。",
			manage: "打开管理面板",
			collapse: "收起管理面板",
			cardHint: "也可在设置中打开独立的“自动审批”页面。",
			enabled: "全局已启用",
			disabled: "全局已关闭",
			globalSwitch: "启用自动审核",
			modeTitle: "启用不等于正在运行",
			modeExplanation: "全局开关只允许插件参与审批。会话还需在权限菜单中明确选择“Approve for me”。此页面不知道当前选择的会话，也不会猜测。",
			fullAccess: "“Full access”仅说明文件／权限策略，不表示自动审批正在运行。审批决定和工具执行结果分别记录。",
			executionHint: "“成功”仅表示工具报告成功，不代表插件已部署、激活或通过功能验收。",
			boundaries: "仅覆盖注册工具的真实审查／审批路径；不会笼统授权斜杠命令、后台任务或插件私有 Host RPC。",
			creatorPlus: "Creator Mode+",
			creator: "Creator",
			supported: "支持规则自动放行",
			unsupported: "规则自动放行暂不可用",
			capabilityHint: "以上只表示持久规则能否跳过审核直接放行。独立 AI 审核仍可处理注册工具，包括 Creator+；来源不能验证时，不启用规则免审通道。",
			autoBlocked: "当前支持人工确认和拒绝规则，免审放行暂未开放。",
			loading: "正在读取…",
			unavailable: "审批服务不可用",
			settingsUnavailable: "当前连接未提供审批设置命名空间，无法在此编辑设置。",
			settingsLoading: "正在读取 Host 设置…",
			readOnly: "Host 设置为只读。",
			retryLoad: "重新读取",
			refresh: "刷新",
			refreshSettings: "刷新设置",
			saved: "已保存并经 Host 确认。",
			saving: "正在保存…",
			saveFailed: "Host 未保留此值，请刷新后重试。",
			requestFailed: "请求失败：{message}",
			conflict: "数据已在其他位置修改（409）。请刷新并检查最新版本后再保存；当前草稿已保留。",
			invalidRequest: "Host 拒绝此请求（400）：{message}",
			storageFailed: "存储不可用（503）：{message}",
			stale: "刷新失败；当前显示上一次成功读取的快照。",
			storage: "审核存储",
			storageOk: "可用",
			storageNotOk: "不可用",
			retention: "保留 {days} 天 · 最多 {count} 条",
			revision: "修订版 {revision}",
			loadedRecords: "本页记录",
			ruleCount: "已存规则",
			failureTitle: "审查失败时",
			humanFallback: "默认回到官方人工审批卡；也可在高级设置中选择严格拒绝。历史中被拒绝的动作不能一键执行，请通过正常工具流程发起新请求。",
			noRetry: "本版本没有已提供的精确重试端点，因此不提供“重试旧动作”按钮。",
			session: "精确会话 ID",
			tool: "精确工具名",
			status: "审批状态",
			allStatuses: "所有状态",
			filter: "应用过滤",
			reset: "清除过滤",
			next: "下一页",
			first: "回到第一页",
			noRecords: "没有符合过滤条件的审核记录。",
			details: "详情",
			createRule: "创建规则草稿",
			export: "导出本页（脱敏 JSON）",
			exportHint: "仅导出本页升级后新增的插件审核记录，不是完整会话日志。已排除原始参数和指纹，并过滤已知凭据及正文载荷；分享前仍请复核。",
			approval: "审批决定",
			execution: "执行结果",
			source: "决定来源",
			model: "审批模型",
			reason: "原因",
			duration: "审核耗时",
			rule: "规则",
			plugin: "插件",
			arguments: "脱敏参数摘要",
			permission: "脱敏权限摘要",
			created: "创建时间",
			updated: "更新时间",
			stage: "精确审查阶段",
			unknown: "未报告",
			recordId: "记录 ID",
			failureKind: "故障类型",
			risk: "风险",
			"status.reviewing": "审查中",
			"status.pending-human": "等待人工",
			"status.allowed": "已允许",
			"status.denied": "已拒绝",
			"status.failed": "审查失败",
			"status.cancelled": "已取消",
			"status.unavailable": "不可用",
			"status.interrupted": "已中断",
			"source.model": "模型",
			"source.deterministic": "确定性策略",
			"source.rule": "规则",
			"source.human": "人工",
			"source.failure": "故障处理",
			"execution.not-started": "尚未开始",
			"execution.unknown": "未知",
			"execution.succeeded": "成功",
			"execution.failed": "失败",
			"execution.cancelled": "已取消",
			"execution.blocked": "已阻止",
			"stage.pre-execute": "执行前审查",
			"stage.approval-request": "审批请求",
			"action.allow": "自动允许",
			"action.ask": "询问人工",
			"action.deny": "拒绝",
			"action.none": "无动作",
			rulesHint: "从历史记录创建有边界的规则。规则不会授予无限权限或重放工具。不支持自动允许时，仍可保存询问人工和拒绝规则。",
			startFromHistory: "前往审核历史选择记录",
			noRules: "暂无已保存规则。",
			edit: "编辑",
			delete: "删除",
			confirmDelete: "确定删除这条规则？此操作不可撤销。",
			confirm: "确认删除",
			cancel: "取消",
			rememberedTitle: "跨任务记住的规则",
			rememberedHint: "匹配时跳过下一次确认，直到过期或你撤销。不会绕过 never、取消或沙箱。",
			noRemembered: "暂无跨任务记住的规则。",
			revokeGrant: "撤销",
			ruleEnabled: "规则已启用",
			ruleDisabled: "规则已停用",
			expired: "已到期",
			expires: "到期时间",
			scope: "规则范围",
			exactScope: "本会话 + 阶段 + 工具 + 精确指纹（有插件时也固定绑定）",
			pluginScope: "本会话 + 阶段 + 工具 + 固定 Creator 插件",
			scopeHint: "会话、阶段与工具绑定于源记录。插件范围仅支持执行前的 dshx_hot_reload／dshx_activate_new_client 及其固定插件 ID；其他工具使用精确参数。两种范围均不会覆盖所有插件或会话。",
			ruleEditor: "规则草稿",
			ruleName: "规则名称",
			ruleAction: "决定",
			lifetime: "自创建起有效期（小时）",
			expiryHint: "默认 8 小时，最多 30 天。编辑不会重置创建时间。",
			fingerprint: "精确参数指纹",
			fingerprintHint: "由 Host 提供的不透明绑定，不是原始参数。",
			saveRule: "保存规则",
			draftHint: "保存前只是草稿。预览仅对记录检查匹配，不运行工具。",
			preview: "对记录预览",
			previewRecord: "预览记录 ID",
			chooseRecord: "选择已加载记录",
			previewResult: "预览结果",
			matched: "匹配",
			notMatched: "不匹配",
			capabilityBlocked: "运行时能力已阻止",
			ruleNameRequired: "请输入 1–120 字的规则名称。",
			ruleBindingRequired: "规则需要精确会话、阶段和工具绑定。",
			ruleFingerprintRequired: "该记录没有有效的 SHA-256 参数指纹，无法保存精确参数规则。",
			rulePluginRequired: "Creator 插件规则必须绑定受支持的执行前工具和固定插件 ID，且插件范围不得携带参数指纹。",
			ruleExpiryInvalid: "到期时间必须晚于现在，且不超过创建后 30 天。",
			draftRevisionHint: "请取消当前草稿，检查下方刷新后的规则，再重新打开编辑以使用最新修订版。",
			fieldRange: "请输入 {min} 至 {max} 的整数。",
			modelChoice: "审批模型",
			followAgent: "跟随会话最近使用的模型（默认）",
			offlineModel: "已保存的模型路由当前离线",
			catalogLoading: "正在读取官方模型目录…",
			catalogEmpty: "没有已注册模型；审查故障按下方故障模式处理，不会视作自动成功。",
			catalogReady: "已注册 {count} 个模型",
			catalogError: "模型目录读取失败：{message}",
			thinking: "思考强度",
			thinkingLow: "优先 Low，不支持时使用服务商默认档",
			thinkingDefault: "始终使用服务商默认档",
			failureMode: "审查故障处理",
			human: "人工审批（默认）",
			reject: "严格拒绝",
			rejectHint: "严格拒绝会在审查故障后拒绝待处理请求，而不是显示人工审批卡。",
			advancedHint: "更改保存至官方 Host 设置命名空间。数字输入先保留本地草稿，只在失焦或按 Enter 时保存，不会每输入一个字就写入。",
			timeoutMs: "审核超时（秒）",
			transportRetries: "额外传输尝试次数",
			maxOutputTokens: "最大输出 tokens",
			maxInputChars: "最大输入字符数",
			reviewHistoryPairs: "审批上下文历史对数",
			reviewHistoryChars: "审批上下文历史字符数",
			historyRetentionDays: "审核记录保留天数",
			historyMaxRecords: "审核记录最大条数",
			milliseconds: "{value} 毫秒",
			ruleDraftName: "审核 {tool}",
			enabledUnknown: "全局设置不可用"
		};
		//#endregion
		//#region src/contracts.ts
		/** JSON-only public contracts shared by the approval Host and its settings UI. */
		const APPROVAL_API_PATH = "/api/approve-for-me";
		const CREATOR_CONSENT_API_PATH = "/api/approve-for-me/creator";
		const REVIEW_STATUSES = [
			"reviewing",
			"pending-human",
			"allowed",
			"denied",
			"failed",
			"cancelled",
			"unavailable",
			"interrupted"
		];
		const EMPTY_FILTER = {
			sessionId: "",
			status: "",
			toolName: ""
		};
		const NUMERIC_SETTINGS = [
			{
				key: "timeoutMs",
				min: 1,
				max: 120,
				fallback: 9e4,
				scale: 1e3
			},
			{
				key: "transportRetries",
				min: 0,
				max: 2,
				fallback: 2
			},
			{
				key: "maxOutputTokens",
				min: 128,
				max: 4096,
				fallback: 256
			},
			{
				key: "maxInputChars",
				min: 2e3,
				max: 1e5,
				fallback: 2e4
			},
			{
				key: "reviewHistoryPairs",
				min: 1,
				max: 12,
				fallback: 4
			},
			{
				key: "reviewHistoryChars",
				min: 2e3,
				max: 1e5,
				fallback: 2e4
			},
			{
				key: "historyRetentionDays",
				min: 1,
				max: 365,
				fallback: 30
			},
			{
				key: "historyMaxRecords",
				min: 100,
				max: 1e4,
				fallback: 1e3
			}
		];
		/** A resolved settings promise can mean recovery after rejection; read back the public mirror. */
		async function persistSettings(scope, values) {
			const snapshot = scope.getSnapshot();
			if (snapshot.status !== "ready" || !snapshot.writable) return false;
			await scope.mutate(Object.entries(values).map(([key, value]) => ({
				op: "set",
				path: [key],
				value
			})));
			const current = scope.getSnapshot();
			return current.status === "ready" && current.value !== void 0 && Object.entries(values).every(([key, value]) => current.value?.[key] === value);
		}
		/** Empty, fractional, exponential and non-finite drafts never become settings writes. */
		function parseIntegerDraft(text, min, max) {
			if (!/^\d+$/.test(text.trim())) return void 0;
			const value = Number(text);
			return Number.isSafeInteger(value) && value >= min && value <= max ? value : void 0;
		}
		function dashboardUrl(filter = EMPTY_FILTER, before) {
			const query = new URLSearchParams({ limit: "25" });
			if (before !== void 0) query.set("before", String(before));
			for (const key of [
				"sessionId",
				"status",
				"toolName"
			]) if (filter[key].trim()) query.set(key, filter[key].trim());
			return `${APPROVAL_API_PATH}?${query.toString()}`;
		}
		var ApprovalApiError = class extends Error {
			status;
			constructor(status, message) {
				super(message);
				this.status = status;
				this.name = "ApprovalApiError";
			}
		};
		const object$2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
		const finiteNumber = (value) => typeof value === "number" && Number.isFinite(value);
		const validDate = (value) => finiteNumber(value) && Number.isFinite(new Date(value).getTime());
		function validRecord(value) {
			if (!object$2(value)) return false;
			return [
				"id",
				"sessionId",
				"toolName",
				"argumentsSummary",
				"permissionSummary",
				"reason"
			].every((key) => typeof value[key] === "string") && [
				"callId",
				"rootCallId",
				"pluginId",
				"argumentFingerprint",
				"failureKind",
				"riskLevel",
				"model",
				"ruleId"
			].every((key) => value[key] === void 0 || typeof value[key] === "string") && validDate(value.createdAt) && validDate(value.updatedAt) && (value.elapsedMs === void 0 || finiteNumber(value.elapsedMs) && value.elapsedMs >= 0) && ["pre-execute", "approval-request"].includes(String(value.stage)) && REVIEW_STATUSES.includes(value.status) && [
				"model",
				"deterministic",
				"rule",
				"human",
				"failure"
			].includes(String(value.source)) && [
				"not-started",
				"unknown",
				"succeeded",
				"failed",
				"cancelled",
				"blocked"
			].includes(String(value.execution));
		}
		function validRule(value) {
			if (!object$2(value)) return false;
			return [
				"id",
				"name",
				"sessionId",
				"toolName"
			].every((key) => typeof value[key] === "string") && ["pluginId", "argumentFingerprint"].every((key) => value[key] === void 0 || typeof value[key] === "string") && Number.isSafeInteger(value.version) && typeof value.enabled === "boolean" && validDate(value.createdAt) && validDate(value.expiresAt) && [
				"allow",
				"ask",
				"deny"
			].includes(String(value.action)) && ["exact-arguments", "creator-plugin"].includes(String(value.scope)) && ["pre-execute", "approval-request"].includes(String(value.stage));
		}
		async function readResponse(response) {
			let value;
			try {
				value = await response.json();
			} catch {
				throw new ApprovalApiError(response.status, "Invalid JSON response");
			}
			if (!response.ok || object$2(value) && typeof value.error === "string") throw new ApprovalApiError(response.status, object$2(value) && typeof value.error === "string" ? value.error : response.statusText);
			return value;
		}
		/** No Host RPC, token access, cross-origin credentials or private route inference. */
		async function getDashboard(filter, before, signal) {
			const value = await readResponse(await fetch(dashboardUrl(filter, before), {
				credentials: "same-origin",
				cache: "no-store",
				...signal === void 0 ? {} : { signal }
			}));
			if (!object$2(value) || value.version !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.records) || !Array.isArray(value.rules) || !object$2(value.capabilities) || !object$2(value.storage) || !object$2(value.capabilities.creatorPlus) || !object$2(value.capabilities.creator) || ![value.capabilities.creatorPlus, value.capabilities.creator].every((c) => typeof c.automatic === "boolean" && typeof c.reason === "string") || typeof value.storage.ok !== "boolean" || !finiteNumber(value.storage.retentionDays) || !finiteNumber(value.storage.maxRecords) || value.storage.reason !== void 0 && typeof value.storage.reason !== "string" || value.nextBefore !== void 0 && !finiteNumber(value.nextBefore) || !value.records.every(validRecord) || !value.rules.every(validRule)) throw new ApprovalApiError(502, "Invalid dashboard contract");
			return value;
		}
		async function postCommand(command) {
			const value = await readResponse(await fetch(APPROVAL_API_PATH, {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"x-dsh-approval-ui": "1",
					"content-type": "application/json"
				},
				body: JSON.stringify(command)
			}));
			if (command.action === "preview") {
				if (!object$2(value) || typeof value.matched !== "boolean" || typeof value.reason !== "string" || ![
					"allow",
					"ask",
					"deny",
					"none"
				].includes(String(value.action))) throw new ApprovalApiError(502, "Invalid preview contract");
				return value;
			}
			if (!object$2(value) || value.ok !== true) throw new ApprovalApiError(502, "Invalid mutation contract");
			return value;
		}
		/** Records have no mode discriminator: require both advertised modes, never guess the active session. */
		function canSaveAutomatic(dashboard) {
			return dashboard?.capabilities.creatorPlus.automatic === true && dashboard.capabilities.creator.automatic === true;
		}
		const FIXED_CREATOR_TOOLS = ["dshx_hot_reload", "dshx_activate_new_client"];
		function canUseCreatorPlugin(value) {
			return value.stage === "pre-execute" && FIXED_CREATOR_TOOLS.some((tool) => tool === value.toolName) && Boolean(value.pluginId);
		}
		/** Fingerprints belong only to exact scope. Keep the source digest in the local draft, never in a plugin-scope payload. */
		function withRuleScope(rule, scope, sourceFingerprint) {
			const { argumentFingerprint, ...binding } = rule;
			const fingerprint = sourceFingerprint ?? argumentFingerprint;
			return {
				...binding,
				scope,
				...scope === "exact-arguments" && fingerprint ? { argumentFingerprint: fingerprint } : {}
			};
		}
		function ruleFromRecord(record, name, now = Date.now(), id = crypto.randomUUID()) {
			const scope = canUseCreatorPlugin(record) ? "creator-plugin" : "exact-arguments";
			return {
				id,
				version: 1,
				name: name.trim(),
				enabled: true,
				action: "ask",
				scope,
				sessionId: record.sessionId,
				stage: record.stage,
				toolName: record.toolName,
				...scope === "exact-arguments" && record.argumentFingerprint ? { argumentFingerprint: record.argumentFingerprint } : {},
				...record.pluginId ? { pluginId: record.pluginId } : {},
				createdAt: now,
				expiresAt: now + 288e5
			};
		}
		function ruleProblem(rule, automatic, forSave = true, now = Date.now()) {
			if (!rule.name.trim() || rule.name.length > 120) return "ruleNameRequired";
			if (!rule.sessionId || !rule.toolName || !["pre-execute", "approval-request"].includes(rule.stage)) return "ruleBindingRequired";
			if (rule.scope === "exact-arguments" && (!rule.argumentFingerprint || !/^[a-fA-F0-9]{64}$/.test(rule.argumentFingerprint))) return "ruleFingerprintRequired";
			if (rule.scope === "creator-plugin" && (!canUseCreatorPlugin(rule) || rule.argumentFingerprint !== void 0)) return "rulePluginRequired";
			if (FIXED_CREATOR_TOOLS.some((tool) => tool === rule.toolName) && !rule.pluginId) return "rulePluginRequired";
			if (!Number.isFinite(rule.expiresAt) || rule.expiresAt <= now || rule.expiresAt - rule.createdAt > 2592e6) return "ruleExpiryInvalid";
			if (forSave && rule.action === "allow" && !automatic) return "autoBlocked";
		}
		/** A deliberate field whitelist: never spread a record or export fingerprints/raw payloads. */
		function redactedHistoryExport(records) {
			return JSON.stringify({
				version: 1,
				kind: "redacted-approval-history",
				records: records.map((record) => ({
					id: record.id,
					createdAt: record.createdAt,
					updatedAt: record.updatedAt,
					sessionId: record.sessionId,
					stage: record.stage,
					toolName: record.toolName,
					pluginId: record.pluginId,
					status: record.status,
					source: record.source,
					model: record.model,
					reason: record.reason,
					elapsedMs: record.elapsedMs,
					ruleId: record.ruleId,
					execution: record.execution,
					argumentsSummary: record.argumentsSummary,
					permissionSummary: record.permissionSummary
				}))
			}, null, 2);
		}
		//#endregion
		//#region \0dshx-css-module:src/client/styles.module.css.mjs
		const css$1 = ".VkAdxW_root{--approval-border:color-mix(in srgb, currentColor 14%, transparent);--approval-muted:color-mix(in srgb, currentColor 65%, transparent);--approval-fill:color-mix(in srgb, currentColor 3%, transparent);--approval-accent:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#3568d4);--approval-warning-fallback:#985300;--approval-error-fallback:#b42332;--approval-warning:var(--dsw-alias-state-warn-label,var(--approval-warning-fallback));--approval-error:var(--dsw-alias-state-error-primary,var(--approval-error-fallback));width:100%;min-width:0;max-width:840px;color:inherit;overflow-wrap:anywhere;gap:20px;margin-inline:auto;font-size:13px;line-height:1.5;display:grid}.VkAdxW_root *,.VkAdxW_root :before,.VkAdxW_root :after{box-sizing:border-box}.VkAdxW_root h2,.VkAdxW_root h3,.VkAdxW_root p{margin:0}.VkAdxW_root h3{font-size:13px;font-weight:600}.VkAdxW_pageTitle{letter-spacing:-.025em;font-size:22px;font-weight:650;line-height:1.3}.VkAdxW_title{font-size:15px}.VkAdxW_heading,.VkAdxW_row,.VkAdxW_rowBetween{align-items:center;gap:12px;display:flex}.VkAdxW_heading,.VkAdxW_rowBetween{justify-content:space-between}.VkAdxW_heading{flex-wrap:wrap}.VkAdxW_heading>div{min-width:0}.VkAdxW_titleRow{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.VkAdxW_row{flex-wrap:wrap}.VkAdxW_muted,.VkAdxW_inlineHint,.VkAdxW_saveStatus{color:var(--approval-muted)}.VkAdxW_inlineHint{font-size:12px}.VkAdxW_root .VkAdxW_inlineHint{margin-top:-8px}.VkAdxW_saveStatus{font-size:12px}.VkAdxW_warning{color:var(--approval-warning)}.VkAdxW_error{color:var(--approval-error);border:1px solid;border-radius:8px;padding:10px 12px}.VkAdxW_card,.VkAdxW_editor{border:1px solid var(--approval-border);border-radius:10px;gap:10px;min-width:0;padding:16px;display:grid}.VkAdxW_editor{border-color:color-mix(in srgb, var(--approval-accent) 55%, transparent)}.VkAdxW_grid,.VkAdxW_filters{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;display:grid}.VkAdxW_filters{border:1px solid var(--approval-border);border-radius:10px;align-items:end;padding:14px}.VkAdxW_panel,.VkAdxW_recordList{gap:20px;min-width:0;display:grid}.VkAdxW_tabs{border-bottom:1px solid var(--approval-border);gap:20px;padding:2px 2px 0;display:flex;overflow-x:auto}.VkAdxW_tab{color:var(--approval-muted);cursor:pointer;font:inherit;white-space:nowrap;background:0 0;border:0;border-bottom:2px solid #0000;flex:none;padding:9px 1px 11px;position:relative}.VkAdxW_tab[aria-selected=true]{color:inherit;border-bottom-color:var(--approval-accent);font-weight:600}.VkAdxW_button{border:1px solid var(--approval-border);width:fit-content;max-width:100%;min-height:34px;color:inherit;cursor:pointer;font:inherit;text-align:center;background:0 0;border-radius:7px;padding:6px 11px}.VkAdxW_button:hover:not(:disabled),.VkAdxW_tab:hover{background:var(--approval-fill)}.VkAdxW_textButton{color:var(--approval-accent);font:inherit;cursor:pointer;background:0 0;border:0;padding:6px 0}.VkAdxW_textButton:hover{text-decoration:underline}.VkAdxW_root :is(button,input,select,summary,[role=tabpanel]):focus-visible{outline:2px solid var(--approval-accent);outline-offset:3px}.VkAdxW_root :is(button,input,select):disabled{opacity:.55;cursor:not-allowed}.VkAdxW_field{align-content:start;gap:7px;min-width:0;display:grid}.VkAdxW_field>span:first-child{font-weight:500}.VkAdxW_field input,.VkAdxW_field select{border:1px solid var(--approval-border);width:100%;min-width:0;min-height:37px;color:inherit;background:var(--dsw-alias-background-primary,Canvas);font:inherit;border-radius:7px;padding:7px 10px}.VkAdxW_field input[aria-invalid=true]{border-color:var(--approval-error)}.VkAdxW_settingsGroup{border:1px solid var(--approval-border);border-radius:10px;min-width:0}.VkAdxW_settingRow{grid-template-columns:minmax(100px,1fr) minmax(0,1.7fr);align-items:center;gap:24px;min-width:0;padding:15px 18px;display:grid}.VkAdxW_settingRow+.VkAdxW_settingRow{border-top:1px solid var(--approval-border)}.VkAdxW_toggleRow{cursor:pointer;justify-content:space-between;min-height:58px;display:flex}.VkAdxW_toggle{appearance:none;border:1px solid var(--approval-border);background:color-mix(in srgb, currentColor 22%, transparent);cursor:pointer;border-radius:20px;flex:none;width:36px;height:20px;margin:0;position:relative}.VkAdxW_toggle:after{content:\"\";background:#fff;border-radius:50%;width:14px;height:14px;position:absolute;top:2px;left:2px;box-shadow:0 1px 2px #0003}.VkAdxW_toggle:checked{background:var(--approval-accent);border-color:var(--approval-accent)}.VkAdxW_toggle:checked:after{transform:translate(16px)}.VkAdxW_switchLabel{cursor:pointer;align-items:center;gap:8px;width:fit-content;min-height:32px;display:inline-flex}.VkAdxW_switchLabel input{width:17px;height:17px;accent-color:var(--approval-accent);margin:0}.VkAdxW_fieldset{border:0;gap:14px;min-width:0;margin:0;padding:0;display:grid}.VkAdxW_notice{border-inline-start:2px solid var(--approval-accent);background:var(--approval-fill);border-radius:0 7px 7px 0;gap:9px;padding:12px 14px;display:grid}.VkAdxW_badge{border:1px solid var(--approval-border);width:fit-content;color:var(--approval-muted);white-space:normal;border-radius:5px;align-items:center;padding:2px 7px;font-size:11px;font-weight:400;display:inline-flex}.VkAdxW_empty{text-align:center;color:var(--approval-muted);justify-items:center;gap:12px;padding:30px 16px;display:grid}.VkAdxW_activity{min-width:0}.VkAdxW_activity .VkAdxW_rowBetween{margin-bottom:10px}.VkAdxW_quietEmpty{border:1px dashed var(--approval-border);text-align:center;color:var(--approval-muted);border-radius:9px;padding:26px 16px}.VkAdxW_quietEmpty span{margin-top:5px;font-size:12px;display:block}.VkAdxW_activityList{margin:0;padding:0;list-style:none}.VkAdxW_activityList li{border-bottom:1px solid var(--approval-border);justify-content:space-between;align-items:center;gap:16px;padding:12px 0;display:flex}.VkAdxW_activityName{gap:3px;min-width:0;display:grid}.VkAdxW_activityName strong{text-overflow:ellipsis;white-space:nowrap;font-weight:500;overflow:hidden}.VkAdxW_activityName time{color:var(--approval-muted);font-size:11px}.VkAdxW_help{color:var(--approval-muted);border-top:1px solid var(--approval-border);padding-top:13px}.VkAdxW_help>summary{cursor:pointer;width:fit-content;padding:3px 0;font-size:12px}.VkAdxW_helpBody{gap:12px;padding:14px 0 2px;font-size:12px;line-height:1.65;display:grid}.VkAdxW_supportList{gap:12px;margin:0;display:grid}.VkAdxW_supportList dt{font-weight:600}.VkAdxW_supportList dd{margin:3px 0 0}.VkAdxW_metadata{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 22px;min-width:0;margin:0;display:grid}.VkAdxW_metadata>div{min-width:0}.VkAdxW_metadata dt{color:var(--approval-muted);margin-bottom:3px;font-size:12px}.VkAdxW_metadata dd{overflow-wrap:anywhere;white-space:pre-wrap;margin:0}.VkAdxW_metadata pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;font:inherit;margin:0;overflow:auto}.VkAdxW_mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.VkAdxW_summary{white-space:pre-wrap}.VkAdxW_details{border-top:1px solid var(--approval-border);padding-top:10px}.VkAdxW_details summary{cursor:pointer;width:fit-content;padding:3px 0;font-weight:500}.VkAdxW_details[open] summary{margin-bottom:12px}.VkAdxW_preview{border-top:1px solid var(--approval-border);gap:12px;padding-top:14px;display:grid}.VkAdxW_permissionModeIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}.VkAdxW_permissionModeIcon svg{display:block}.VkAdxW_permissionModeIconMenu{width:16px;height:16px;color:inherit}.VkAdxW_permissionModeIconTrigger,.VkAdxW_permissionModeIconTrigger svg{width:14px;height:14px;color:inherit}@media (prefers-color-scheme:dark){.VkAdxW_root{--approval-warning-fallback:#edbd77;--approval-error-fallback:#ffabb5}}@media (width<=640px){.VkAdxW_grid,.VkAdxW_filters,.VkAdxW_metadata{grid-template-columns:minmax(0,1fr)}.VkAdxW_settingRow:not(.VkAdxW_toggleRow){grid-template-columns:minmax(0,1fr);gap:8px}.VkAdxW_settingRow{padding:13px 14px}.VkAdxW_heading>*{max-width:100%}.VkAdxW_card,.VkAdxW_editor{padding:14px}.VkAdxW_pageTitle{font-size:21px}}@media (forced-colors:active){.VkAdxW_root{--approval-border:CanvasText;--approval-accent:Highlight;--approval-muted:CanvasText;--approval-warning:CanvasText;--approval-error:CanvasText}.VkAdxW_tab[aria-selected=true]{border-bottom-color:highlight}.VkAdxW_toggle{appearance:auto}.VkAdxW_toggle:after{display:none}}";
		const tagId$1 = "dsh-approve-for-me/styles.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-approve-for-me";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var styles_module_css_default = {
			"activity": "VkAdxW_activity",
			"activityList": "VkAdxW_activityList",
			"activityName": "VkAdxW_activityName",
			"badge": "VkAdxW_badge",
			"button": "VkAdxW_button",
			"card": "VkAdxW_card",
			"details": "VkAdxW_details",
			"editor": "VkAdxW_editor",
			"empty": "VkAdxW_empty",
			"error": "VkAdxW_error",
			"field": "VkAdxW_field",
			"fieldset": "VkAdxW_fieldset",
			"filters": "VkAdxW_filters",
			"grid": "VkAdxW_grid",
			"heading": "VkAdxW_heading",
			"help": "VkAdxW_help",
			"helpBody": "VkAdxW_helpBody",
			"inlineHint": "VkAdxW_inlineHint",
			"metadata": "VkAdxW_metadata",
			"mono": "VkAdxW_mono",
			"muted": "VkAdxW_muted",
			"notice": "VkAdxW_notice",
			"pageTitle": "VkAdxW_pageTitle",
			"panel": "VkAdxW_panel",
			"permissionModeIcon": "VkAdxW_permissionModeIcon",
			"permissionModeIconMenu": "VkAdxW_permissionModeIconMenu",
			"permissionModeIconTrigger": "VkAdxW_permissionModeIconTrigger",
			"preview": "VkAdxW_preview",
			"quietEmpty": "VkAdxW_quietEmpty",
			"recordList": "VkAdxW_recordList",
			"root": "VkAdxW_root",
			"row": "VkAdxW_row",
			"rowBetween": "VkAdxW_rowBetween",
			"saveStatus": "VkAdxW_saveStatus",
			"settingRow": "VkAdxW_settingRow",
			"settingsGroup": "VkAdxW_settingsGroup",
			"summary": "VkAdxW_summary",
			"supportList": "VkAdxW_supportList",
			"switchLabel": "VkAdxW_switchLabel",
			"tab": "VkAdxW_tab",
			"tabs": "VkAdxW_tabs",
			"textButton": "VkAdxW_textButton",
			"title": "VkAdxW_title",
			"titleRow": "VkAdxW_titleRow",
			"toggle": "VkAdxW_toggle",
			"toggleRow": "VkAdxW_toggleRow",
			"warning": "VkAdxW_warning"
		};
		//#endregion
		//#region src/client/overview.tsx
		/** Secondary explanations stay discoverable without competing with the controls. */
		function HelpDisclosure({ title, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: styles_module_css_default["help"],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: title }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles_module_css_default["helpBody"],
					children
				})]
			});
		}
		function Overview({ dashboard, t, children, onHistory }) {
			const recent = dashboard.records.slice(0, 3);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				children,
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: styles_module_css_default["activity"],
					"aria-label": t("recentActivity"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: styles_module_css_default["rowBetween"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("recentActivity") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: styles_module_css_default["textButton"],
							onClick: onHistory,
							children: t("viewHistory")
						})]
					}), recent.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles_module_css_default["quietEmpty"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noActivity") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("activityHint") })]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: styles_module_css_default["activityList"],
						children: recent.map((record) => {
							const date = new Date(record.createdAt);
							const validDate = Number.isFinite(date.valueOf());
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles_module_css_default["activityName"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									title: record.toolName,
									children: record.toolName
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
									dateTime: validDate ? date.toISOString() : void 0,
									children: validDate ? date.toLocaleString() : t("unknown")
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles_module_css_default["badge"],
								children: t(`status.${record.status}`)
							})] }, record.id);
						})
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(HelpDisclosure, {
					title: t("learnMore"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("modeExplanation") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("fullAccess") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("humanFallback") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("capabilityHint") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dl", {
							className: styles_module_css_default["supportList"],
							children: ["creatorPlus", "creator"].map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dt", { children: [
								t(mode),
								" · ",
								t(dashboard.capabilities[mode].automatic ? "supported" : "unsupported")
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: dashboard.capabilities[mode].reason })] }, mode))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("boundaries") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("retention", {
							days: dashboard.storage.retentionDays,
							count: dashboard.storage.maxRecords
						}) })
					]
				})
			] });
		}
		//#endregion
		//#region src/creator-grant-types.ts
		/** Private Host contracts. A remembered rule is NOT an executable capability. */
		const CREATOR_GRANT_OPERATIONS = [
			"check",
			"activation-plan",
			"hot-reload",
			"activate-new-client"
		];
		//#endregion
		//#region src/creator-approval-contract.ts
		/** JSON-only confirmation vocabulary. No agent identity, binding, execution token or transport is accepted here. */
		function invalid() {
			throw new TypeError("Invalid Creator approval confirmation");
		}
		function object$1(value, keys) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return invalid();
			const prototype = Object.getPrototypeOf(value);
			if (prototype !== Object.prototype && prototype !== null) return invalid();
			const result = Object.create(null);
			for (const key of Reflect.ownKeys(value)) {
				if (typeof key !== "string" || !keys.includes(key)) return invalid();
				const property = Object.getOwnPropertyDescriptor(value, key);
				if (property === void 0 || !property.enumerable || !("value" in property)) return invalid();
				result[key] = property.value;
			}
			return result;
		}
		function text(value, max, pattern) {
			if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(value) || pattern !== void 0 && !pattern.test(value)) return invalid();
			return value;
		}
		function boolean(value) {
			if (typeof value !== "boolean") return invalid();
			return value;
		}
		function operation(value) {
			if (typeof value !== "string" || !CREATOR_GRANT_OPERATIONS.includes(value)) return invalid();
			return value;
		}
		function operations(value) {
			if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length === 0 || value.length > 4 || Reflect.ownKeys(value).length !== value.length + 1) return invalid();
			const result = [];
			for (let index = 0; index < value.length; index += 1) {
				const property = Object.getOwnPropertyDescriptor(value, String(index));
				if (property === void 0 || !property.enumerable || !("value" in property)) return invalid();
				result.push(operation(property.value));
			}
			if (new Set(result).size !== result.length) return invalid();
			return CREATOR_GRANT_OPERATIONS.filter((item) => result.includes(item));
		}
		/** Detached, strictly bounded display data. Host-generated labels are not execution bindings. */
		function parseCreatorApprovalPrompt(value) {
			const data = object$1(value, [
				"protocol",
				"id",
				"pluginId",
				"sourceLabel",
				"workspaceLabel",
				"currentOperation",
				"availableOperations",
				"allowTask",
				"allowRemember",
				"taskLabel",
				"reason"
			]);
			if (data["protocol"] !== 1) return invalid();
			const currentOperation = operation(data["currentOperation"]);
			const availableOperations = operations(data["availableOperations"]);
			if (!availableOperations.includes(currentOperation)) return invalid();
			return {
				protocol: 1,
				id: text(data["id"], 128, /^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
				pluginId: text(data["pluginId"], 64, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
				sourceLabel: text(data["sourceLabel"], 512),
				workspaceLabel: text(data["workspaceLabel"], 512),
				currentOperation,
				availableOperations,
				allowTask: boolean(data["allowTask"]),
				allowRemember: boolean(data["allowRemember"]),
				taskLabel: text(data["taskLabel"], 160),
				...Object.hasOwn(data, "reason") ? { reason: text(data["reason"], 1200) } : {}
			};
		}
		/** Only explicit closed decisions are valid; native allowed-once and AI-shaped results are not this protocol. */
		function parseCreatorApprovalResult(value, prompt) {
			const source = parseCreatorApprovalPrompt(prompt);
			const data = object$1(value, [
				"decision",
				"lifetime",
				"operations",
				"rememberDays"
			]);
			if (data["decision"] === "reject") {
				if (Object.keys(data).length !== 1) return invalid();
				return { decision: "reject" };
			}
			if (data["decision"] !== "allow") return invalid();
			const selected = operations(data["operations"]);
			if (!selected.includes(source.currentOperation) || selected.some((item) => !source.availableOperations.includes(item))) return invalid();
			if (data["lifetime"] === "remember") {
				if (!source.allowRemember || typeof data["rememberDays"] !== "number" || ![
					1,
					7,
					30
				].includes(data["rememberDays"])) return invalid();
				return {
					decision: "allow",
					lifetime: "remember",
					operations: selected,
					rememberDays: data["rememberDays"]
				};
			}
			if (Object.hasOwn(data, "rememberDays")) return invalid();
			if (data["lifetime"] === "task") {
				if (!source.allowTask) return invalid();
				return {
					decision: "allow",
					lifetime: "task",
					operations: selected
				};
			}
			if (data["lifetime"] !== "once" || selected.length !== 1 || selected[0] !== source.currentOperation) return invalid();
			return {
				decision: "allow",
				lifetime: "once",
				operations: selected
			};
		}
		//#endregion
		//#region \0dshx-css-module:src/client/creator-approval.module.css.mjs
		const css = "._3m715a_root{--creator-confirm-border:color-mix(in srgb, currentColor 16%, transparent);--creator-confirm-muted:color-mix(in srgb, currentColor 68%, transparent);--creator-confirm-fill:color-mix(in srgb, currentColor 3%, transparent);--creator-confirm-accent:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#3568d4);box-sizing:border-box;border:1px solid var(--creator-confirm-border);background:var(--creator-confirm-fill);width:100%;min-width:0;max-width:760px;color:inherit;font:inherit;overflow-wrap:anywhere;border-radius:12px;padding:16px;font-size:13px;line-height:1.5}._3m715a_root *,._3m715a_root :before,._3m715a_root :after{box-sizing:border-box}._3m715a_heading,._3m715a_actions,._3m715a_footer,._3m715a_duration{flex-wrap:wrap;align-items:center;gap:8px;display:flex}._3m715a_heading{justify-content:space-between;margin-bottom:4px}._3m715a_heading h3{margin:0;font-size:14px;font-weight:600}._3m715a_badge{background:var(--creator-confirm-fill);border-radius:5px;padding:2px 7px;font-size:11px}._3m715a_plugin{font-family:ui-monospace,SFMono-Regular,monospace;font-size:13px;display:block}._3m715a_target,._3m715a_summary{gap:3px;margin:8px 0 12px;display:grid}._3m715a_target>div,._3m715a_summary>div{grid-template-columns:minmax(65px,auto) minmax(0,1fr);gap:10px;display:grid}._3m715a_target dt,._3m715a_summary dt{color:var(--creator-confirm-muted)}._3m715a_target dd,._3m715a_summary dd{min-width:0;margin:0}._3m715a_fieldset{border:0;min-width:0;margin:0;padding:0}._3m715a_fieldset legend{margin-bottom:6px;padding:0;font-weight:500}._3m715a_lifetimes{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;display:grid}._3m715a_choice{border:1px solid var(--creator-confirm-border);cursor:pointer;border-radius:7px;align-items:flex-start;gap:6px;min-width:0;padding:8px;display:flex}._3m715a_choice:has(input:checked){background:color-mix(in srgb, var(--creator-confirm-accent) 7%, transparent);border-color:var(--creator-confirm-accent)}._3m715a_choice:has(input:disabled){opacity:.55;cursor:not-allowed}._3m715a_choice input,._3m715a_operations input,._3m715a_acknowledgement input{accent-color:var(--creator-confirm-accent);flex:none;margin:3px 0 0}._3m715a_hint,._3m715a_task{color:var(--creator-confirm-muted);margin:7px 0;font-size:12px}._3m715a_task{color:inherit}._3m715a_details{margin:8px 0}._3m715a_details summary{cursor:pointer;color:var(--creator-confirm-muted);font-size:12px}._3m715a_operations{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 12px;padding:9px 0 4px;display:grid}._3m715a_operations label,._3m715a_acknowledgement{align-items:flex-start;gap:7px;min-width:0;display:flex}._3m715a_operations small{color:var(--creator-confirm-muted);font-size:11px}._3m715a_duration{margin-top:9px;font-size:12px}._3m715a_duration select{color:inherit;border:1px solid var(--creator-confirm-border);font:inherit;background:0 0;border-radius:5px;padding:4px 7px}._3m715a_actions{justify-content:flex-end;margin-top:12px}._3m715a_primary,._3m715a_secondary{min-height:33px;font:inherit;cursor:pointer;border-radius:7px;padding:6px 12px}._3m715a_primary{color:#fff;background:var(--creator-confirm-accent);border:1px solid var(--creator-confirm-accent)}._3m715a_secondary{color:inherit;border:1px solid var(--creator-confirm-border);background:0 0}._3m715a_root button:disabled,._3m715a_root fieldset:disabled{opacity:.6;cursor:not-allowed}._3m715a_root :is(button,input,select,summary):focus-visible{outline:2px solid var(--creator-confirm-accent);outline-offset:3px}._3m715a_confirmation{border:1px solid color-mix(in srgb, var(--creator-confirm-accent) 55%, transparent);background:var(--creator-confirm-fill);border-radius:8px;padding:10px 12px}._3m715a_confirmation h4{margin:0 0 6px;font-size:13px}._3m715a_confirmation p{margin:0 0 8px}._3m715a_acknowledgement{padding-top:5px;font-weight:500}._3m715a_footer{color:var(--creator-confirm-muted);justify-content:space-between;margin-top:10px;font-size:11px}._3m715a_footer button{color:inherit;text-underline-offset:2px;cursor:pointer;font:inherit;background:0 0;border:0;padding:0;text-decoration:underline}._3m715a_reason{white-space:pre-wrap;margin:6px 0 0;font-size:12px}._3m715a_error{color:var(--dsw-alias-state-error-primary,#b42332);margin:8px 0 0;font-size:12px}@media (width<=480px){._3m715a_root{padding:12px}._3m715a_choice{gap:4px;padding:7px 5px;font-size:12px}._3m715a_operations{grid-template-columns:minmax(0,1fr)}._3m715a_target>div,._3m715a_summary>div{grid-template-columns:minmax(0,1fr);gap:1px}._3m715a_actions>button{flex:auto}}@media (prefers-reduced-motion:reduce){._3m715a_root *{scroll-behavior:auto;transition:none;animation:none}}";
		const tagId = "dsh-approve-for-me/creator-approval.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-approve-for-me";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var creator_approval_module_css_default = {
			"acknowledgement": "_3m715a_acknowledgement",
			"actions": "_3m715a_actions",
			"badge": "_3m715a_badge",
			"choice": "_3m715a_choice",
			"confirmation": "_3m715a_confirmation",
			"details": "_3m715a_details",
			"duration": "_3m715a_duration",
			"error": "_3m715a_error",
			"fieldset": "_3m715a_fieldset",
			"footer": "_3m715a_footer",
			"heading": "_3m715a_heading",
			"hint": "_3m715a_hint",
			"lifetimes": "_3m715a_lifetimes",
			"operations": "_3m715a_operations",
			"plugin": "_3m715a_plugin",
			"primary": "_3m715a_primary",
			"reason": "_3m715a_reason",
			"root": "_3m715a_root",
			"secondary": "_3m715a_secondary",
			"summary": "_3m715a_summary",
			"target": "_3m715a_target",
			"task": "_3m715a_task"
		};
		//#endregion
		//#region src/client/creator-approval.tsx
		let nextPresentationKey = 0;
		/** Exactly one answerable, Session-scoped presentation. Its key is not a Host authorization token. */
		var PendingCreatorApproval = class {
			sessionId;
			kind = "creator-approval";
			key;
			prompt;
			result;
			#resolve;
			#reject;
			#signal;
			#onAbort;
			#delegated = Symbol("creator approval delegated");
			#listeners = /* @__PURE__ */ new Set();
			#status = "pending";
			constructor(sessionId, presentation) {
				this.sessionId = sessionId;
				if (typeof sessionId !== "string" || sessionId.length === 0) throw new TypeError("Creator approval requires a scoped Session");
				this.prompt = parseCreatorApprovalPrompt(presentation.prompt);
				Object.freeze(this.prompt.availableOperations);
				Object.freeze(this.prompt);
				this.key = `creator-approval:${globalThis.crypto.randomUUID()}:${String(++nextPresentationKey)}`;
				let resolve;
				let reject;
				this.result = new Promise((done, failed) => {
					resolve = done;
					reject = failed;
				});
				this.#resolve = resolve;
				this.#reject = reject;
				this.#signal = presentation.signal;
				this.#onAbort = presentation.signal === void 0 ? void 0 : () => {
					this.abort(presentation.signal?.reason);
				};
				if (this.#onAbort !== void 0) {
					presentation.signal.addEventListener("abort", this.#onAbort, { once: true });
					if (presentation.signal.aborted) this.#onAbort();
				}
			}
			getSnapshot = () => this.#status;
			subscribe = (listener) => {
				this.#listeners.add(listener);
				return () => {
					this.#listeners.delete(listener);
				};
			};
			/** Explicit UI decision only; validation never turns a native/AI result into a remembered grant. */
			answer(value) {
				try {
					if (this.#signal?.aborted) this.abort(this.#signal.reason);
					const result = parseCreatorApprovalResult(value, this.prompt);
					if (result.decision === "allow") Object.freeze(result.operations);
					Object.freeze(result);
					this.finish("answered", () => {
						this.#resolve(result);
					});
					return Promise.resolve();
				} catch (error) {
					return Promise.reject(error);
				}
			}
			/** User cancellation or plugin-domain teardown delegates without creating an answer. */
			delegate() {
				if (this.#status === "pending") this.finish("delegated", () => {
					this.#reject(this.#delegated);
				});
			}
			isDelegation(reason) {
				return reason === this.#delegated;
			}
			/** A Host/transport abort cancels, rather than opening a fresh fallback question. */
			abort(reason = /* @__PURE__ */ new Error("Creator approval cancelled")) {
				if (this.#status === "pending") this.finish("cancelled", () => {
					this.#reject(reason);
				});
			}
			finish(status, settle) {
				if (this.#status !== "pending") throw new Error("Creator approval is already settled");
				this.#status = status;
				if (this.#signal !== void 0 && this.#onAbort !== void 0) this.#signal.removeEventListener("abort", this.#onAbort);
				settle();
				for (const listener of this.#listeners) try {
					listener();
				} catch {}
				this.#listeners.clear();
			}
		};
		function createCreatorApprovalDraft(prompt) {
			return {
				lifetime: "once",
				operations: [parseCreatorApprovalPrompt(prompt).currentOperation],
				rememberDays: 1,
				operationsExpanded: false,
				phase: "edit",
				acknowledged: false
			};
		}
		/** Pure interaction state: selecting scopes/options never settles a request. */
		function reduceCreatorApprovalDraft(prompt, state, action) {
			const next = {
				...state,
				operations: [...state.operations]
			};
			const edit = () => ({
				...next,
				phase: "edit",
				acknowledged: false
			});
			switch (action.type) {
				case "lifetime":
					if (![
						"once",
						"task",
						"remember"
					].includes(action.value) || action.value === "task" && !prompt.allowTask || action.value === "remember" && !prompt.allowRemember) return next;
					if (next.lifetime === action.value) return next;
					return {
						...edit(),
						lifetime: action.value,
						operations: [prompt.currentOperation],
						operationsExpanded: false
					};
				case "operations-expanded": return {
					...edit(),
					operationsExpanded: next.lifetime !== "once" && action.value === true
				};
				case "operation":
					if (next.lifetime === "once" || !next.operationsExpanded || action.operation === prompt.currentOperation || !prompt.availableOperations.includes(action.operation)) return next;
					return {
						...edit(),
						operations: prompt.availableOperations.filter((operation) => operation === prompt.currentOperation || (operation === action.operation ? action.selected : next.operations.includes(operation)))
					};
				case "remember-days":
					if (![
						1,
						7,
						30
					].includes(action.value)) return next;
					return {
						...edit(),
						rememberDays: action.value
					};
				case "review": return next.lifetime === "remember" && prompt.allowRemember ? {
					...next,
					phase: "confirm-remember",
					acknowledged: false,
					operationsExpanded: false
				} : next;
				case "back": return edit();
				case "acknowledge": return next.lifetime === "remember" && next.phase === "confirm-remember" ? {
					...next,
					acknowledged: action.value === true
				} : next;
			}
		}
		/** A remember reply requires a separate review step AND an initially unchecked acknowledgement. */
		function creatorApprovalDraftResult(prompt, state) {
			if (state.lifetime === "remember" && (state.phase !== "confirm-remember" || !state.acknowledged)) return void 0;
			try {
				return parseCreatorApprovalResult({
					decision: "allow",
					lifetime: state.lifetime,
					operations: state.operations,
					...state.lifetime === "remember" ? { rememberDays: state.rememberDays } : {}
				}, prompt);
			} catch {
				return;
			}
		}
		const CREATOR_APPROVAL_COPY = {
			zh: {
				title: "Creator+ 操作确认",
				once: "仅这一次",
				task: "本任务",
				remember: "跨任务记住",
				scope: "授权范围",
				source: "插件来源",
				workspace: "工作区",
				currentTask: "当前任务",
				onceHint: "只批准当前请求，不创建可重用授权。",
				taskHint: "仅在 Host 确认的当前任务内有效。",
				rememberHint: "仅记住所列插件、工作区和操作；每次执行仍需重新检查。",
				unavailable: "当前请求不支持",
				operationScope: "操作范围",
				current: "当前操作",
				duration: "有效期",
				day: "天",
				days: "天",
				review: "核对记住范围",
				reviewTitle: "确认跨任务授权",
				futureVersions: "这会允许上述插件的未来版本在所列工作区内使用选定操作；不会跳过每次执行的安全检查。",
				acknowledgement: "我确认授权上述未来版本、操作范围和有效期。",
				allow: "允许",
				confirmRemember: "确认记住并允许",
				reject: "拒绝",
				cancel: "返回默认审批",
				back: "返回修改",
				reason: "请求说明",
				boundary: "不会扩大沙箱权限，也不会覆盖 never 策略。",
				settled: "此请求已结束，不能再次提交。",
				settlementFailed: "未能提交确认；没有报告授权成功。",
				operations: {
					check: "检查",
					"activation-plan": "激活计划",
					"hot-reload": "热替换",
					"activate-new-client": "激活新客户端"
				}
			},
			en: {
				title: "Creator+ confirmation",
				once: "Just once",
				task: "This task",
				remember: "Remember across tasks",
				scope: "Authorization scope",
				source: "Plugin source",
				workspace: "Workspace",
				currentTask: "Current task",
				onceHint: "Approve only this request, without a reusable authorization.",
				taskHint: "Valid only within the current task identified by the Host.",
				rememberHint: "Remember only this plugin, workspace and selected operations. Each execution is checked again.",
				unavailable: "Not available for this request",
				operationScope: "Operations",
				current: "Current operation",
				duration: "Expires after",
				day: "day",
				days: "days",
				review: "Review remembered scope",
				reviewTitle: "Confirm cross-task authorization",
				futureVersions: "This covers future versions of the plugin above, for the selected operations in this workspace. Execution safety checks still apply.",
				acknowledgement: "I confirm these future versions, selected operations and expiration.",
				allow: "Allow",
				confirmRemember: "Remember and allow",
				reject: "Reject",
				cancel: "Use default approval",
				back: "Back to edit",
				reason: "Request details",
				boundary: "Does not expand sandbox permissions or override a never policy.",
				settled: "This request has ended and cannot be answered again.",
				settlementFailed: "Confirmation was not submitted; authorization was not reported as successful.",
				operations: {
					check: "Check",
					"activation-plan": "Activation plan",
					"hot-reload": "Hot reload",
					"activate-new-client": "Activate new client"
				}
			}
		};
		/** Controlled production view, also renderable without a live Host for isolated layout tests. */
		function CreatorApprovalView({ prompt, draft, idPrefix, busy = false, error, copy = CREATOR_APPROVAL_COPY.zh, onAction, onSubmit, onReject, onCancel }) {
			const remembering = draft.lifetime === "remember";
			const reviewing = remembering && draft.phase === "confirm-remember";
			const titleId = `${idPrefix}-title`;
			const summaryId = `${idPrefix}-future`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: creator_approval_module_css_default.root,
				"aria-labelledby": titleId,
				"aria-busy": busy,
				"data-creator-approval": prompt.id,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: creator_approval_module_css_default.heading,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: titleId,
							children: copy.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: creator_approval_module_css_default.badge,
							children: copy.operations[prompt.currentOperation]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						className: creator_approval_module_css_default.plugin,
						children: prompt.pluginId
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
						className: creator_approval_module_css_default.target,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: copy.source }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: prompt.sourceLabel })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: copy.workspace }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: prompt.workspaceLabel })] })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("form", {
						onSubmit: (event) => {
							event.preventDefault();
							if (!busy) onSubmit();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
							className: creator_approval_module_css_default.fieldset,
							disabled: busy,
							children: [reviewing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: creator_approval_module_css_default.confirmation,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", { children: copy.reviewTitle }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										id: summaryId,
										children: copy.futureVersions
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
										className: creator_approval_module_css_default.summary,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: copy.operationScope }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: draft.operations.map((operation) => copy.operations[operation]).join(" · ") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: copy.duration }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dd", { children: [
											draft.rememberDays,
											" ",
											draft.rememberDays === 1 ? copy.day : copy.days
										] })] })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: creator_approval_module_css_default.acknowledgement,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											required: true,
											checked: draft.acknowledged,
											"aria-describedby": summaryId,
											onChange: (event) => onAction({
												type: "acknowledge",
												value: event.target.checked
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: copy.acknowledgement })]
									})
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
									className: creator_approval_module_css_default.fieldset,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("legend", { children: copy.scope }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: creator_approval_module_css_default.lifetimes,
										children: [
											"once",
											"task",
											"remember"
										].map((lifetime) => {
											const unavailable = lifetime === "task" ? !prompt.allowTask : lifetime === "remember" ? !prompt.allowRemember : false;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: creator_approval_module_css_default.choice,
												title: unavailable ? copy.unavailable : void 0,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "radio",
													name: `${idPrefix}-lifetime`,
													value: lifetime,
													checked: draft.lifetime === lifetime,
													disabled: unavailable,
													onChange: () => onAction({
														type: "lifetime",
														value: lifetime
													})
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: copy[lifetime] })]
											}, lifetime);
										})
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: creator_approval_module_css_default.hint,
									children: draft.lifetime === "once" ? copy.onceHint : draft.lifetime === "task" ? copy.taskHint : copy.rememberHint
								}),
								draft.lifetime === "task" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: creator_approval_module_css_default.task,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [copy.currentTask, ": "] }), prompt.taskLabel]
								}),
								draft.lifetime !== "once" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
									className: creator_approval_module_css_default.details,
									open: draft.operationsExpanded,
									onToggle: (event) => onAction({
										type: "operations-expanded",
										value: event.currentTarget.open
									}),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
										copy.operationScope,
										" · ",
										draft.operations.length
									] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: creator_approval_module_css_default.operations,
										children: prompt.availableOperations.map((operation) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.operations.includes(operation),
											disabled: operation === prompt.currentOperation,
											onChange: (event) => onAction({
												type: "operation",
												operation,
												selected: event.target.checked
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [copy.operations[operation], operation === prompt.currentOperation && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [" · ", copy.current] })] })] }, operation))
									})]
								}),
								remembering && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: creator_approval_module_css_default.duration,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: copy.duration }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										value: draft.rememberDays,
										onChange: (event) => onAction({
											type: "remember-days",
											value: Number(event.target.value)
										}),
										children: [
											1,
											7,
											30
										].map((days) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
											value: days,
											children: [
												days,
												" ",
												days === 1 ? copy.day : copy.days
											]
										}, days))
									})]
								})
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: creator_approval_module_css_default.actions,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: creator_approval_module_css_default.secondary,
										onClick: onReject,
										children: copy.reject
									}),
									reviewing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: creator_approval_module_css_default.secondary,
										onClick: () => onAction({ type: "back" }),
										children: copy.back
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "submit",
										className: creator_approval_module_css_default.primary,
										disabled: reviewing && !draft.acknowledged,
										children: reviewing ? copy.confirmRemember : remembering ? copy.review : copy.allow
									})
								]
							})]
						})
					}),
					busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						className: creator_approval_module_css_default.hint,
						children: copy.settled
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "alert",
						className: creator_approval_module_css_default.error,
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("footer", {
						className: creator_approval_module_css_default.footer,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: copy.boundary }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							disabled: busy,
							onClick: onCancel,
							children: copy.cancel
						})]
					}),
					prompt.reason && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: creator_approval_module_css_default.details,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: copy.reason }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: creator_approval_module_css_default.reason,
							children: prompt.reason
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/creator-consent-transport.tsx
		/** Separate public pending kind: the old immediate-answer card cannot capture an ACK-gated request. */
		var PendingCreatorConsent = class {
			kind = "creator-consent";
			key;
			sessionId;
			result;
			#owner;
			constructor(pending, owner) {
				this.key = pending.key;
				this.sessionId = pending.sessionId;
				this.result = pending.result;
				this.#owner = owner;
			}
			belongsTo(owner) {
				return this.#owner === owner;
			}
		};
		const MAX = 64;
		const TTL = 3e5;
		const NOTICE_TTL = 3e4;
		function object(value, keys) {
			if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("Invalid confirmation transport data");
			const copy = Object.create(null);
			for (const key of Reflect.ownKeys(value)) {
				if (typeof key !== "string" || !keys.includes(key)) throw new TypeError("Unexpected confirmation transport field");
				const property = Object.getOwnPropertyDescriptor(value, key);
				if (property === void 0 || !property.enumerable || !("value" in property)) throw new TypeError("Invalid confirmation transport property");
				copy[key] = property.value;
			}
			return copy;
		}
		function item(value, withNonce) {
			const data = object(value, withNonce ? [
				"prompt",
				"expiresAt",
				"viewNonce"
			] : ["prompt", "expiresAt"]);
			const prompt = parseCreatorApprovalPrompt(data["prompt"]);
			Object.freeze(prompt.availableOperations);
			Object.freeze(prompt);
			if (typeof data["expiresAt"] !== "number" || !Number.isSafeInteger(data["expiresAt"]) || data["expiresAt"] <= 0) throw new TypeError("Invalid confirmation deadline");
			if (!withNonce) return {
				prompt,
				expiresAt: data["expiresAt"]
			};
			if (typeof data["viewNonce"] !== "string" || !/^[A-Za-z0-9._:-]{1,256}$/.test(data["viewNonce"])) throw new TypeError("Invalid confirmation view");
			return {
				prompt,
				expiresAt: data["expiresAt"],
				viewNonce: data["viewNonce"]
			};
		}
		function listItems(value) {
			if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > MAX || Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError("Invalid confirmation list");
			const result = [];
			const ids = /* @__PURE__ */ new Set();
			for (let index = 0; index < value.length; index += 1) {
				const property = Object.getOwnPropertyDescriptor(value, String(index));
				if (property === void 0 || !("value" in property)) throw new TypeError("Invalid confirmation list entry");
				const parsed = item(property.value, false);
				if (ids.has(parsed.prompt.id)) throw new TypeError("Duplicate confirmation request");
				ids.add(parsed.prompt.id);
				result.push(parsed);
			}
			return result;
		}
		function ack(value, id, kind) {
			const data = object(value, ["id", "status"]);
			if (data["id"] !== id || data["status"] !== "duplicate" && data["status"] !== (kind === "confirm" ? "accepted" : "delegated")) throw new TypeError("Missing matching server acknowledgement");
		}
		function sessionId(value) {
			return typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\u0000-\u0020\u007f-\u009f]/.test(value);
		}
		function boundedNumber(value, min, max) {
			if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError("Invalid confirmation polling limit");
			return value;
		}
		/** Abort races consume late results/rejections even if an injected transport ignores its signal. */
		async function request(parent, timeoutMs, invoke) {
			const controller = new AbortController();
			const abort = () => {
				controller.abort();
			};
			parent.addEventListener("abort", abort, { once: true });
			if (parent.aborted) abort();
			let reject;
			const aborted = new Promise((_resolve, failed) => {
				reject = failed;
			});
			const rejectAbort = () => {
				reject(/* @__PURE__ */ new Error("Local request ended; server outcome unknown"));
			};
			controller.signal.addEventListener("abort", rejectAbort, { once: true });
			if (controller.signal.aborted) rejectAbort();
			const timer = setTimeout(abort, timeoutMs);
			try {
				return await Promise.race([aborted, Promise.resolve().then(() => {
					controller.signal.throwIfAborted();
					return invoke(controller.signal);
				})]);
			} finally {
				clearTimeout(timer);
				parent.removeEventListener("abort", abort);
				controller.signal.removeEventListener("abort", rejectAbort);
				controller.abort();
			}
		}
		/**
		* Root-plugin-owned state, not React-owned request lifetime. Up to 64 known ids
		* (including short-lived completed-id tombstones) are retained until original TTL;
		* never evict a seen id early and accidentally present it again. Expired unknown
		* notices can remain visible for at most 30s, but network/actions stop at TTL.
		*/
		var CreatorConsentController = class {
			ownerTag = Symbol("creator-consent-controller");
			#transport;
			#publish;
			#now;
			#pollMs;
			#requestTimeoutMs;
			#limit;
			#root = new AbortController();
			#entries = /* @__PURE__ */ new Map();
			#observations = /* @__PURE__ */ new Map();
			#listeners = /* @__PURE__ */ new Set();
			#external;
			#externalAbort;
			#lastNow;
			#pollTimer;
			#polling;
			#closed = false;
			#connection = "idle";
			constructor(options) {
				if (options === null || typeof options !== "object" || typeof options.publish !== "function" || [
					"list",
					"present",
					"confirm",
					"delegate"
				].some((key) => typeof options.transport?.[key] !== "function")) throw new TypeError("Explicit confirmation transport and publisher are required");
				this.#transport = options.transport;
				this.#publish = options.publish;
				this.#now = options.now ?? Date.now;
				if (typeof this.#now !== "function") throw new TypeError("A synchronous clock is required");
				this.#pollMs = boundedNumber(options.pollMs ?? 1500, 100, 3e4);
				this.#requestTimeoutMs = boundedNumber(options.requestTimeoutMs ?? 1e4, 1, 3e4);
				this.#limit = boundedNumber(options.maxPending ?? MAX, 1, MAX);
				this.#external = options.signal;
				this.#externalAbort = () => {
					this.dispose();
				};
				this.#external?.addEventListener("abort", this.#externalAbort, { once: true });
				if (this.#external?.aborted) this.dispose();
			}
			subscribe = (listener) => {
				this.#listeners.add(listener);
				return () => {
					this.#listeners.delete(listener);
				};
			};
			snapshot(id) {
				return this.#entries.get(id)?.snapshot;
			}
			snapshotByPending(pending) {
				for (const entry of this.#entries.values()) if (entry.publicPending === pending) return entry.snapshot;
			}
			health() {
				return {
					closed: this.#closed,
					known: this.#entries.size,
					observations: this.#observations.size,
					connection: this.#connection
				};
			}
			/** A read-only observation lease. Releasing it does NOT delegate/cancel any Host request. */
			observeSession(id) {
				if (this.#closed) return () => {};
				if (!sessionId(id) || this.#observations.size >= MAX) throw new TypeError("Invalid confirmation session observation");
				const token = Symbol("composer observation");
				this.#observations.set(token, id);
				this.#clearPollTimer();
				this.#schedule(0);
				return () => {
					this.#observations.delete(token);
					if (!this.#hasWork()) this.#clearPollTimer();
				};
			}
			pollNow() {
				if (this.#closed) return Promise.resolve();
				if (this.#polling !== void 0) return this.#polling;
				this.#clearPollTimer();
				this.#polling = this.#poll().catch(() => {
					if (!this.#closed) this.#connection = "unavailable";
				}).finally(() => {
					this.#polling = void 0;
					this.#schedule(this.#pollMs);
				});
				return this.#polling;
			}
			/** Called by the elected card's mount effect, not every poll or a render-time selector. */
			ensurePresented(id) {
				const entry = this.#entries.get(id);
				if (entry === void 0 || !this.#live(entry) || entry.attemptedPresent) return entry?.work ?? Promise.resolve(entry?.phase === "ready");
				entry.attemptedPresent = true;
				entry.phase = "presenting";
				this.#emit(entry);
				entry.work = (async () => {
					try {
						const value = item(await request(entry.signal.signal, this.#timeout(entry), (signal) => this.#transport.present(id, entry.sessionId, signal)), true);
						if (!this.#live(entry) || entry.phase !== "presenting") return false;
						if (value.prompt.id !== id || JSON.stringify(value.prompt) !== entry.fingerprint || value.expiresAt !== entry.expiresAt) throw new TypeError("Confirmation view changed its request");
						entry.nonce = value.viewNonce;
						entry.phase = "ready";
						this.#emit(entry);
						return true;
					} catch {
						if (this.#live(entry)) {
							entry.phase = "unknown";
							this.#emit(entry);
						}
						return false;
					} finally {
						entry.work = void 0;
					}
				})();
				return entry.work;
			}
			change(id, action) {
				const entry = this.#entries.get(id);
				if (entry === void 0 || !this.#live(entry) || entry.phase !== "ready" || entry.intent !== void 0) return;
				entry.draft = reduceCreatorApprovalDraft(entry.prompt, entry.draft, action);
				this.#emit(entry);
			}
			submit(id) {
				const entry = this.#entries.get(id);
				if (entry === void 0 || !this.#live(entry) || entry.phase !== "ready" || entry.intent !== void 0) return Promise.resolve(false);
				if (entry.draft.lifetime === "remember" && entry.draft.phase === "edit") {
					this.change(id, { type: "review" });
					return Promise.resolve(false);
				}
				const answer = creatorApprovalDraftResult(entry.prompt, entry.draft);
				if (answer === void 0) return Promise.resolve(false);
				return this.#start(entry, {
					kind: "confirm",
					answer: parseCreatorApprovalResult(answer, entry.prompt)
				});
			}
			reject(id) {
				const entry = this.#entries.get(id);
				return entry !== void 0 && this.#live(entry) && entry.phase === "ready" && entry.intent === void 0 ? this.#start(entry, {
					kind: "confirm",
					answer: { decision: "reject" }
				}) : Promise.resolve(false);
			}
			delegate(id) {
				const entry = this.#entries.get(id);
				return entry !== void 0 && this.#live(entry) && entry.phase === "ready" && entry.intent === void 0 ? this.#start(entry, { kind: "delegate" }) : Promise.resolve(false);
			}
			/** Only the exact already-submitted intent may be retried after a missing ACK. */
			retry(id) {
				const entry = this.#entries.get(id);
				return entry !== void 0 && this.#live(entry) && entry.phase === "unknown" && entry.intent !== void 0 ? this.#start(entry, entry.intent) : Promise.resolve(false);
			}
			/** Close a local unknown notice. This says nothing about rejection/execution on the Host. */
			dismiss(id) {
				const entry = this.#entries.get(id);
				if (entry === void 0 || !["unknown", "ended"].includes(entry.phase)) return;
				entry.phase = "dismissed";
				entry.signal.abort();
				this.#remove(entry);
				this.#emit(entry);
			}
			dispose() {
				if (this.#closed) return;
				this.#closed = true;
				this.#connection = "closed";
				this.#root.abort();
				this.#clearPollTimer();
				this.#external?.removeEventListener("abort", this.#externalAbort);
				for (const entry of this.#entries.values()) {
					entry.signal.abort();
					entry.pending.abort(/* @__PURE__ */ new Error("Local publisher closed; Host outcome unknown"));
					this.#remove(entry);
					if (entry.timer !== void 0) clearTimeout(entry.timer);
					if (entry.noticeTimer !== void 0) clearTimeout(entry.noticeTimer);
				}
				this.#entries.clear();
				this.#observations.clear();
				this.#notify();
				this.#listeners.clear();
			}
			#start(entry, intent) {
				if (entry.work !== void 0) return entry.work;
				if (entry.nonce === void 0 || !this.#live(entry)) return Promise.resolve(false);
				if (intent.kind === "confirm") {
					if (intent.answer.decision === "allow") Object.freeze(intent.answer.operations);
					Object.freeze(intent.answer);
				}
				entry.intent = Object.freeze(intent);
				entry.phase = intent.kind === "confirm" ? "confirming" : "delegating";
				this.#emit(entry);
				const nonce = entry.nonce;
				entry.work = (async () => {
					try {
						const value = await request(entry.signal.signal, this.#timeout(entry), (signal) => intent.kind === "confirm" ? this.#transport.confirm(Object.freeze({
							id: entry.id,
							viewNonce: nonce,
							answer: intent.answer
						}), signal) : this.#transport.delegate(Object.freeze({
							id: entry.id,
							viewNonce: nonce
						}), signal));
						if (!this.#live(entry)) return false;
						ack(value, entry.id, intent.kind);
						if (intent.kind === "confirm") await entry.pending.answer(intent.answer);
						else entry.pending.delegate();
						entry.phase = "acknowledged";
						entry.nonce = void 0;
						this.#remove(entry);
						this.#emit(entry);
						return true;
					} catch {
						if (this.#live(entry)) {
							entry.phase = "unknown";
							this.#emit(entry);
						}
						return false;
					} finally {
						entry.work = void 0;
					}
				})();
				return entry.work;
			}
			async #poll() {
				const sessions = new Set(this.#observations.values());
				for (const entry of this.#entries.values()) if (this.#pollable(entry)) sessions.add(entry.sessionId);
				for (const id of sessions) {
					if (this.#closed) return;
					if (!this.#observed(id) && ![...this.#entries.values()].some((entry) => entry.sessionId === id && this.#pollable(entry))) continue;
					try {
						const values = listItems(await request(this.#root.signal, this.#requestTimeoutMs, (signal) => this.#transport.list(id, signal)));
						if (this.#closed) return;
						const now = this.#time();
						const known = new Set(values.map((value) => value.prompt.id));
						for (const entry of this.#entries.values()) {
							if (entry.sessionId !== id || !this.#pollable(entry)) continue;
							entry.listed = known.has(entry.id);
							if (!entry.listed && entry.intent === void 0) this.#end(entry);
							else this.#emit(entry);
						}
						for (const value of values) {
							const existing = this.#entries.get(value.prompt.id);
							if (existing !== void 0) {
								if (existing.sessionId !== id || existing.fingerprint !== JSON.stringify(value.prompt) || existing.expiresAt !== value.expiresAt) this.#end(existing);
								continue;
							}
							if (!this.#observed(id) || value.expiresAt <= now || value.expiresAt > now + TTL) continue;
							if (this.#entries.size >= this.#limit) {
								this.#connection = "capacity";
								continue;
							}
							this.#add(id, value);
						}
						if (this.#closed) return;
						if (this.#connection !== "capacity") this.#connection = "ready";
					} catch {
						if (!this.#closed) this.#connection = "unavailable";
					}
				}
			}
			#add(id, value) {
				const signal = new AbortController();
				const pending = new PendingCreatorApproval(id, {
					prompt: value.prompt,
					signal: signal.signal
				});
				pending.result.catch(() => {});
				const publicPending = new PendingCreatorConsent(pending, this.ownerTag);
				const initial = {
					pending: publicPending,
					prompt: value.prompt,
					expiresAt: value.expiresAt,
					draft: createCreatorApprovalDraft(value.prompt),
					phase: "discovered",
					listed: true,
					canRetry: false
				};
				const entry = {
					id: value.prompt.id,
					sessionId: id,
					prompt: value.prompt,
					fingerprint: JSON.stringify(value.prompt),
					expiresAt: value.expiresAt,
					pending,
					publicPending,
					signal,
					remove: void 0,
					timer: void 0,
					noticeTimer: void 0,
					phase: "discovered",
					draft: initial.draft,
					listed: true,
					attemptedPresent: false,
					nonce: void 0,
					intent: void 0,
					work: void 0,
					snapshot: Object.freeze(initial)
				};
				this.#entries.set(entry.id, entry);
				try {
					const remove = this.#publish(publicPending, async () => {
						this.dispose();
					});
					if (this.#closed || this.#entries.get(entry.id) !== entry) {
						remove();
						return;
					}
					entry.remove = remove;
					const delay = Math.max(1, value.expiresAt - this.#time());
					if (this.#closed) return;
					entry.timer = setTimeout(() => {
						try {
							if (this.#time() < entry.expiresAt) {
								this.dispose();
								return;
							}
						} catch {
							return;
						}
						if (["acknowledged", "dismissed"].includes(entry.phase)) this.#forget(entry);
						else this.#end(entry, true);
					}, delay);
					this.#emit(entry);
				} catch {
					this.dispose();
				}
			}
			#end(entry, expires = false) {
				if (["acknowledged", "dismissed"].includes(entry.phase)) {
					if (expires) this.#forget(entry);
					return;
				}
				entry.phase = "ended";
				entry.nonce = void 0;
				entry.signal.abort();
				entry.pending.abort(/* @__PURE__ */ new Error("Request ended locally; server outcome unknown"));
				this.#emit(entry);
				if (!this.#closed && entry.noticeTimer === void 0) entry.noticeTimer = setTimeout(() => {
					entry.noticeTimer = void 0;
					try {
						if (this.#time() >= entry.expiresAt) this.#forget(entry);
						else this.dismiss(entry.id);
					} catch {}
				}, NOTICE_TTL);
			}
			#forget(entry) {
				this.#remove(entry);
				entry.signal.abort();
				if (entry.timer !== void 0) clearTimeout(entry.timer);
				if (entry.noticeTimer !== void 0) clearTimeout(entry.noticeTimer);
				this.#entries.delete(entry.id);
				this.#notify();
			}
			#remove(entry) {
				const remove = entry.remove;
				entry.remove = void 0;
				try {
					remove?.();
				} catch {}
			}
			#emit(entry) {
				Object.freeze(entry.draft.operations);
				Object.freeze(entry.draft);
				entry.snapshot = Object.freeze({
					pending: entry.publicPending,
					prompt: entry.prompt,
					expiresAt: entry.expiresAt,
					draft: entry.draft,
					phase: entry.phase,
					listed: entry.listed,
					canRetry: entry.phase === "unknown" && entry.intent !== void 0 && entry.nonce !== void 0
				});
				this.#notify();
			}
			#notify() {
				for (const listener of this.#listeners) try {
					listener();
				} catch {}
			}
			#time() {
				let now;
				try {
					now = this.#now();
				} catch {
					this.dispose();
					throw new Error("Invalid local confirmation clock");
				}
				if (typeof now !== "number" || !Number.isSafeInteger(now) || now < 0 || this.#lastNow !== void 0 && now < this.#lastNow) {
					this.dispose();
					if (now !== null && (typeof now === "object" || typeof now === "function")) try {
						Promise.resolve(now).then(() => {}, () => {});
					} catch {}
					throw new Error("Invalid local confirmation clock");
				}
				this.#lastNow = now;
				return now;
			}
			#live(entry) {
				if (this.#closed || this.#entries.get(entry.id) !== entry || [
					"ended",
					"acknowledged",
					"dismissed"
				].includes(entry.phase)) return false;
				try {
					if (this.#time() >= entry.expiresAt) {
						this.#end(entry, true);
						return false;
					}
				} catch {
					return false;
				}
				return !entry.signal.signal.aborted;
			}
			#timeout(entry) {
				return Math.max(1, Math.min(this.#requestTimeoutMs, entry.expiresAt - this.#time()));
			}
			#pollable(entry) {
				return ![
					"ended",
					"acknowledged",
					"dismissed"
				].includes(entry.phase);
			}
			#observed(id) {
				return [...this.#observations.values()].includes(id);
			}
			#hasWork() {
				return this.#observations.size > 0 || [...this.#entries.values()].some((entry) => this.#pollable(entry));
			}
			#clearPollTimer() {
				if (this.#pollTimer !== void 0) {
					clearTimeout(this.#pollTimer);
					this.#pollTimer = void 0;
				}
			}
			#schedule(delay) {
				if (this.#closed || this.#polling !== void 0 || this.#pollTimer !== void 0 || !this.#hasWork()) return;
				this.#pollTimer = setTimeout(() => {
					this.#pollTimer = void 0;
					this.pollNow();
				}, delay);
			}
		};
		const CREATOR_CONSENT_TRANSPORT_COPY = {
			zh: {
				preparing: "正在准备服务器确认视图…",
				waiting: "正在等待服务器确认回执…",
				disappeared: "请求已从待办消失，尚未收到确认回执；状态未知。",
				unknown: "未收到可靠的服务器回执；状态未知，不代表已拒绝或未执行。",
				ended: "本地等待已结束；服务器状态未知，不代表已拒绝或未执行。",
				retry: "重试同一提交",
				dismiss: "关闭本地提示"
			},
			en: {
				preparing: "Preparing the server confirmation view…",
				waiting: "Waiting for the server acknowledgement…",
				disappeared: "The request is no longer listed, but no acknowledgement has arrived. Its status is unknown.",
				unknown: "No reliable server acknowledgement. The outcome is unknown, not rejected or known to be unexecuted.",
				ended: "Local waiting has ended. The server outcome is unknown, not rejected or known to be unexecuted.",
				retry: "Retry the same submission",
				dismiss: "Dismiss local notice"
			}
		};
		function CreatorConsentSessionObserver({ sessionId, controller }) {
			(0, react.useEffect)(() => controller.observeSession(sessionId), [controller, sessionId]);
			return null;
		}
		/** Actual controlled view; unknown/ended messages deliberately make no saved/rejected/executed claim. */
		function CreatorConsentView({ snapshot, controller, locale = "zh" }) {
			const { prompt, draft, phase } = snapshot;
			const copy = CREATOR_CONSENT_TRANSPORT_COPY[locale];
			const message = phase === "ended" ? copy.ended : phase === "unknown" ? copy.unknown : phase === "confirming" || phase === "delegating" ? snapshot.listed ? copy.waiting : copy.disappeared : copy.preparing;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-creator-consent-phase": phase,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreatorApprovalView, {
						prompt,
						draft,
						idPrefix: snapshot.pending.key,
						busy: phase !== "ready",
						copy: {
							...CREATOR_APPROVAL_COPY[locale],
							settled: message
						},
						onAction: (action) => controller.change(prompt.id, action),
						onSubmit: () => {
							controller.submit(prompt.id);
						},
						onReject: () => {
							controller.reject(prompt.id);
						},
						onCancel: () => {
							controller.delegate(prompt.id);
						}
					}),
					snapshot.canRetry && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => {
							controller.retry(prompt.id);
						},
						children: copy.retry
					}),
					(phase === "unknown" || phase === "ended") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => controller.dismiss(prompt.id),
						children: copy.dismiss
					})
				]
			});
		}
		function CreatorConsentCard({ pending, controller, locale = "zh" }) {
			const read = () => controller.snapshotByPending(pending);
			const snapshot = (0, react.useSyncExternalStore)(controller.subscribe, read, read);
			(0, react.useEffect)(() => {
				if (snapshot !== void 0) controller.ensurePresented(snapshot.prompt.id);
			}, [controller, pending]);
			return snapshot === void 0 || ["acknowledged", "dismissed"].includes(snapshot.phase) ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreatorConsentView, {
				snapshot,
				controller,
				locale
			});
		}
		function registerCreatorConsentTransport(ctx, transport, options = {}) {
			const publish = ctx.uiSession.registerPendingInteraction(() => 0);
			const controller = new CreatorConsentController({
				...options,
				transport,
				publish
			});
			const owner = controller.ownerTag;
			ctx.effect(() => () => {
				controller.dispose();
			}, "Creator 确认轮询生命周期");
			ctx.slots.inject("conversation.input.overlay", () => ctx.slots.register({
				name: "conversation.input.overlay",
				id: "creator-consent-observer"
			}, ({ sessionId }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreatorConsentSessionObserver, {
				sessionId,
				controller
			})));
			ctx.slots.inject("conversation.composer", () => ctx.slots.register({
				name: "conversation.composer",
				priority: 2,
				select: ({ sessionId, pendingInteraction }) => pendingInteraction instanceof PendingCreatorConsent && pendingInteraction.belongsTo(owner) && pendingInteraction.sessionId === sessionId ? pendingInteraction : null
			}, ({ matched }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreatorConsentCard, {
				pending: matched,
				controller,
				...options.locale === void 0 ? {} : { locale: options.locale }
			}, matched.key)));
			return controller;
		}
		//#endregion
		//#region src/client/creator-consent-http.ts
		async function read(response) {
			let value;
			try {
				value = await response.json();
			} catch {
				throw new Error("Invalid confirmation response");
			}
			if (!response.ok) throw new Error(typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "Confirmation request failed");
			return value;
		}
		function createCreatorConsentHttpTransport() {
			return {
				async list(sessionId, signal) {
					const query = new URLSearchParams({ sessionId });
					const value = await read(await fetch(`${CREATOR_CONSENT_API_PATH}?${query.toString()}`, {
						credentials: "same-origin",
						cache: "no-store",
						signal
					}));
					if (!Array.isArray(value)) throw new Error("Invalid confirmation list");
					return value;
				},
				async present(id, sessionId, signal) {
					return await read(await fetch(CREATOR_CONSENT_API_PATH, {
						method: "POST",
						credentials: "same-origin",
						signal,
						headers: {
							"x-dsh-approval-ui": "1",
							"content-type": "application/json"
						},
						body: JSON.stringify({
							action: "present",
							id,
							sessionId
						})
					}));
				},
				async confirm(input, signal) {
					return await read(await fetch(CREATOR_CONSENT_API_PATH, {
						method: "POST",
						credentials: "same-origin",
						signal,
						headers: {
							"x-dsh-approval-ui": "1",
							"content-type": "application/json"
						},
						body: JSON.stringify({
							action: "confirm",
							id: input.id,
							viewNonce: input.viewNonce,
							answer: input.answer
						})
					}));
				},
				async delegate(input, signal) {
					return await read(await fetch(CREATOR_CONSENT_API_PATH, {
						method: "POST",
						credentials: "same-origin",
						signal,
						headers: {
							"x-dsh-approval-ui": "1",
							"content-type": "application/json"
						},
						body: JSON.stringify({
							action: "delegate",
							id: input.id,
							viewNonce: input.viewNonce
						})
					}));
				}
			};
		}
		async function getRememberedGrants(signal) {
			const value = await read(await fetch(`${CREATOR_CONSENT_API_PATH}?grants=1`, {
				credentials: "same-origin",
				cache: "no-store",
				...signal === void 0 ? {} : { signal }
			}));
			if (typeof value !== "object" || value === null || !Array.isArray(value.rules) || !Number.isSafeInteger(value.revision)) throw new Error("Invalid remembered-rule response");
			return value;
		}
		async function revokeRememberedGrant(id, expectedRevision) {
			const value = await read(await fetch(CREATOR_CONSENT_API_PATH, {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"x-dsh-approval-ui": "1",
					"content-type": "application/json"
				},
				body: JSON.stringify({
					action: "revoke-grant",
					id,
					expectedRevision
				})
			}));
			if (typeof value !== "object" || value === null || value.ok !== true) throw new Error("Invalid remembered-rule response");
			return value;
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-approve-for-me-client";
		const inject = [
			"slots",
			"settingsScope",
			"remote",
			"remote.session",
			"locale",
			"uiSession"
		];
		const SETTINGS_NAMESPACE = "dsh-approve-for-me";
		const TABS = [
			"overview",
			"rules",
			"history",
			"advanced"
		];
		/** Public settings slots only. The card expands the same panel because no general settings-navigation face is public. */
		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
			const copy = {
				t: ctx.locale.bind(LOCALE_NS),
				subscribe: (listener) => ctx.locale.subscribe(listener),
				getSnapshot: () => ctx.locale.getSnapshot()
			};
			ctx.effect(() => ctx.locale.register(LOCALE_NS, {
				zh,
				en
			}), "approve-for-me: owned settings dictionaries");
			registerCreatorConsentTransport(ctx, createCreatorConsentHttpTransport());
			const loadCatalog = async () => {
				const response = await ctx.remote.session.modelCatalog();
				if (!response.ok) throw new Error(response.error.message);
				return response.value.groups.flatMap((group) => group.models.map((model) => ({
					value: JSON.stringify([group.id, model.id]),
					label: `${group.name} · ${model.name}`
				})));
			};
			const injected = () => ({
				scope,
				loadCatalog,
				copy
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: SETTINGS_NAMESPACE,
				order: 24,
				label: () => copy.t("title"),
				locale: LOCALE_NS,
				inject: injected
			}, ApprovalSection));
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: SETTINGS_NAMESPACE,
				locale: LOCALE_NS,
				inject: injected
			}, ApprovalCard));
		}
		function useCopy(copy) {
			(0, react.useSyncExternalStore)(copy.subscribe, copy.getSnapshot, copy.getSnapshot);
			return copy.t;
		}
		function useSettings(scope) {
			return (0, react.useSyncExternalStore)((listener) => scope.subscribe(listener), () => scope.getSnapshot(), () => scope.getSnapshot());
		}
		function errorText(error, t) {
			const message = error instanceof Error ? error.message : String(error);
			if (error instanceof ApprovalApiError) {
				if (error.status === 409) return t("conflict");
				if (error.status === 400) return t("invalidRequest", { message });
				if (error.status === 503) return t("storageFailed", { message });
			}
			return t("requestFailed", { message });
		}
		function Alert({ children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: styles_module_css_default["error"],
				role: "alert",
				children
			});
		}
		function Button({ children, onClick, disabled = false }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: styles_module_css_default["button"],
				type: "button",
				disabled,
				onClick,
				children
			});
		}
		function ApprovalSection(props) {
			if (!props.scope || !props.loadCatalog || !props.copy) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ManagementPanel, {
				scope: props.scope,
				loadCatalog: props.loadCatalog,
				copy: props.copy
			});
		}
		function ApprovalCard(props) {
			if (!props.scope || !props.loadCatalog || !props.copy) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadedCard, {
				scope: props.scope,
				loadCatalog: props.loadCatalog,
				copy: props.copy
			});
		}
		function LoadedCard(props) {
			const t = useCopy(props.copy);
			const snapshot = useSettings(props.scope);
			const [expanded, setExpanded] = (0, react.useState)(false);
			const panelId = (0, react.useId)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: styles_module_css_default["root"],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles_module_css_default["card"],
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: styles_module_css_default["heading"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: styles_module_css_default["title"],
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles_module_css_default["badge"],
								children: snapshot.status !== "ready" || !snapshot.value ? t("enabledUnknown") : t(snapshot.value.enabled === false ? "disabled" : "enabled")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles_module_css_default["muted"],
							children: t("modeBrief")
						}),
						snapshot.status === "unavailable" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Alert, { children: t("settingsUnavailable") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: styles_module_css_default["button"],
							type: "button",
							"aria-expanded": expanded,
							"aria-controls": panelId,
							onClick: () => setExpanded(!expanded),
							children: t(expanded ? "collapse" : "manage")
						})
					]
				}), expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					id: panelId,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ManagementPanel, { ...props })
				})]
			});
		}
		function ManagementPanel({ scope, loadCatalog, copy }) {
			const t = useCopy(copy);
			const settings = useSettings(scope);
			const [tab, setTab] = (0, react.useState)("overview");
			const [dashboard, setDashboard] = (0, react.useState)();
			const [loading, setLoading] = (0, react.useState)(true);
			const [loadError, setLoadError] = (0, react.useState)();
			const [writeError, setWriteError] = (0, react.useState)();
			const [saved, setSaved] = (0, react.useState)(false);
			const [writing, setWriting] = (0, react.useState)(false);
			const lock = (0, react.useRef)(false);
			const [filter, setFilter] = (0, react.useState)(EMPTY_FILTER);
			const [before, setBefore] = (0, react.useState)();
			const [refreshVersion, setRefreshVersion] = (0, react.useState)(0);
			const [draft, setDraft] = (0, react.useState)();
			const tabRefs = (0, react.useRef)([]);
			const id = (0, react.useId)();
			const refresh = () => {
				setRefreshVersion((value) => value + 1);
			};
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				setLoading(true);
				setLoadError(void 0);
				getDashboard(filter, before, controller.signal).then((value) => {
					if (!controller.signal.aborted) setDashboard(value);
				}).catch((error) => {
					if (!controller.signal.aborted) setLoadError(error);
				}).finally(() => {
					if (!controller.signal.aborted) setLoading(false);
				});
				return () => {
					controller.abort();
				};
			}, [
				filter,
				before,
				refreshVersion
			]);
			const mutate = async (command) => {
				if (lock.current) return false;
				lock.current = true;
				setWriting(true);
				setWriteError(void 0);
				setSaved(false);
				try {
					await postCommand(command);
					setSaved(true);
					refresh();
					return true;
				} catch (error) {
					setWriteError(error);
					return false;
				} finally {
					lock.current = false;
					setWriting(false);
				}
			};
			const beginDraft = (record) => {
				if (!dashboard) return;
				try {
					setDraft({
						rule: ruleFromRecord(record, t("ruleDraftName", { tool: record.toolName })),
						expectedRevision: dashboard.revision,
						recordId: record.id,
						...record.argumentFingerprint ? { sourceFingerprint: record.argumentFingerprint } : {}
					});
					setTab("rules");
					setWriteError(void 0);
					setSaved(false);
				} catch (error) {
					setWriteError(error);
				}
			};
			const selectTab = (value) => {
				if (value === "overview" && (before !== void 0 || Object.values(filter).some(Boolean))) {
					setDashboard(void 0);
					setLoading(true);
					setFilter(EMPTY_FILTER);
					setBefore(void 0);
				}
				setTab(value);
			};
			const tabKey = (event, index) => {
				let next;
				if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
				else if (event.key === "ArrowLeft") next = (index + TABS.length - 1) % TABS.length;
				else if (event.key === "Home") next = 0;
				else if (event.key === "End") next = TABS.length - 1;
				else return;
				event.preventDefault();
				const nextTab = TABS[next];
				if (nextTab) {
					selectTab(nextTab);
					tabRefs.current[next]?.focus();
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: styles_module_css_default["root"],
				"aria-label": t("title"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: styles_module_css_default["heading"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles_module_css_default["titleRow"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: styles_module_css_default["pageTitle"],
								children: t("title")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles_module_css_default["badge"],
								children: settings.status !== "ready" || !settings.value ? t("enabledUnknown") : t(settings.value.enabled === false ? "disabled" : "enabled")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							onClick: refresh,
							disabled: loading || writing,
							children: loading ? t("loading") : t("refresh")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: styles_module_css_default["tabs"],
						role: "tablist",
						"aria-label": t("tabs"),
						children: TABS.map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							ref: (element) => {
								tabRefs.current[index] = element;
							},
							className: styles_module_css_default["tab"],
							role: "tab",
							id: `${id}-tab-${item}`,
							"aria-controls": `${id}-panel-${item}`,
							"aria-selected": tab === item,
							tabIndex: tab === item ? 0 : -1,
							type: "button",
							onClick: () => selectTab(item),
							onKeyDown: (event) => tabKey(event, index),
							children: t(item)
						}, item))
					}),
					loadError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Alert, { children: [dashboard && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [t("stale"), " "] }), errorText(loadError, t)] }),
					writeError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Alert, { children: errorText(writeError, t) }),
					saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						className: styles_module_css_default["muted"],
						children: t("saved")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "tabpanel",
						id: `${id}-panel-${tab}`,
						"aria-labelledby": `${id}-tab-${tab}`,
						tabIndex: 0,
						className: styles_module_css_default["panel"],
						"aria-busy": loading || writing,
						children: tab === "advanced" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewSettings, {
							scope,
							loadCatalog,
							t,
							section: "advanced"
						}) : !dashboard ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles_module_css_default["empty"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								role: "status",
								children: loading ? t("loading") : t("unavailable")
							}), !loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								onClick: refresh,
								children: t("retryLoad")
							})]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							!dashboard.storage.ok && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Alert, { children: [
								t("storageNotOk"),
								": ",
								dashboard.storage.reason ?? t("unknown")
							] }),
							tab === "overview" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Overview, {
								dashboard,
								t,
								onHistory: () => setTab("history"),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReviewSettings, {
									scope,
									loadCatalog,
									t,
									section: "basic"
								})
							}),
							tab === "history" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(History, {
								dashboard,
								t,
								filter,
								onFilter: (value) => {
									setFilter(value);
									setBefore(void 0);
								},
								before,
								onBefore: setBefore,
								busy: loading || writing,
								onDraft: beginDraft
							}),
							tab === "rules" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Rules, {
								dashboard,
								t,
								draft,
								onDraft: setDraft,
								onHistory: () => setTab("history"),
								mutate,
								busy: writing || loading || loadError !== void 0 || !dashboard.storage.ok
							})
						] })
					})
				]
			});
		}
		function FieldValue({ label, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children })] });
		}
		function timestamp(value) {
			return Number.isFinite(value) ? new Date(value).toLocaleString() : "—";
		}
		function RecordDetails({ record, t }) {
			const unknown = t("unknown");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
				className: styles_module_css_default["metadata"],
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("recordId"),
						children: record.id
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("session"),
						children: record.sessionId
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("created"),
						children: timestamp(record.createdAt)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("updated"),
						children: timestamp(record.updatedAt)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("stage"),
						children: t(`stage.${record.stage}`)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("tool"),
						children: record.toolName
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("approval"),
						children: t(`status.${record.status}`)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("execution"),
						children: t(`execution.${record.execution}`)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("source"),
						children: t(`source.${record.source}`)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("model"),
						children: record.model ?? unknown
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("duration"),
						children: record.elapsedMs === void 0 ? unknown : t("milliseconds", { value: record.elapsedMs })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("rule"),
						children: record.ruleId ?? unknown
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("plugin"),
						children: record.pluginId ?? unknown
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("failureKind"),
						children: record.failureKind ?? unknown
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("risk"),
						children: record.riskLevel ?? unknown
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("reason"),
						children: record.reason || unknown
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("arguments"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: record.argumentsSummary })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
						label: t("permission"),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: record.permissionSummary })
					})
				]
			});
		}
		function History({ dashboard, t, filter, onFilter, before, onBefore, busy, onDraft }) {
			const [draftFilter, setDraftFilter] = (0, react.useState)(filter);
			const [exportError, setExportError] = (0, react.useState)();
			(0, react.useEffect)(() => {
				setDraftFilter(filter);
			}, [filter]);
			const download = () => {
				setExportError(void 0);
				try {
					const blob = new Blob([redactedHistoryExport(dashboard.records)], { type: "application/json" });
					const url = URL.createObjectURL(blob);
					const anchor = document.createElement("a");
					anchor.href = url;
					anchor.download = "approval-history-redacted.json";
					document.body.append(anchor);
					anchor.click();
					anchor.remove();
					window.setTimeout(() => URL.revokeObjectURL(url), 1e3);
				} catch (error) {
					setExportError(error);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					className: styles_module_css_default["filters"],
					onSubmit: (event) => {
						event.preventDefault();
						onFilter({ ...draftFilter });
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: styles_module_css_default["field"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("session") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								value: draftFilter.sessionId,
								onChange: (event) => setDraftFilter({
									...draftFilter,
									sessionId: event.target.value
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: styles_module_css_default["field"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("tool") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								value: draftFilter.toolName,
								onChange: (event) => setDraftFilter({
									...draftFilter,
									toolName: event.target.value
								})
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: styles_module_css_default["field"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("status") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								value: draftFilter.status,
								onChange: (event) => setDraftFilter({
									...draftFilter,
									status: event.target.value
								}),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: t("allStatuses")
								}), REVIEW_STATUSES.map((status) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: status,
									children: t(`status.${status}`)
								}, status))]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles_module_css_default["row"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: styles_module_css_default["button"],
								type: "submit",
								disabled: busy,
								children: t("filter")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								disabled: busy,
								onClick: () => {
									setDraftFilter(EMPTY_FILTER);
									onFilter({ ...EMPTY_FILTER });
								},
								children: t("reset")
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles_module_css_default["row"],
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						onClick: download,
						disabled: busy || dashboard.records.length === 0,
						children: t("export")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: styles_module_css_default["muted"],
						children: t("exportHint")
					})]
				}),
				exportError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Alert, { children: errorText(exportError, t) }),
				dashboard.records.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles_module_css_default["empty"],
					children: t("noRecords")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles_module_css_default["recordList"],
					children: dashboard.records.map((record) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
						className: styles_module_css_default["card"],
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: styles_module_css_default["heading"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									className: styles_module_css_default["mono"],
									children: record.toolName
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
									dateTime: new Date(record.createdAt).toISOString(),
									children: timestamp(record.createdAt)
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles_module_css_default["row"],
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: styles_module_css_default["badge"],
										children: [
											t("approval"),
											": ",
											t(`status.${record.status}`)
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: styles_module_css_default["badge"],
										children: [
											t("execution"),
											": ",
											t(`execution.${record.execution}`)
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: styles_module_css_default["muted"],
										children: [
											t("source"),
											": ",
											t(`source.${record.source}`)
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: styles_module_css_default["summary"],
								children: record.reason
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles_module_css_default["row"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									t("model"),
									": ",
									record.model ?? t("unknown")
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									t("duration"),
									": ",
									record.elapsedMs === void 0 ? t("unknown") : t("milliseconds", { value: record.elapsedMs })
								] })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
								className: styles_module_css_default["details"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: t("details") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecordDetails, {
									record,
									t
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								disabled: busy,
								onClick: () => onDraft(record),
								children: t("createRule")
							})
						]
					}, record.id))
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles_module_css_default["row"],
					children: [before !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						disabled: busy,
						onClick: () => onBefore(void 0),
						children: t("first")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						disabled: busy || dashboard.nextBefore === void 0 || dashboard.nextBefore === before,
						onClick: () => onBefore(dashboard.nextBefore),
						children: t("next")
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(HelpDisclosure, {
					title: t("learnMore"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("executionHint") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("humanFallback") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("noRetry") })
					]
				})
			] });
		}
		function RememberedGrants({ t, busy }) {
			const [rows, setRows] = (0, react.useState)([]);
			const [revision, setRevision] = (0, react.useState)(0);
			const [error, setError] = (0, react.useState)();
			const load = (0, react.useCallback)(async () => {
				try {
					const snapshot = await getRememberedGrants();
					setRows(snapshot.rules);
					setRevision(snapshot.revision);
					setError(void 0);
				} catch (cause) {
					setError(cause);
				}
			}, []);
			(0, react.useEffect)(() => {
				load();
			}, [load]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: styles_module_css_default["activity"],
				"aria-label": t("rememberedTitle"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
						className: styles_module_css_default["rowBetween"],
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("rememberedTitle") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["muted"],
						children: t("rememberedHint")
					}),
					error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Alert, { children: errorText(error, t) }),
					rows.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["empty"],
						children: t("noRemembered")
					}),
					rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
						className: styles_module_css_default["card"],
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: styles_module_css_default["heading"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: row.pluginId }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: styles_module_css_default["badge"],
									children: row.enabled ? t("ruleEnabled") : t("ruleDisabled")
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: styles_module_css_default["muted"],
								children: [
									row.operations.join(", "),
									" · ",
									t("expires"),
									": ",
									timestamp(row.expiresAt)
								]
							}),
							row.enabled && row.revokedAt === void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								disabled: busy,
								onClick: () => {
									revokeRememberedGrant(row.id, revision).then((snapshot) => {
										setRows(snapshot.rules);
										setRevision(snapshot.revision);
									}).catch(setError);
								},
								children: t("revokeGrant")
							})
						]
					}, row.id))
				]
			});
		}
		function Rules({ dashboard, t, draft, onDraft, onHistory, mutate, busy }) {
			const [deleting, setDeleting] = (0, react.useState)();
			const automatic = canSaveAutomatic(dashboard);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
					onClick: onHistory,
					children: t("startFromHistory")
				}),
				!automatic && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles_module_css_default["muted"],
					children: t("autoBlocked")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RememberedGrants, {
					t,
					busy
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(HelpDisclosure, {
					title: t("learnMore"),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("rulesHint") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("capabilityHint") })]
				}),
				draft && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RuleEditor, {
					draft,
					dashboard,
					t,
					onDraft,
					mutate,
					busy
				}, draft.rule.id),
				dashboard.rules.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles_module_css_default["empty"],
					children: t("noRules")
				}),
				dashboard.rules.map((rule) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
					className: styles_module_css_default["card"],
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
							className: styles_module_css_default["heading"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: rule.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles_module_css_default["badge"],
								children: t(`action.${rule.action}`)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles_module_css_default["row"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(rule.enabled ? "ruleEnabled" : "ruleDisabled") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								t("expires"),
								": ",
								timestamp(rule.expiresAt),
								rule.expiresAt <= Date.now() && ` · ${t("expired")}`
							] })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles_module_css_default["muted"],
							children: t(rule.scope === "creator-plugin" ? "pluginScope" : "exactScope")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
							className: styles_module_css_default["metadata"],
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
									label: t("session"),
									children: rule.sessionId
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
									label: t("stage"),
									children: t(`stage.${rule.stage}`)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
									label: t("tool"),
									children: rule.toolName
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
									label: t("plugin"),
									children: rule.pluginId ?? t("unknown")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles_module_css_default["row"],
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									disabled: busy,
									onClick: () => {
										onDraft({
											rule: { ...rule },
											expectedRevision: dashboard.revision,
											recordId: "",
											...rule.argumentFingerprint ? { sourceFingerprint: rule.argumentFingerprint } : {}
										});
										setDeleting(void 0);
									},
									children: t("edit")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: styles_module_css_default["switchLabel"],
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: rule.enabled,
										disabled: busy || !rule.enabled && (rule.expiresAt <= Date.now() || rule.action === "allow" && !automatic),
										onChange: (event) => {
											const enabled = event.target.checked;
											mutate({
												action: "save-rule",
												expectedRevision: dashboard.revision,
												rule: {
													...rule,
													enabled,
													version: rule.version + 1
												}
											});
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("ruleEnabled") })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									disabled: busy,
									onClick: () => setDeleting(rule.id),
									children: t("delete")
								})
							]
						}),
						deleting === rule.id && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles_module_css_default["notice"],
							role: "group",
							"aria-label": t("confirmDelete"),
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("confirmDelete") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles_module_css_default["row"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									disabled: busy,
									onClick: () => {
										mutate({
											action: "delete-rule",
											id: rule.id,
											expectedRevision: dashboard.revision
										}).then((ok) => {
											if (ok) {
												setDeleting(void 0);
												if (draft?.rule.id === rule.id) onDraft(void 0);
											}
										});
									},
									children: t("confirm")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
									disabled: busy,
									onClick: () => setDeleting(void 0),
									children: t("cancel")
								})]
							})]
						})
					]
				}, rule.id))
			] });
		}
		function RuleEditor({ draft, dashboard, t, onDraft, mutate, busy }) {
			const rule = draft.rule;
			const [hours, setHours] = (0, react.useState)(String((rule.expiresAt - rule.createdAt) / 36e5));
			const [preview, setPreview] = (0, react.useState)();
			const [previewError, setPreviewError] = (0, react.useState)();
			const [previewing, setPreviewing] = (0, react.useState)(false);
			const automatic = canSaveAutomatic(dashboard);
			const lifetime = parseIntegerDraft(hours, 1, 720);
			const sourceFingerprint = draft.sourceFingerprint ?? rule.argumentFingerprint;
			const resolved = {
				...rule,
				name: rule.name.trim(),
				...lifetime === void 0 ? {} : { expiresAt: rule.createdAt + lifetime * 36e5 }
			};
			const problem = lifetime === void 0 ? "ruleExpiryInvalid" : ruleProblem(resolved, automatic);
			const previewProblem = lifetime === void 0 ? "ruleExpiryInvalid" : ruleProblem(resolved, automatic, false);
			const patch = (value) => {
				onDraft({
					...draft,
					rule: {
						...rule,
						...value
					}
				});
				setPreview(void 0);
			};
			const doPreview = async () => {
				if (previewing || !draft.recordId.trim() || previewProblem) return;
				setPreviewing(true);
				setPreviewError(void 0);
				setPreview(void 0);
				try {
					const response = await postCommand({
						action: "preview",
						rule: resolved,
						recordId: draft.recordId.trim()
					});
					if ("matched" in response) setPreview(response);
				} catch (error) {
					setPreviewError(error);
				} finally {
					setPreviewing(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: styles_module_css_default["editor"],
				"aria-label": t("ruleEditor"),
				"aria-busy": busy || previewing,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("ruleEditor") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["muted"],
						children: t("draftHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
						disabled: busy || previewing,
						className: styles_module_css_default["fieldset"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles_module_css_default["grid"],
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: styles_module_css_default["field"],
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("ruleName") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										maxLength: 120,
										value: rule.name,
										onChange: (event) => patch({ name: event.target.value })
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: styles_module_css_default["field"],
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("ruleAction") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
										value: rule.action,
										onChange: (event) => patch({ action: event.target.value }),
										children: [
											"ask",
											"deny",
											"allow"
										].map((action) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: action,
											children: t(`action.${action}`)
										}, action))
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: styles_module_css_default["field"],
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("scope") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										value: rule.scope,
										onChange: (event) => {
											onDraft({
												...draft,
												rule: withRuleScope(rule, event.target.value, sourceFingerprint)
											});
											setPreview(void 0);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "exact-arguments",
											disabled: !sourceFingerprint,
											children: t("exactScope")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "creator-plugin",
											disabled: !canUseCreatorPlugin(rule),
											children: t("pluginScope")
										})]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: styles_module_css_default["field"],
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("lifetime") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 1,
										max: 720,
										step: 1,
										value: hours,
										onChange: (event) => {
											setHours(event.target.value);
											setPreview(void 0);
										},
										"aria-invalid": lifetime === void 0
									})]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: styles_module_css_default["switchLabel"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: rule.enabled,
								disabled: rule.action === "allow" && !automatic,
								onChange: (event) => patch({ enabled: event.target.checked })
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("ruleEnabled") })]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["muted"],
						children: t("scopeHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["muted"],
						children: t("expiryHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
						className: styles_module_css_default["metadata"],
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
								label: t("session"),
								children: rule.sessionId
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
								label: t("stage"),
								children: t(`stage.${rule.stage}`)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
								label: t("tool"),
								children: rule.toolName
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
								label: t("plugin"),
								children: rule.pluginId ?? t("unknown")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
								label: t("created"),
								children: timestamp(rule.createdAt)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldValue, {
								label: t("expires"),
								children: timestamp(resolved.expiresAt)
							}),
							rule.scope === "exact-arguments" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(FieldValue, {
								label: t("fingerprint"),
								children: [rule.argumentFingerprint ?? t("unknown"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: styles_module_css_default["muted"],
									children: t("fingerprintHint")
								})]
							})
						]
					}),
					problem && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["warning"],
						children: t(problem)
					}),
					draft.expectedRevision !== dashboard.revision && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: styles_module_css_default["notice"],
						children: [
							t("conflict"),
							" ",
							t("draftRevisionHint")
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles_module_css_default["row"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							disabled: busy || previewing || problem !== void 0 || draft.expectedRevision !== dashboard.revision,
							onClick: () => {
								const exists = dashboard.rules.some((candidate) => candidate.id === rule.id);
								mutate({
									action: "save-rule",
									expectedRevision: draft.expectedRevision,
									rule: {
										...resolved,
										version: exists ? rule.version + 1 : 1
									}
								}).then((ok) => {
									if (ok) onDraft(void 0);
								});
							},
							children: busy ? t("saving") : t("saveRule")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
							disabled: busy || previewing,
							onClick: () => onDraft(void 0),
							children: t("cancel")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles_module_css_default["preview"],
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: styles_module_css_default["field"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("previewRecord") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									value: draft.recordId,
									disabled: previewing,
									onChange: (event) => {
										onDraft({
											...draft,
											recordId: event.target.value
										});
										setPreview(void 0);
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: styles_module_css_default["field"],
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("chooseRecord") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: dashboard.records.some((record) => record.id === draft.recordId) ? draft.recordId : "",
									disabled: previewing,
									onChange: (event) => {
										onDraft({
											...draft,
											recordId: event.target.value
										});
										setPreview(void 0);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("chooseRecord")
									}), dashboard.records.map((record) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
										value: record.id,
										children: [
											record.toolName,
											" · ",
											record.id
										]
									}, record.id))]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
								disabled: previewing || !draft.recordId.trim() || previewProblem !== void 0,
								onClick: () => {
									doPreview();
								},
								children: previewing ? t("loading") : t("preview")
							}),
							previewError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Alert, { children: errorText(previewError, t) }),
							preview && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles_module_css_default["notice"],
								role: "status",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
										t("previewResult"),
										": ",
										t(preview.matched ? "matched" : "notMatched"),
										" · ",
										t(`action.${preview.action}`)
									] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: preview.reason }),
									preview.capabilityBlocked && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("capabilityBlocked") })
								]
							})
						]
					})
				]
			});
		}
		function ReviewSettings({ scope, loadCatalog, t, section }) {
			const snapshot = useSettings(scope);
			const [options, setOptions] = (0, react.useState)([]);
			const [catalogState, setCatalogState] = (0, react.useState)("loading");
			const [catalogError, setCatalogError] = (0, react.useState)();
			const [refreshVersion, setRefreshVersion] = (0, react.useState)(0);
			const [writing, setWriting] = (0, react.useState)(false);
			const [writeError, setWriteError] = (0, react.useState)();
			const [saved, setSaved] = (0, react.useState)(false);
			const lock = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				if (section !== "basic") return;
				let active = true;
				setCatalogState("loading");
				setCatalogError(void 0);
				loadCatalog().then((value) => {
					if (active) {
						setOptions(value);
						setCatalogState("ready");
					}
				}).catch((error) => {
					if (active) {
						setCatalogError(error);
						setCatalogState("error");
					}
				});
				return () => {
					active = false;
				};
			}, [
				loadCatalog,
				refreshVersion,
				section
			]);
			const writeSettings = (0, react.useCallback)(async (values) => {
				if (lock.current || scope.getSnapshot().status !== "ready" || !scope.getSnapshot().writable) return false;
				lock.current = true;
				setWriting(true);
				setWriteError(void 0);
				setSaved(false);
				try {
					if (!await persistSettings(scope, values)) throw new Error(t("saveFailed"));
					setSaved(true);
					return true;
				} catch (error) {
					setWriteError(error);
					return false;
				} finally {
					lock.current = false;
					setWriting(false);
				}
			}, [scope, t]);
			if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Alert, { children: t("settingsUnavailable") });
			if (snapshot.status === "loading" || !snapshot.value) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				role: "status",
				children: t("settingsLoading")
			});
			const settings = snapshot.value;
			const disabled = !snapshot.writable || writing;
			const route = settings.modelMode === "fixed" ? settings.reviewerRoute ?? "" : "";
			const selectedAvailable = !route || options.some((option) => option.value === route);
			const numericLabels = {
				enabled: "globalSwitch",
				modelMode: "modelChoice",
				reviewerRoute: "modelChoice",
				reasoningMode: "thinking",
				failureMode: "failureMode",
				timeoutMs: "timeoutMs",
				transportRetries: "transportRetries",
				maxOutputTokens: "maxOutputTokens",
				maxInputChars: "maxInputChars",
				reviewHistoryPairs: "reviewHistoryPairs",
				reviewHistoryChars: "reviewHistoryChars",
				historyRetentionDays: "historyRetentionDays",
				historyMaxRecords: "historyMaxRecords"
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				!snapshot.writable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles_module_css_default["notice"],
					children: t("readOnly")
				}),
				writeError !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Alert, { children: errorText(writeError, t) }),
				saved && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles_module_css_default["saveStatus"],
					role: "status",
					children: t("saved")
				}),
				section === "basic" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles_module_css_default["settingsGroup"],
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: `${styles_module_css_default["settingRow"]} ${styles_module_css_default["toggleRow"]}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("globalSwitch") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: styles_module_css_default["toggle"],
									type: "checkbox",
									role: "switch",
									disabled,
									checked: settings.enabled !== false,
									onChange: (event) => {
										writeSettings({ enabled: event.target.checked });
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: `${styles_module_css_default["field"]} ${styles_module_css_default["settingRow"]}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("modelChoice") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									value: route,
									disabled: disabled || catalogState === "loading",
									onChange: (event) => {
										const value = event.target.value;
										writeSettings(value ? {
											reviewerRoute: value,
											modelMode: "fixed"
										} : { modelMode: "follow-agent" });
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: t("followAgent")
										}),
										!selectedAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: route,
											children: t("offlineModel")
										}),
										options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: option.value,
											children: option.label
										}, option.value))
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: `${styles_module_css_default["field"]} ${styles_module_css_default["settingRow"]}`,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("failureMode") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									disabled,
									value: settings.failureMode ?? "human",
									onChange: (event) => {
										writeSettings({ failureMode: event.target.value });
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "human",
										children: t("human")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "reject",
										children: t("reject")
									})]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["inlineHint"],
						children: t("modeBrief")
					}),
					settings.failureMode === "reject" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["warning"],
						children: t("rejectHint")
					}),
					catalogState === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Alert, { children: t("catalogError", { message: catalogError instanceof Error ? catalogError.message : String(catalogError) }) }),
					catalogState === "ready" && options.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["muted"],
						children: t("catalogEmpty")
					}),
					catalogState === "loading" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["inlineHint"],
						role: "status",
						children: t("catalogLoading")
					}),
					catalogState === "error" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Button, {
						onClick: () => setRefreshVersion((value) => value + 1),
						children: t("retryLoad")
					})
				] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: styles_module_css_default["field"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("thinking") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							disabled,
							value: settings.reasoningMode ?? "low",
							onChange: (event) => {
								writeSettings({ reasoningMode: event.target.value });
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "low",
								children: t("thinkingLow")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "provider-default",
								children: t("thinkingDefault")
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: styles_module_css_default["grid"],
						children: NUMERIC_SETTINGS.map((spec) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumericField, {
							spec,
							label: t(numericLabels[spec.key]),
							value: typeof settings[spec.key] === "number" ? settings[spec.key] : spec.fallback,
							disabled,
							t,
							onSave: (value) => writeSettings({ [spec.key]: value })
						}, spec.key))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: styles_module_css_default["inlineHint"],
						children: t("autoSave")
					})
				] })
			] });
		}
		function NumericField({ spec, label, value, disabled, onSave, t }) {
			const scale = spec.scale ?? 1;
			const [draft, setDraft] = (0, react.useState)(String(value / scale));
			const [error, setError] = (0, react.useState)(false);
			const dirty = (0, react.useRef)(false);
			const saving = (0, react.useRef)(false);
			const id = (0, react.useId)();
			(0, react.useEffect)(() => {
				if (!dirty.current) setDraft(String(value / scale));
			}, [value, scale]);
			const commit = async () => {
				if (disabled || !dirty.current || saving.current) return;
				const next = parseIntegerDraft(draft, spec.min, spec.max);
				if (next === void 0) {
					setError(true);
					return;
				}
				setError(false);
				if (next * scale === value) {
					dirty.current = false;
					setDraft(String(next));
					return;
				}
				saving.current = true;
				try {
					if (await onSave(next * scale)) {
						dirty.current = false;
						setDraft(String(next));
					}
				} finally {
					saving.current = false;
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: styles_module_css_default["field"],
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						type: "number",
						min: spec.min,
						max: spec.max,
						step: 1,
						inputMode: "numeric",
						value: draft,
						disabled,
						"aria-invalid": error,
						"aria-describedby": error ? `${id}-error` : void 0,
						onChange: (event) => {
							dirty.current = true;
							setDraft(event.target.value);
							setError(false);
						},
						onBlur: () => {
							commit();
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								event.currentTarget.blur();
							}
						}
					}),
					error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						id: `${id}-error`,
						className: styles_module_css_default["error"],
						role: "alert",
						children: t("fieldRange", {
							min: spec.min,
							max: spec.max
						})
					})
				]
			});
		}
		//#endregion
		exports.ReviewSettings = ReviewSettings;
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map