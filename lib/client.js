window.__ModuleLoader__.load({
	id: "dsh-approve-for-me",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region dshx-css-module:src/client/styles.module.css.mjs
		const css = ".J1YVmG_card{border:1px solid color-mix(in srgb, currentColor 14%, transparent);background:color-mix(in srgb, currentColor 3%, transparent);border-radius:14px;gap:16px;padding:18px;display:grid}.J1YVmG_permissionModeIcon{flex:none;justify-content:center;align-items:center;display:inline-flex}.J1YVmG_permissionModeIcon svg{display:block}.J1YVmG_permissionModeIconMenu{width:16px;height:16px;color:var(--dsw-alias-label-tertiary)}.J1YVmG_permissionModeIconTrigger{width:14px;height:14px;color:inherit}.J1YVmG_permissionModeIconTrigger svg{width:14px;height:14px}@container (width<=460px){[data-dsh-approve-for-me-trigger] [data-dsh-approve-for-me-label]{display:none}}.J1YVmG_heading{justify-content:space-between;align-items:flex-start;gap:20px;display:flex}.J1YVmG_title{margin:0;font-size:16px;line-height:24px}.J1YVmG_subtitle,.J1YVmG_muted,.J1YVmG_warning,.J1YVmG_details p{margin:4px 0 0;font-size:13px;line-height:20px}.J1YVmG_subtitle,.J1YVmG_muted,.J1YVmG_details p{color:color-mix(in srgb, currentColor 66%, transparent)}.J1YVmG_warning{color:#c2410c}.J1YVmG_switchLabel{flex:none;align-items:center;gap:8px;font-size:13px;font-weight:600;display:inline-flex}.J1YVmG_switchLabel input{accent-color:#16a34a;width:17px;height:17px}.J1YVmG_field{gap:7px;display:grid}.J1YVmG_fieldLabel{font-size:13px;font-weight:600}.J1YVmG_field select,.J1YVmG_advancedGrid input{box-sizing:border-box;border:1px solid color-mix(in srgb, currentColor 18%, transparent);width:100%;min-height:38px;color:inherit;background:canvas;border-radius:9px;padding:8px 10px}.J1YVmG_statusRow{justify-content:space-between;align-items:center;gap:12px;display:flex}.J1YVmG_refresh{border:1px solid color-mix(in srgb, currentColor 18%, transparent);color:inherit;cursor:pointer;background:0 0;border-radius:8px;padding:6px 11px}.J1YVmG_refresh:disabled,.J1YVmG_field select:disabled,.J1YVmG_advancedGrid input:disabled{cursor:default;opacity:.55}.J1YVmG_details{border-top:1px solid color-mix(in srgb, currentColor 10%, transparent);padding-top:12px;font-size:13px}.J1YVmG_details summary{cursor:pointer;font-weight:600}.J1YVmG_advancedGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px;display:grid}.J1YVmG_advancedGrid label{gap:6px;font-size:12px;display:grid}@media (width<=680px){.J1YVmG_heading,.J1YVmG_statusRow{flex-direction:column;align-items:stretch}.J1YVmG_advancedGrid{grid-template-columns:1fr}}";
		const tagId = "dsh-approve-for-me/styles.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-approve-for-me";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var styles_module_css_default = {
			"advancedGrid": "J1YVmG_advancedGrid",
			"card": "J1YVmG_card",
			"details": "J1YVmG_details",
			"field": "J1YVmG_field",
			"fieldLabel": "J1YVmG_fieldLabel",
			"heading": "J1YVmG_heading",
			"muted": "J1YVmG_muted",
			"permissionModeIcon": "J1YVmG_permissionModeIcon",
			"permissionModeIconMenu": "J1YVmG_permissionModeIconMenu",
			"permissionModeIconTrigger": "J1YVmG_permissionModeIconTrigger",
			"refresh": "J1YVmG_refresh",
			"statusRow": "J1YVmG_statusRow",
			"subtitle": "J1YVmG_subtitle",
			"switchLabel": "J1YVmG_switchLabel",
			"title": "J1YVmG_title",
			"warning": "J1YVmG_warning"
		};
		//#endregion
		//#region src/client/permission-mode-icon.ts
		const APPROVE_FOR_ME_LABEL = "Approve for me";
		const APPROVE_FOR_ME_SHIELD_PATH = "M8.20554 0.899994L14.7901 3.36857V7.01026C14.7901 12 11.0466 14.2103 8.20554 15.3C5.36446 14.2103 1.62012 12 1.62012 7.01026V3.36857L8.20554 0.899994Z";
		const APPROVE_FOR_ME_SPARK_PATH = "M8.205 3.86C8.397 5.283 9.327 6.213 10.75 6.405C9.327 6.597 8.397 7.527 8.205 8.95C8.013 7.527 7.083 6.597 5.66 6.405C7.083 6.213 8.013 5.283 8.205 3.86Z";
		const ICON_ATTRIBUTE = "data-dsh-approve-for-me-icon";
		const TRIGGER_ATTRIBUTE = "data-dsh-approve-for-me-trigger";
		const LABEL_ATTRIBUTE = "data-dsh-approve-for-me-label";
		const SVG_NS = "http://www.w3.org/2000/svg";
		const OFFICIAL_PERMISSION_LABEL_SETS = [
			[
				"Read Only",
				"Workspace Write",
				"Full access"
			],
			[
				"仅可查看",
				"工作区内修改",
				"完全权限"
			]
		];
		function exactText(element) {
			return element.textContent?.trim() ?? "";
		}
		function hasOfficialPermissionRows(labels) {
			return OFFICIAL_PERMISSION_LABEL_SETS.some((required) => required.every((label) => labels.includes(label)));
		}
		/**
		* Fail closed: the composer permission menu is the one that lists this
		* plugin's preset next to DSH's three official rows. Official labels are
		* locale-specific; 0.1.5-rc.2 ships English and Simplified Chinese.
		*/
		function isPermissionPresetMenu(labels) {
			return labels.includes("Approve for me") && hasOfficialPermissionRows(labels);
		}
		function createSvg() {
			const svg = document.createElementNS(SVG_NS, "svg");
			svg.setAttribute("width", "16");
			svg.setAttribute("height", "16");
			svg.setAttribute("viewBox", "0 0 16 16");
			svg.setAttribute("fill", "none");
			svg.setAttribute("aria-hidden", "true");
			const shield = document.createElementNS(SVG_NS, "path");
			shield.setAttribute("d", APPROVE_FOR_ME_SHIELD_PATH);
			shield.setAttribute("stroke", "currentColor");
			shield.setAttribute("stroke-width", "1.31831");
			shield.setAttribute("stroke-linejoin", "round");
			const spark = document.createElementNS(SVG_NS, "path");
			spark.setAttribute("d", APPROVE_FOR_ME_SPARK_PATH);
			spark.setAttribute("fill", "currentColor");
			svg.append(shield, spark);
			return svg;
		}
		function createIcon(kind) {
			const icon = document.createElement("span");
			icon.setAttribute(ICON_ATTRIBUTE, kind);
			icon.classList.add(styles_module_css_default["permissionModeIcon"]);
			icon.classList.add(kind === "menu" ? styles_module_css_default["permissionModeIconMenu"] : styles_module_css_default["permissionModeIconTrigger"]);
			icon.append(createSvg());
			return icon;
		}
		function directLabel(button) {
			return Array.from(button.children).find((child) => child instanceof HTMLElement && exactText(child) === "Approve for me");
		}
		function enhanceMenuRows(root) {
			for (const menu of root.querySelectorAll("[role=\"menu\"]")) {
				const rows = Array.from(menu.querySelectorAll("button[role=\"menuitem\"]"));
				const labels = rows.map(exactText);
				const officialGlyphs = rows.filter((row) => exactText(row) !== APPROVE_FOR_ME_LABEL && row.querySelector("svg") !== null).length;
				if (!isPermissionPresetMenu(labels) && !(labels.includes(APPROVE_FOR_ME_LABEL) && officialGlyphs >= 3)) continue;
				const button = rows.find((row) => exactText(row) === APPROVE_FOR_ME_LABEL);
				if (button === void 0 || button.querySelector(`[${ICON_ATTRIBUTE}]`) !== null) continue;
				const label = directLabel(button);
				if (label !== void 0) button.insertBefore(createIcon("menu"), label);
			}
		}
		function enhanceCurrentTrigger(root) {
			for (const button of root.querySelectorAll("button")) {
				if (button.getAttribute("role") === "menuitem") continue;
				const label = directLabel(button);
				const aria = button.getAttribute("aria-label") ?? "";
				if (label === void 0 && !aria.includes(APPROVE_FOR_ME_LABEL)) continue;
				if (label === void 0) continue;
				if (button.querySelector(`[${ICON_ATTRIBUTE}]`) !== null) continue;
				button.setAttribute(TRIGGER_ATTRIBUTE, "");
				label.setAttribute(LABEL_ATTRIBUTE, "");
				button.insertBefore(createIcon("trigger"), label);
			}
		}
		function enhance(root) {
			enhanceMenuRows(root);
			enhanceCurrentTrigger(root);
		}
		function touchesPermissionSurface(node) {
			const element = node instanceof Element ? node : node.parentElement;
			if (element === null) return false;
			if (element.matches("[role=\"menu\"], button[aria-label], button")) return true;
			if (element.closest("[role=\"menu\"], button[aria-label]") !== null) return true;
			return element.querySelector("[role=\"menu\"], button[aria-label]") !== null;
		}
		function relevantMutation(records) {
			return records.some((record) => touchesPermissionSurface(record.target) || Array.from(record.addedNodes).some(touchesPermissionSurface));
		}
		/**
		* Add the plugin-owned glyph without patching DSH core. Official PermissionSelect
		* only maps icons for built-in preset ids; host-configured rows stay icon-less
		* until this decorator runs. The popup exists only while open, so a bounded
		* observer reapplies after React mounts or replaces the row.
		*/
		function installApproveForMeIcon(root = document) {
			enhance(root);
			let queued = false;
			const observer = new MutationObserver((records) => {
				if (queued || !relevantMutation(records)) return;
				queued = true;
				queueMicrotask(() => {
					queued = false;
					enhance(root);
				});
			});
			observer.observe(root.documentElement, {
				childList: true,
				subtree: true
			});
			return () => {
				observer.disconnect();
				for (const icon of root.querySelectorAll(`[${ICON_ATTRIBUTE}]`)) icon.remove();
				for (const trigger of root.querySelectorAll(`[${TRIGGER_ATTRIBUTE}]`)) trigger.removeAttribute(TRIGGER_ATTRIBUTE);
				for (const label of root.querySelectorAll(`[${LABEL_ATTRIBUTE}]`)) label.removeAttribute(LABEL_ATTRIBUTE);
			};
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-approve-for-me-client";
		const inject = [
			"slots",
			"settingsScope",
			"remote",
			"remote.session"
		];
		const SETTINGS_NAMESPACE = "dsh-approve-for-me";
		/** Register the official Plugins-page card and bind it to durable Host settings. */
		function apply(ctx) {
			const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
			const loadCatalog = async () => {
				const response = await ctx.remote.session.modelCatalog();
				if (!response.ok) throw new Error(response.error.message);
				return response.value.groups.flatMap((group) => group.models.map((model) => ({
					value: JSON.stringify([group.id, model.id]),
					label: `${group.name} · ${model.name}`
				})));
			};
			ctx.effect(() => installApproveForMeIcon(), "dsh-approve-for-me: decorate the dedicated permission preset");
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: SETTINGS_NAMESPACE,
				inject: () => ({
					scope,
					loadCatalog
				})
			}, DshApproveForMeCard));
		}
		function DshApproveForMeCard(props) {
			const scope = props.scope;
			const loadCatalog = props.loadCatalog;
			if (scope === void 0 || loadCatalog === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadedCard, {
				scope,
				loadCatalog
			});
		}
		function LoadedCard({ scope, loadCatalog }) {
			const snapshot = (0, react.useSyncExternalStore)((listener) => scope.subscribe(listener), () => scope.getSnapshot());
			const [options, setOptions] = (0, react.useState)([]);
			const [catalogState, setCatalogState] = (0, react.useState)("loading");
			const [catalogError, setCatalogError] = (0, react.useState)("");
			const [writing, setWriting] = (0, react.useState)(false);
			const settings = snapshot.value;
			const refresh = () => {
				setCatalogState("loading");
				setCatalogError("");
				loadCatalog().then((next) => {
					setOptions(next);
					setCatalogState("ready");
				}).catch((error) => {
					setCatalogState("error");
					setCatalogError(error instanceof Error ? error.message : String(error));
				});
			};
			(0, react.useEffect)(refresh, [loadCatalog]);
			const write = async (operation) => {
				setWriting(true);
				try {
					await operation();
				} finally {
					setWriting(false);
				}
			};
			if (snapshot.status === "loading" || settings === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: styles_module_css_default["card"],
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles_module_css_default["muted"],
					children: "正在读取审批设置…"
				})
			});
			if (snapshot.status === "unavailable") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles_module_css_default["card"],
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: styles_module_css_default["title"],
					children: "替我审批"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: styles_module_css_default["warning"],
					children: "当前连接不提供可写的 Host 设置，自动审批保持不可配置。"
				})]
			});
			const enabled = settings.enabled !== false;
			const selected = settings.modelMode === "fixed" ? settings.reviewerRoute ?? "" : "";
			const selectedAvailable = selected === "" || options.some((option) => option.value === selected);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: styles_module_css_default["card"],
				"aria-busy": writing,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles_module_css_default["heading"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							className: styles_module_css_default["title"],
							children: "替我审批"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: styles_module_css_default["subtitle"],
							children: "先在输入框权限菜单选择 Approve for me。插件只接管 DSH 原本会发起的审批，不审查已直接放行的工具调用。"
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: styles_module_css_default["switchLabel"],
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: enabled,
								disabled: !snapshot.writable || writing,
								onChange: (event) => {
									write(() => scope.set("enabled", event.target.checked));
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: enabled ? "模式内启用" : "已关闭" })]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: styles_module_css_default["field"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: styles_module_css_default["fieldLabel"],
							children: "审批模型"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							value: selected,
							disabled: !enabled || !snapshot.writable || writing || catalogState === "loading",
							onChange: (event) => {
								const value = event.target.value;
								write(async () => {
									if (value === "") {
										await scope.set("modelMode", "follow-agent");
										return;
									}
									await scope.set("reviewerRoute", value);
									await scope.set("modelMode", "fixed");
								});
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "",
									children: "跟随当前会话最近使用的模型（默认）"
								}),
								!selectedAvailable && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: selected,
									children: "当前选择已离线"
								}),
								options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: option.value,
									children: option.label
								}, option.value))
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: styles_module_css_default["field"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: styles_module_css_default["fieldLabel"],
							children: "思考强度"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							value: settings.reasoningMode ?? "low",
							disabled: !enabled || !snapshot.writable || writing,
							onChange: (event) => {
								write(() => scope.set("reasoningMode", event.target.value));
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "low",
								children: "优先使用 Low；不支持时用服务商默认档（默认）"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "provider-default",
								children: "始终使用服务商默认档"
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles_module_css_default["statusRow"],
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: catalogState === "error" ? styles_module_css_default["warning"] : styles_module_css_default["muted"],
							children: [
								catalogState === "loading" && "正在读取 DSH 模型目录…",
								catalogState === "ready" && options.length === 0 && "当前没有已注册模型；需要审批时会失败关闭并拒绝该次请求。",
								catalogState === "ready" && options.length > 0 && `可用 DSH 模型 ${String(options.length)} 个`,
								catalogState === "error" && `无法读取 DSH 模型目录：${catalogError}`
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: styles_module_css_default["refresh"],
							onClick: refresh,
							disabled: catalogState === "loading",
							children: "刷新"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: styles_module_css_default["details"],
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: "安全边界与高级参数" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "只处理注册工具进入的真实审批请求；斜杠命令、后台任务和插件私有 Host RPC 不在覆盖面内。" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "保留 Workspace Write 沙箱。审批模型通过 DSH 的统一 LLM 目录调用，且不会获得工具；Full access 仍由官方模式负责。" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "每次审批都独立判断。模型不会创建“始终允许”或任务内复用规则。" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "模型不可用、重试耗尽、超时、输出不合规或缺少原始调用上下文时失败关闭并拒绝，不再弹回人工审批。" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "同一用户请求下连续拒绝 3 次，或最近 50 次中拒绝 10 次，会停止当前轮次，防止反复绕过策略。" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: styles_module_css_default["advancedGrid"],
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["超时（秒）", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 1,
										max: 120,
										value: Math.round((settings.timeoutMs ?? 9e4) / 1e3),
										disabled: !snapshot.writable || writing,
										onChange: (event) => {
											const seconds = Number(event.target.value);
											if (Number.isFinite(seconds)) write(() => scope.set("timeoutMs", Math.round(seconds * 1e3)));
										}
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["审查失败重试次数", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 0,
										max: 2,
										value: settings.transportRetries ?? 2,
										disabled: !snapshot.writable || writing,
										onChange: (event) => {
											const retries = Number(event.target.value);
											if (Number.isFinite(retries)) write(() => scope.set("transportRetries", Math.round(retries)));
										}
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", { children: ["最大输出 tokens", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "number",
										min: 128,
										max: 4096,
										value: settings.maxOutputTokens ?? 256,
										disabled: !snapshot.writable || writing,
										onChange: (event) => {
											const tokens = Number(event.target.value);
											if (Number.isFinite(tokens)) write(() => scope.set("maxOutputTokens", Math.round(tokens)));
										}
									})] })
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
