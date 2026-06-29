import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

function extractBetween(value, startMarker, endMarker) {
	const start = value.indexOf(startMarker);
	if (start === -1) {
		throw new Error(`Missing start marker: ${startMarker}`);
	}
	const end = value.indexOf(endMarker, start);
	if (end === -1) {
		throw new Error(`Missing end marker: ${endMarker}`);
	}
	return value.slice(start, end);
}

function buildToolHarness(html, timeoutMs) {
	const normalizedHtml = html.replace(/\r\n?/g, "\n");
	const i18n = extractBetween(
		normalizedHtml,
		"const WORKSPACE_I18N =",
		"\n\n        const fields =",
	);
	const translation = extractBetween(
		normalizedHtml,
		"function normalizeUiLanguage",
		"\n\n        function applyLanguage",
	);
	const toolBridge = extractBetween(
		normalizedHtml,
		"const hostToolTimeoutMs =",
		"\n\n        function structuredContent",
	).replace(/const hostToolTimeoutMs = \d+;/, `const hostToolTimeoutMs = ${timeoutMs};`);
	const context = vm.createContext({
		clearTimeout,
		Error,
		Promise,
		setTimeout,
		String,
		window: { openai: {} },
	});

	vm.runInContext(
		`
${i18n}
let activeLanguage = "en";
${translation}
${toolBridge}
globalThis.setLanguage = (value) => {
	activeLanguage = normalizeUiLanguage(value);
};
globalThis.callWorkspaceTool = callTool;
`,
		context,
	);
	return context;
}

function createFakeElement() {
	return {
		children: [],
		classList: {
			add() {},
			remove() {},
			toggle() {},
			contains() {
				return false;
			},
		},
		innerHTML: "",
		textContent: "",
		type: "",
		disabled: false,
		value: "",
		addEventListener() {},
		append(...children) {
			this.children.push(...children);
			this.innerHTML += children
				.map((child) => child?.innerHTML || child?.textContent || "")
				.join("");
		},
		appendChild(child) {
			this.children.push(child);
			this.innerHTML += child?.innerHTML || child?.textContent || "";
		},
		closest() {
			return null;
		},
		insertAdjacentElement() {},
		setAttribute() {},
	};
}

function buildFollowUpHarness(html, openai = { sendFollowUpMessage: async () => ({}) }) {
	const normalizedHtml = html.replace(/\r\n?/g, "\n");
	const i18n = extractBetween(
		normalizedHtml,
		"const WORKSPACE_I18N =",
		"\n\n        const fields =",
	);
	const translation = extractBetween(
		normalizedHtml,
		"function normalizeUiLanguage",
		"\n\n        function applyLanguage",
	);
	const errorFormatting = extractBetween(
		normalizedHtml,
		"function formatErrorMessage",
		"\n\n        function renderBlocked",
	);
	const followUp = extractBetween(
		normalizedHtml,
		"async function sendFollowUp",
		"\n\n        function escapeAttribute",
	);
	const followUpElement = createFakeElement();
	const context = vm.createContext({
		Error,
		String,
		document: {
			createElement: createFakeElement,
		},
		fields: {
			followUp: followUpElement,
		},
		window: {
			openai,
		},
	});

	vm.runInContext(
		`
${i18n}
let activeLanguage = "en";
${translation}
${errorFormatting}
${followUp}
globalThis.setLanguage = (value) => {
	activeLanguage = normalizeUiLanguage(value);
};
globalThis.sendWidgetFollowUp = sendFollowUp;
globalThis.followUpHtml = () => fields.followUp.innerHTML;
`,
		context,
	);
	return context;
}

function buildMediaHarness(html) {
	const normalizedHtml = html.replace(/\r\n?/g, "\n");
	const mediaNormalization = extractBetween(
		normalizedHtml,
		"function normalizeMediaFileSources",
		"\n\n        function appendMediaFileRow",
	);
	const mediaCollection = extractBetween(
		normalizedHtml,
		"function collectMediaSources",
		"\n\n        function appendPickedFileRows",
	);
	const context = vm.createContext({
		Array,
		Boolean,
		String,
		fields: {
			mediaSources: {
				querySelectorAll() {
					return [];
				},
			},
		},
	});

	vm.runInContext(
		`
${mediaNormalization}
${mediaCollection}
globalThis.normalizeWidgetMediaSources = normalizeMediaFileSources;
globalThis.collectWidgetMediaSources = (rows) => {
	fields.mediaSources = {
		querySelectorAll() {
			return rows;
		},
	};
	return collectMediaSources();
};
`,
		context,
	);
	return context;
}

