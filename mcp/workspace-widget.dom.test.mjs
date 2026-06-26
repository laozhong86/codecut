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
