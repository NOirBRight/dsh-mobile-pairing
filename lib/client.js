window.__ModuleLoader__.load({
	id: "@dsh-mobile/pairing",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/nav-icon.ts
		/** Use the official 16px link glyph so Remote matches other settings-nav icons. */
		const LABELS = /* @__PURE__ */ new Set(["Remote", "远程"]);
		const MARK = "data-dsh-remote-icon";
		const GLYPH = `
  <path fill="currentColor" d="M9.94133 6.50173C11.3218 7.99603 11.3218 10.3011 9.94128 11.7954C9.88691 11.8542 9.82125 11.9196 9.72099 12.0198L7.75707 13.9838C7.65709 14.0838 7.592 14.1491 7.53334 14.2034C6.03906 15.5843 3.7327 15.5854 2.23827 14.2048C2.17933 14.1503 2.11374 14.0844 2.01315 13.9838C1.91318 13.8839 1.84922 13.8188 1.79495 13.7601C0.413857 12.2657 0.413909 9.95948 1.795 8.46503C1.84923 8.4064 1.91335 8.34115 2.01321 8.24129L3.79275 6.46313C3.71814 7.08101 3.75236 7.71445 3.90115 8.33518L3.00344 9.23151C2.89398 9.34097 2.8535 9.38307 2.82251 9.41658C1.93771 10.3744 1.93704 11.8514 2.82179 12.8092C2.85279 12.8427 2.89383 12.884 3.0034 12.9936C3.11272 13.1029 3.15429 13.1442 3.18777 13.1752C4.14561 14.0603 5.62381 14.0608 6.58178 13.1758C6.61532 13.1448 6.65722 13.1032 6.76685 12.9935L8.73077 11.0296C8.83999 10.9204 8.88142 10.8787 8.91238 10.8452C9.79744 9.88728 9.7969 8.40911 8.91173 7.45124C8.88074 7.41775 8.83944 7.3762 8.73011 7.26687C8.62082 7.15757 8.58061 7.11623 8.54712 7.08526C8.37347 6.92477 8.18243 6.79361 7.98088 6.69165L9.00289 5.66964C9.17506 5.78373 9.34035 5.91265 9.49663 6.05703C9.55538 6.11135 9.62026 6.17652 9.72036 6.27662C9.82094 6.3772 9.88686 6.4428 9.94133 6.50173Z"/>
  <path fill="currentColor" d="M6.06816 9.49196C4.68626 7.99724 4.68667 5.68942 6.06885 4.19487C6.12268 4.13671 6.18789 4.07306 6.28706 3.9739L8.24541 2.01416C8.34478 1.91479 8.41018 1.85055 8.46845 1.79665C9.96301 0.414902 12.2689 0.414922 13.7635 1.79665C13.8217 1.85051 13.8866 1.91559 13.9858 2.01486C14.0849 2.11394 14.1502 2.17769 14.204 2.23583C15.5861 3.7304 15.5866 6.03823 14.2047 7.53291C14.1508 7.59125 14.0854 7.65638 13.9858 7.75595L12.1994 9.54098C12.2614 8.92982 12.2185 8.30587 12.0634 7.69657L12.9956 6.76573C13.1044 6.65692 13.1458 6.61529 13.1765 6.58205C14.0621 5.62404 14.0621 4.1454 13.1765 3.18738C13.1458 3.15419 13.104 3.1135 12.9956 3.00508C12.8877 2.89716 12.8471 2.85551 12.814 2.82485C11.8559 1.9389 10.376 1.93886 9.41794 2.82485C9.38479 2.85554 9.34381 2.89622 9.23564 3.00439L7.27728 4.96413C7.16875 5.07265 7.12708 5.11322 7.09636 5.14643C6.21074 6.10441 6.21153 7.58236 7.09705 8.5404C7.12775 8.57357 7.16826 8.61575 7.27659 8.72408C7.38456 8.83205 7.42647 8.87227 7.45958 8.90293C7.62849 9.0591 7.81309 9.1881 8.00856 9.28894L6.98795 10.3095C6.82111 10.1978 6.66052 10.0715 6.50872 9.93114C6.45057 9.87733 6.38547 9.81341 6.28637 9.71431C6.1871 9.61504 6.12202 9.55018 6.06816 9.49196Z"/>
`;
		function patch() {
			for (const button of document.querySelectorAll("nav button")) {
				if ([...button.querySelectorAll("span")].find((span) => LABELS.has(span.textContent?.trim() ?? "")) === void 0) continue;
				const svg = button.querySelector("svg");
				if (svg === null || svg.getAttribute(MARK) === "remote") continue;
				svg.setAttribute(MARK, "remote");
				svg.setAttribute("width", "16");
				svg.setAttribute("height", "16");
				svg.setAttribute("viewBox", "0 0 16 16");
				svg.setAttribute("fill", "none");
				svg.innerHTML = GLYPH;
			}
		}
		/** Watch the settings nav and keep the Remote glyph in place across re-renders. */
		function installRemoteNavIcon() {
			if (typeof document === "undefined" || document.body === null) return () => {};
			let scheduled = false;
			const flush = () => {
				scheduled = false;
				patch();
			};
			const observer = new MutationObserver(() => {
				if (scheduled) return;
				scheduled = true;
				requestAnimationFrame(flush);
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			patch();
			return () => observer.disconnect();
		}
		//#endregion
		//#region src/client/model.ts
		/** Settings nav id/order: immediately after official General. */
		const REMOTE_SETTINGS_SECTION = {
			id: "remote",
			order: 5
		};
		function decodePairingStatus(value) {
			if (typeof value !== "object" || value === null) return null;
			const record = value;
			const endpointMode = record.endpointMode;
			const hostIdentity = record.hostIdentity;
			const configuration = record.configuration;
			if (endpointMode !== "quick" && endpointMode !== "custom") return null;
			if (typeof hostIdentity !== "string" || typeof configuration !== "object" || configuration === null) return null;
			const config = configuration;
			if (typeof config.file !== "string" || typeof config.entryId !== "string" || typeof config.customEndpointField !== "string" || typeof config.legacyRelayConfigured !== "boolean") return null;
			let endpoint = null;
			if (record.endpoint !== null) {
				if (typeof record.endpoint !== "object") return null;
				const raw = record.endpoint;
				if (typeof raw.url !== "string" || raw.kind !== "temporary" && raw.kind !== "custom") return null;
				endpoint = {
					url: raw.url,
					kind: raw.kind
				};
			}
			const customEndpointUrl = record.customEndpointUrl;
			if (customEndpointUrl !== void 0 && customEndpointUrl !== null && typeof customEndpointUrl !== "string") return null;
			return {
				endpoint,
				endpointMode,
				hostIdentity,
				...typeof customEndpointUrl === "string" ? { customEndpointUrl } : {},
				configuration: {
					file: config.file,
					entryId: config.entryId,
					customEndpointField: config.customEndpointField,
					legacyRelayConfigured: config.legacyRelayConfigured
				}
			};
		}
		function buildEndpointSaveRequest(mode, customUrl) {
			if (mode === "quick") return { endpointMode: "quick" };
			const trimmed = customUrl.trim();
			if (trimmed === "") return { error: "customEndpointUrl is required in custom mode" };
			return {
				endpointMode: "custom",
				customEndpointUrl: trimmed
			};
		}
		/** True when the editor does not match the Host's saved Public Endpoint. */
		function endpointDraftDirty(mode, customUrl, status) {
			if (mode !== status.endpointMode) return true;
			return mode === "custom" && customUrl.trim() !== (status.customEndpointUrl ?? "").trim();
		}
		function decodeEndpointSaveResult(value) {
			if (typeof value !== "object" || value === null) return null;
			const record = value;
			if (record.ok === true) {
				if (record.endpointMode !== "quick" && record.endpointMode !== "custom") return null;
				let endpoint = null;
				if (record.endpoint !== null && record.endpoint !== void 0) {
					if (typeof record.endpoint !== "object") return null;
					const raw = record.endpoint;
					if (typeof raw.url !== "string" || raw.kind !== "temporary" && raw.kind !== "custom") return null;
					endpoint = {
						url: raw.url,
						kind: raw.kind
					};
				}
				return {
					ok: true,
					endpointMode: record.endpointMode,
					endpoint
				};
			}
			if (record.ok !== false || typeof record.error !== "string") return null;
			if (record.stage !== "endpoint" && record.stage !== "tls" && record.stage !== "identity" && record.stage !== "protocol" && record.stage !== "capabilities" && record.stage !== "websocket") return null;
			return {
				ok: false,
				stage: record.stage,
				error: record.error
			};
		}
		function pairingQrUrl(target, revision) {
			return `/pair?target=${target}&format=svg&refresh=${revision}`;
		}
		function decodePairedDevices(value) {
			if (typeof value !== "object" || value === null) return null;
			const list = value.devices;
			if (!Array.isArray(list)) return null;
			const devices = [];
			for (const item of list) {
				if (typeof item !== "object" || item === null) return null;
				const record = item;
				if (typeof record.id !== "string" || typeof record.createdAt !== "number") return null;
				const lastSeenAt = typeof record.lastSeenAt === "number" ? record.lastSeenAt : record.createdAt;
				const revokedAt = record.revokedAt === null || record.revokedAt === void 0 ? null : typeof record.revokedAt === "number" ? record.revokedAt : null;
				if (record.revokedAt !== void 0 && record.revokedAt !== null && typeof record.revokedAt !== "number") return null;
				devices.push({
					id: record.id,
					createdAt: record.createdAt,
					lastSeenAt,
					revokedAt,
					...typeof record.label === "string" ? { label: record.label } : {},
					...record.clientType === "android" ? { clientType: record.clientType } : {},
					...typeof record.room === "string" ? { room: record.room } : {}
				});
			}
			return devices;
		}
		function pairingRefreshQrUrl(room, revision) {
			return `/pair?format=svg&room=${encodeURIComponent(room)}&refresh=${revision}`;
		}
		function livePairedDevices(devices) {
			return devices.filter((device) => device.revokedAt === null);
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-mobile-pairing-client";
		const inject = ["slots", "locale"];
		const zh = {
			nav: "远程",
			title: "远程",
			intro: "用手机 App 或相机扫码，连到这台电脑。",
			loading: "正在加载…",
			retry: "重试",
			loadFailed: "无法加载远程设置。",
			refreshQr: "换一张码",
			qrAlt: "配对二维码",
			devices: "已配对设备",
			noDevices: "还没有设备。扫下面的码即可添加。",
			phone: "手机",
			web: "浏览器",
			unknownType: "设备",
			lastSeen: "最近在线",
			justNow: "刚刚",
			minutesAgo: "{n} 分钟前",
			hoursAgo: "{n} 小时前",
			revoke: "撤销",
			rename: "重命名",
			renamePrompt: "设备名称",
			revokeConfirm: "撤销后这台设备需要重新扫码。",
			refreshAddress: "更新地址",
			closeRefresh: "关闭",
			access: "访问方式",
			scanTitle: "扫码连接",
			scanHint: "用 App 或手机相机扫码。",
			currentAddress: "当前地址",
			copyHint: "点击复制",
			qrPendingSave: "保存后，下面的码会换成新地址。",
			customStep1: "1. 新开一个 HTTPS 子域名，不要用已经有登录页的那个。",
			customStep2: "2. 让它访问这台电脑的 127.0.0.1:43169，不要转到 3080。",
			customStep3: "3. 不要加账号密码，并打开 WebSocket。",
			customStep4: "4. 把 https://子域名 填到上面，点保存。",
			temporarySetup: "这个地址会变。重启后已配对设备点「更新地址」即可。",
			temporary: "临时地址",
			temporaryHint: "自动分配，不用保存",
			permanent: "固定域名",
			permanentHint: "用你自己的 HTTPS",
			notReady: "地址还没准备好",
			copied: "已复制",
			customUrl: "域名",
			save: "保存",
			saving: "检查中…",
			saved: "已保存",
			stageEndpoint: "地址格式不对",
			stageTls: "打不开这个地址",
			stageIdentity: "不是这台电脑",
			stageProtocol: "协议不匹配",
			stageCapabilities: "能力不匹配",
			stageWebsocket: "无法建立连接"
		};
		const en = {
			nav: "Remote",
			title: "Remote",
			intro: "Scan with the app or the phone camera to connect this computer.",
			loading: "Loading…",
			retry: "Retry",
			loadFailed: "Could not load remote settings.",
			refreshQr: "New code",
			qrAlt: "Pairing code",
			devices: "Paired devices",
			noDevices: "No devices yet. Scan the code below.",
			phone: "Phone",
			web: "Browser",
			unknownType: "Device",
			lastSeen: "Last seen",
			justNow: "Just now",
			minutesAgo: "{n} min ago",
			hoursAgo: "{n} hr ago",
			revoke: "Revoke",
			rename: "Rename",
			renamePrompt: "Device name",
			revokeConfirm: "This device will need to scan again.",
			refreshAddress: "Update address",
			closeRefresh: "Close",
			access: "Access mode",
			scanTitle: "Scan to connect",
			scanHint: "Scan with the app or the phone camera.",
			currentAddress: "Current address",
			copyHint: "Click to copy",
			qrPendingSave: "Save to update the code below.",
			customStep1: "1. Use a new HTTPS subdomain, not one that already has a login page.",
			customStep2: "2. Point it at 127.0.0.1:43169 on this computer, not port 3080.",
			customStep3: "3. Do not add a password, and allow WebSocket.",
			customStep4: "4. Paste https://your-domain above and save.",
			temporarySetup: "This address can change. After a restart, paired devices only need Update address.",
			temporary: "Temporary",
			temporaryHint: "Assigned automatically, no save needed",
			permanent: "Custom domain",
			permanentHint: "Your own HTTPS address",
			notReady: "Address is not ready",
			copied: "Copied",
			customUrl: "Domain",
			save: "Save",
			saving: "Checking…",
			saved: "Saved",
			stageEndpoint: "Invalid address",
			stageTls: "Address unreachable",
			stageIdentity: "Wrong computer",
			stageProtocol: "Protocol mismatch",
			stageCapabilities: "Capabilities mismatch",
			stageWebsocket: "Could not connect"
		};
		const page = {
			display: "grid",
			gap: 28,
			minWidth: 0,
			color: "var(--dsw-alias-label-primary)"
		};
		const heading = {
			margin: 0,
			fontSize: 16,
			fontWeight: 500,
			lineHeight: "24px"
		};
		const muted = {
			margin: "6px 0 0",
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: 13,
			lineHeight: "20px"
		};
		const card = {
			display: "grid",
			gap: 12,
			padding: 16,
			borderRadius: 16,
			background: "var(--dsw-alias-bg-layer-1)",
			boxShadow: "inset 0 0 0 1px var(--dsw-alias-border-l2)"
		};
		const action = {
			minHeight: 32,
			border: "none",
			borderRadius: 10,
			padding: "6px 12px",
			background: "var(--dsw-alias-interactive-bg-hover)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 13,
			cursor: "pointer"
		};
		const danger = {
			...action,
			color: "#dc2626"
		};
		const input = {
			...action,
			cursor: "text",
			width: "100%",
			boxSizing: "border-box",
			background: "var(--dsw-alias-bg-module-platform)",
			boxShadow: "inset 0 0 0 1px var(--dsw-alias-border-l2)"
		};
		function formatSeen(at, t) {
			const delta = Date.now() - at;
			if (delta < 6e4) return t("justNow");
			if (delta < 36e5) return t("minutesAgo").replace("{n}", String(Math.max(1, Math.floor(delta / 6e4))));
			if (delta < 864e5) return t("hoursAgo").replace("{n}", String(Math.max(1, Math.floor(delta / 36e5))));
			return new Date(at).toLocaleString();
		}
		function deviceKind(device, t) {
			if (device.clientType === "android") return t("phone");
			if (device.clientType === "browser") return t("web");
			return t("unknownType");
		}
		function DshMobileCard({ t }) {
			const [status, setStatus] = (0, react.useState)();
			const [devices, setDevices] = (0, react.useState)([]);
			const [revision, setRevision] = (0, react.useState)(0);
			const [failed, setFailed] = (0, react.useState)(false);
			const [mode, setMode] = (0, react.useState)("quick");
			const [customUrl, setCustomUrl] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [saveMessage, setSaveMessage] = (0, react.useState)(null);
			const [saveError, setSaveError] = (0, react.useState)(null);
			const [copied, setCopied] = (0, react.useState)(false);
			const [refreshingId, setRefreshingId] = (0, react.useState)(null);
			const hydrated = (0, react.useRef)(false);
			const liveEndpoint = (0, react.useRef)(null);
			async function loadAll() {
				setFailed(false);
				try {
					const [statusResponse, devicesResponse] = await Promise.all([fetch("/pair/status", {
						credentials: "same-origin",
						cache: "no-store"
					}), fetch("/pair/devices", {
						credentials: "same-origin",
						cache: "no-store"
					})]);
					if (!statusResponse.ok) throw new Error("status unavailable");
					const decoded = decodePairingStatus(await statusResponse.json());
					if (decoded === null) throw new Error("invalid status");
					setStatus(decoded);
					const nextUrl = decoded.endpoint?.url ?? null;
					if (liveEndpoint.current !== null && nextUrl !== null && nextUrl !== liveEndpoint.current) setRevision((current) => current + 1);
					liveEndpoint.current = nextUrl;
					if (!hydrated.current) {
						setMode(decoded.endpointMode);
						setCustomUrl(decoded.customEndpointUrl ?? "");
						hydrated.current = true;
					}
					const decodedDevices = devicesResponse.ok ? decodePairedDevices(await devicesResponse.json()) : [];
					setDevices(livePairedDevices(decodedDevices ?? []));
				} catch {
					setStatus(null);
					setFailed(true);
				}
			}
			async function saveEndpoint(nextMode, nextUrl = customUrl) {
				const request = buildEndpointSaveRequest(nextMode, nextUrl);
				if ("error" in request) {
					setSaveMessage(null);
					setSaveError(t("customUrl"));
					return;
				}
				setSaving(true);
				setSaveMessage(null);
				setSaveError(null);
				try {
					const decoded = decodeEndpointSaveResult(await (await fetch("/pair/endpoint", {
						method: "POST",
						credentials: "same-origin",
						cache: "no-store",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(request)
					})).json());
					if (decoded === null) throw new Error("invalid save response");
					if (!decoded.ok) {
						setSaveError(t({
							endpoint: "stageEndpoint",
							tls: "stageTls",
							identity: "stageIdentity",
							protocol: "stageProtocol",
							capabilities: "stageCapabilities",
							websocket: "stageWebsocket"
						}[decoded.stage]));
						return;
					}
					setMode(nextMode);
					setSaveMessage(t("saved"));
					setRevision((current) => current + 1);
					await loadAll();
				} catch {
					setSaveError(t("loadFailed"));
				} finally {
					setSaving(false);
				}
			}
			async function selectMode(next) {
				setMode(next);
				setSaveMessage(null);
				setSaveError(null);
				if (next === "quick" && status?.endpointMode !== "quick") await saveEndpoint("quick");
			}
			async function revoke(id) {
				if (!window.confirm(t("revokeConfirm"))) return;
				await fetch("/pair/revoke", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ id })
				});
				await loadAll();
			}
			async function rename(device) {
				const next = window.prompt(t("renamePrompt"), device.label || device.id);
				if (next === null) return;
				await fetch("/pair/label", {
					method: "POST",
					credentials: "same-origin",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						id: device.id,
						label: next
					})
				});
				await loadAll();
			}
			async function copyUrl(url) {
				try {
					await navigator.clipboard.writeText(url);
					setCopied(true);
					window.setTimeout(() => setCopied(false), 1600);
				} catch {}
			}
			(0, react.useEffect)(() => {
				loadAll();
				setRevision((current) => current + 1);
			}, []);
			(0, react.useEffect)(() => {
				const timer = window.setInterval(() => {
					loadAll();
				}, 5e3);
				return () => window.clearInterval(timer);
			}, []);
			const live = livePairedDevices(devices);
			const endpointUrl = status?.endpoint?.url;
			const dirty = status ? endpointDraftDirty(mode, customUrl, status) : false;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: page,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: `
      .dsh-mobile-remote-modes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    ` }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						style: heading,
						children: t("title")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t("intro")
					})] }),
					status === void 0 && !failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: muted,
						children: t("loading")
					}) : null,
					failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: card,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: muted,
							children: t("loadFailed")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: action,
							onClick: () => void loadAll(),
							children: t("retry")
						})]
					}) : null,
					status ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...card,
							marginTop: 4,
							gap: 16
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								style: heading,
								children: t("access")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "dsh-mobile-remote-modes",
								role: "radiogroup",
								"aria-label": t("access"),
								style: { marginTop: 10 },
								children: [[
									"quick",
									"temporary",
									"temporaryHint"
								], [
									"custom",
									"permanent",
									"permanentHint"
								]].map(([value, title, hint]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									role: "radio",
									"aria-checked": mode === value,
									onClick: () => void selectMode(value),
									style: {
										minHeight: 56,
										textAlign: "left",
										border: "none",
										borderRadius: 12,
										padding: "10px 12px",
										cursor: "pointer",
										background: mode === value ? "var(--dsw-alias-bg-module-platform)" : "transparent",
										boxShadow: mode === value ? "inset 0 0 0 1.5px var(--dsw-alias-label-primary)" : "inset 0 0 0 1px var(--dsw-alias-border-l2)",
										color: "var(--dsw-alias-label-primary)"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										style: {
											display: "block",
											fontSize: 14
										},
										children: t(title)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: {
											display: "block",
											marginTop: 2,
											color: "var(--dsw-alias-label-tertiary)",
											fontSize: 12
										},
										children: t(hint)
									})]
								}, value))
							}),
							mode === "custom" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
								style: {
									display: "grid",
									gap: 8,
									marginTop: 12
								},
								onSubmit: (event) => {
									event.preventDefault();
									saveEndpoint("custom");
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										style: {
											...muted,
											margin: 0
										},
										htmlFor: "dsh-mobile-custom-url",
										children: t("customUrl")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "grid",
											gridTemplateColumns: "minmax(0, 1fr) auto",
											gap: 8,
											alignItems: "center"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											id: "dsh-mobile-custom-url",
											value: customUrl,
											onChange: (event) => setCustomUrl(event.target.value),
											placeholder: "https://host.example",
											autoComplete: "off",
											style: input
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "submit",
											style: action,
											disabled: saving || !dirty,
											children: saving ? t("saving") : t("save")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ol", {
										style: {
											...muted,
											margin: 0,
											paddingLeft: 0,
											listStyle: "none",
											display: "grid",
											gap: 4
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("customStep1") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("customStep2") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("customStep3") }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("customStep4") })
										]
									}),
									dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: {
											...muted,
											margin: 0
										},
										children: t("qrPendingSave")
									}) : null
								]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...muted,
									margin: "10px 0 0"
								},
								children: t("temporarySetup")
							}),
							saveMessage ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								role: "status",
								style: {
									...muted,
									margin: "8px 0 0"
								},
								children: saveMessage
							}) : null,
							saveError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								role: "alert",
								style: {
									...muted,
									margin: "8px 0 0",
									color: "#dc2626"
								},
								children: saveError
							}) : null
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								justifyItems: "center",
								gap: 10,
								padding: 16,
								borderRadius: 12,
								background: "var(--dsw-alias-bg-module-platform)"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									style: {
										...heading,
										justifySelf: "stretch"
									},
									children: t("scanTitle")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: {
										...muted,
										margin: 0,
										justifySelf: "stretch"
									},
									children: t("scanHint")
								}),
								endpointUrl ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
										src: pairingQrUrl("android", revision),
										alt: t("qrAlt"),
										style: {
											boxSizing: "border-box",
											width: 180,
											maxWidth: "100%",
											padding: 8,
											borderRadius: 12,
											background: "#fff"
										}
									}, revision),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										onClick: () => void copyUrl(endpointUrl),
										style: {
											...action,
											display: "grid",
											gap: 4,
											width: "100%",
											textAlign: "left",
											padding: "10px 12px",
											background: "var(--dsw-alias-bg-layer-1)"
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													color: "var(--dsw-alias-label-tertiary)",
													fontSize: 12
												},
												children: t("currentAddress")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
												style: {
													minWidth: 0,
													overflowWrap: "anywhere",
													fontSize: 13
												},
												children: endpointUrl
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: {
													color: "var(--dsw-alias-label-tertiary)",
													fontSize: 12
												},
												children: copied ? t("copied") : t("copyHint")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: action,
										onClick: () => setRevision((current) => current + 1),
										children: t("refreshQr")
									})
								] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: {
										...muted,
										margin: 0,
										textAlign: "center"
									},
									children: t("notReady")
								})
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: heading,
						children: t("devices")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "grid",
							gap: 10,
							marginTop: 12
						},
						children: [live.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: card,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...muted,
									margin: 0
								},
								children: t("noDevices")
							})
						}) : null, live.map((device) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
							style: {
								...card,
								gridTemplateColumns: "1fr auto",
								alignItems: "center",
								minHeight: 72
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: { minWidth: 0 },
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
										style: {
											display: "block",
											fontSize: 14,
											fontWeight: 600
										},
										children: device.label || device.id
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										style: {
											...muted,
											margin: "4px 0 0"
										},
										children: [
											deviceKind(device, t),
											" · ",
											t("lastSeen"),
											" ",
											formatSeen(device.lastSeenAt, t)
										]
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										gap: 8,
										flexWrap: "wrap",
										justifyContent: "flex-end"
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: action,
											onClick: () => void rename(device),
											children: t("rename")
										}),
										device.room ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: action,
											onClick: () => setRefreshingId(refreshingId === device.id ? null : device.id),
											children: t("refreshAddress")
										}) : null,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: danger,
											onClick: () => void revoke(device.id),
											children: t("revoke")
										})
									]
								}),
								refreshingId === device.id && device.room ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										gridColumn: "1 / -1",
										display: "grid",
										gap: 10,
										justifyItems: "start"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
										src: pairingRefreshQrUrl(device.room, revision),
										alt: t("refreshAddress"),
										style: {
											width: 160,
											padding: 8,
											borderRadius: 12,
											background: "#fff"
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: action,
										onClick: () => setRefreshingId(null),
										children: t("closeRefresh")
									})]
								}) : null
							]
						}, device.id))]
					})] })] }) : null
				]
			});
		}
		function apply(ctx) {
			const namespace = "settings.dsh-mobile";
			ctx.effect(() => ctx.locale.register(namespace, {
				zh,
				en
			}), "dsh-mobile-pairing: settings copy");
			const t = ctx.locale.bind(namespace);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: REMOTE_SETTINGS_SECTION.id,
				order: REMOTE_SETTINGS_SECTION.order,
				label: () => t("nav"),
				locale: namespace,
				inject: () => ({ t })
			}, DshMobileCard));
			ctx.effect(installRemoteNavIcon, "dsh-mobile-pairing: settings nav icon");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map