function buildInitialDefaultsHarness(html, openai) {
	const normalizedHtml = html.replace(/\r\n?/g, "\n");
	const initialDefaults = extractBetween(
		normalizedHtml,
		"function intentDefaultsFromPayload",
		"\n\n        function slugify",
	);
	const context = vm.createContext({
		window: { openai },
	});

	vm.runInContext(
		`
let currentPendingConfirmationId = "";
${initialDefaults}
globalThis.readWorkspaceDefaults = () => {
	currentPendingConfirmationId = "";
	const defaults = initialDefaults();
	return { pendingConfirmationId: currentPendingConfirmationId, defaults };
};
`,
		context,
	);
	return context;
}

function buildSubmitHarness(html, toolResult) {
	const normalizedHtml = html.replace(/\r\n?/g, "\n");
	const resetReadyState = extractBetween(
		normalizedHtml,
		"function resetReadyState",
		"\n\n        function renderMediaSources",
	);
	const submitFlow = extractBetween(
		normalizedHtml,
		"async function submit",
		"\n\n        fields.projectName.addEventListener",
	);
	const submitButton = createFakeElement();
	const resultElement = createFakeElement();
	const followUpElement = createFakeElement();
	const openEditorLink = createFakeElement();
	const calls = [];
	const sentFollowUpMessages = [];
	const context = vm.createContext({
		calls,
		Error,
		Promise,
		sentFollowUpMessages,
		String,
		toolResult,
		document: {
			createElement: createFakeElement,
			getElementById(id) {
				if (id === "open-editor-link") return openEditorLink;
				return null;
			},
		},
		fields: {
			submitButton,
			result: resultElement,
			followUp: followUpElement,
		},
		window: {
			openai: {
				openExternal: async () => ({}),
				sendFollowUpMessage: async (message) => {
					sentFollowUpMessages.push(message);
					return {};
				},
			},
		},
	});

	vm.runInContext(
		`
let activeLanguage = "en";
let currentPendingConfirmationId = "ccpending_1234567890abcdef12345678";
let setupSubmitted = false;
function t(key) {
	return {
		createProject: "Create project",
		creating: "Creating",
		projectCreated: "Project created",
		openEditor: "Open editor",
		setupFailed: "Setup failed",
		setupBlocked: "Setup blocked",
		openEditorFailed: "Open editor failed",
		continuing: "Continuing",
		followUpFailed: "Could not send follow-up",
		followUpUnavailable: "Follow-up unavailable",
		followUpRequested: "Asked Codex to continue.",
		followUpRecoveryHint: "Recover this setup if needed.",
		recoverSetupLabel: "Recover with recover_codecut_setup",
		retryFollowUp: "Retry follow-up",
		missingFollowUpPrompt: "Missing follow-up prompt",
	}[key] || key;
}
function collectIntent() {
	return { pendingConfirmationId: currentPendingConfirmationId, confirmedByUser: true };
}
async function callTool(name, args) {
	calls.push({ name, args });
	return toolResult;
}
function structuredContent(result) {
	return result?.structuredContent || result || {};
}
function formatErrorMessage(value, fallback) {
	if (value instanceof Error) return value.message || fallback;
	if (typeof value === "string") return value || fallback;
	return fallback;
}
function renderChecks() {
	return null;
}
function renderBlocked(payload) {
	fields.result.innerHTML = formatErrorMessage(payload?.error || payload?.message, t("setupBlocked"));
}
function renderSubmitting() {
	fields.result.innerHTML = t("creating");
}
${resetReadyState}
${submitFlow}
globalThis.submitWidget = () => submit({ preventDefault() {} });
globalThis.resetWidgetReadyState = resetReadyState;
globalThis.buttonState = () => ({
	disabled: fields.submitButton.disabled,
	text: fields.submitButton.textContent,
});
globalThis.callCount = () => calls.length;
globalThis.sentFollowUps = () => sentFollowUpMessages;
`,
		context,
	);
	return context;
}

test("workspace widget preserves URL media sources through normalization and collection", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const harness = buildMediaHarness(html);
	const url =
		"https://www.tiktok.com/@ayusbangga2/video/7638536445577235732";

	expect(
		harness.normalizeWidgetMediaSources([
			{ kind: "url", url },
		]),
	).toEqual([{ kind: "url", url }]);
	expect(
		harness.collectWidgetMediaSources([
			{
				dataset: {
					kind: "url",
					url,
				},
			},
		]),
	).toEqual([{ kind: "url", url }]);
});

test("workspace widget reads pending confirmation ID from nested structured tool output", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const pendingConfirmationId = "ccpending_9b09e4e51995cc3ef774b965";
	const harness = buildInitialDefaultsHarness(html, {
		toolOutput: {
			structuredContent: {
				pendingConfirmationId,
				intentDefaults: {
					projectName: "22号素材解说口播原时长版",
				},
			},
		},
	});

	expect(harness.readWorkspaceDefaults()).toEqual({
		pendingConfirmationId,
		defaults: {
			projectName: "22号素材解说口播原时长版",
		},
	});
});

test("workspace widget does not claim follow-up delivery without showing recovery identifiers", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const harness = buildFollowUpHarness(html);

	harness.setLanguage("zh-CN");
	await harness.sendWidgetFollowUp("Continue editing prompt", {
		projectId: "project-123",
		intent: { pendingConfirmationId: "ccpending_123" },
	});

	const rendered = harness.followUpHtml();
	expect(rendered).toContain("已请求 Codex 继续");
	expect(rendered).toContain("recover_codecut_setup");
	expect(rendered).toContain("project-123");
	expect(rendered).toContain("ccpending_123");
	expect(rendered).not.toContain("已发送后续任务给 Codex");
});

test("workspace widget sends follow-up prompts as plain text", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const messages = [];
	const harness = buildFollowUpHarness(html, {
		sendFollowUpMessage: async (message) => {
			messages.push(message);
			return {};
		},
	});

	await harness.sendWidgetFollowUp("Continue editing prompt", {
		projectId: "project-123",
		intent: { pendingConfirmationId: "ccpending_123" },
	});

	expect(messages).toEqual(["Continue editing prompt"]);
});

test("workspace widget formats follow-up object errors and preserves recovery identifiers", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const harness = buildFollowUpHarness(html, {
		sendFollowUpMessage: async () => {
			throw {
				message: "Host returned an error from the server tool.",
				detail: { code: "host_tool_error" },
			};
		},
	});

	harness.setLanguage("zh-CN");
	await harness.sendWidgetFollowUp("Continue editing prompt", {
		projectId: "project-123",
		intent: { pendingConfirmationId: "ccpending_123" },
	});

	const rendered = harness.followUpHtml();
	expect(rendered).toContain("Host returned an error from the server tool.");
	expect(rendered).toContain("recover_codecut_setup");
	expect(rendered).toContain("project-123");
	expect(rendered).toContain("ccpending_123");
	expect(rendered).toContain("Continue editing prompt");
	expect(rendered).toContain("重试发送后续任务");
	expect(rendered).not.toContain("[object Object]");
});

test("workspace widget keeps create-project submission locked after success", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const harness = buildSubmitHarness(html, {
		structuredContent: {
			status: "created",
			projectId: "project-123",
			revision: 2,
			editorUrl: "http://127.0.0.1:4100/en/editor/project-123",
			importedMedia: [],
			intent: { pendingConfirmationId: "ccpending_1234567890abcdef12345678" },
			continuePrompt: "Continue CodeCut editing.",
		},
	});

	await harness.submitWidget();

	expect(harness.buttonState()).toEqual({
		disabled: true,
		text: "Project created",
	});
	expect(harness.callCount()).toBe(1);
	expect(harness.sentFollowUps()).toEqual(["Continue CodeCut editing."]);

	harness.resetWidgetReadyState();
	expect(harness.buttonState()).toEqual({
		disabled: true,
		text: "Project created",
	});

	await harness.submitWidget();
	expect(harness.callCount()).toBe(1);
});

test("workspace widget host tool calls fail fast when the host bridge never returns", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const windowsHtml = html.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
	const harness = buildToolHarness(windowsHtml, 50);

	harness.setLanguage("zh-CN");
	harness.window.openai.callTool = () => new Promise(() => {});

	try {
		await harness.callWorkspaceTool("submit_codecut_setup", {});
		throw new Error("Expected host bridge timeout");
	} catch (error) {
		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe("宿主工具没有返回结果。");
	}
});

test("workspace widget host tool calls still pass through successful host responses", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const harness = buildToolHarness(html, 50);

	harness.window.openai.callServerTool = (payload) => ({
		receivedName: payload.name,
		receivedArguments: payload.arguments,
	});

	const result = await harness.callWorkspaceTool("submit_codecut_setup", {
		projectName: "demo",
	});

	expect(result).toEqual({
		receivedName: "submit_codecut_setup",
		receivedArguments: { projectName: "demo" },
	});
});

test("workspace widget prefers callServerTool when both host APIs are present", async () => {
	const html = await readFile("mcp/codecut-workspace.html", "utf8");
	const harness = buildToolHarness(html, 50);

	harness.window.openai.callTool = () => new Promise(() => {});
	harness.window.openai.callServerTool = (payload) => ({
		receivedName: payload.name,
		receivedArguments: payload.arguments,
	});

	const result = await harness.callWorkspaceTool("submit_codecut_setup", {
		projectName: "demo",
	});

	expect(result).toEqual({
		receivedName: "submit_codecut_setup",
		receivedArguments: { projectName: "demo" },
	});
});
