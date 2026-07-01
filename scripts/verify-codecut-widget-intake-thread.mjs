#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const isCli = process.argv[1] && resolve(process.argv[1]) === scriptPath;

function usage() {
	return [
		"Usage:",
		"  node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <id>",
		"  node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <id> --session-file <path>",
		"  node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <id> --require-follow-up true",
		"  node scripts/verify-codecut-widget-intake-thread.mjs --thread-id <id> --require-confirmed-requirement true",
		"",
		"Pass only after a fresh @codecut validation thread has rendered the Codecut workspace widget.",
	].join("\n");
}

export function parseWidgetIntakeFlags(argv) {
	const flags = {};
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (entry === "--help" || entry === "-h") {
			flags.help = true;
			continue;
		}
		if (!entry.startsWith("--")) {
			throw new Error(`Unexpected argument: ${entry}`);
		}
		const key = entry
			.slice(2)
			.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) {
			throw new Error(`Missing value for ${entry}`);
		}
		flags[key] = value;
		index += 1;
	}
	return flags;
}

async function walkFiles(root) {
	const entries = await readdir(root, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(path)));
		} else if (entry.isFile()) {
			files.push(path);
		}
	}
	return files;
}

export async function findThreadSessionFile({ sessionsRoot, threadId }) {
	const root = resolve(sessionsRoot);
	const files = (await walkFiles(root)).filter((path) => path.endsWith(".jsonl"));
	const nameMatch = files.find((path) => path.includes(threadId));
	if (nameMatch) return nameMatch;

	for (const file of files) {
		const content = await readFile(file, "utf8");
		if (content.includes(threadId)) return file;
	}
	throw new Error(`No Codex session JSONL found for thread ${threadId} under ${root}.`);
}

export async function readThreadRecordFile({ filePath }) {
	const content = await readFile(filePath, "utf8");
	const trimmed = content.trim();
	if (!trimmed) return [];
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		try {
			return [JSON.parse(trimmed)];
		} catch {
			// JSONL files can also start with "{" and end with "}".
		}
	}
	return trimmed
		.split(/\r?\n/)
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function textFromMessage(message) {
	if (typeof message?.text === "string") return message.text;
	if (typeof message?.message === "string") return message.message;
	if (Array.isArray(message?.content)) {
		return message.content.map((entry) => entry.text ?? "").join("\n");
	}
	return "";
}

function collectItems(record, items = []) {
	if (!record || typeof record !== "object") return items;
	items.push(record);
	if (record.payload && typeof record.payload === "object") {
		items.push(record.payload);
	}
	if (Array.isArray(record.turns)) {
		for (const turn of record.turns) collectItems(turn, items);
	}
	if (Array.isArray(record.items)) {
		for (const item of record.items) collectItems(item, items);
	}
	return items;
}

function isWidgetCall(item) {
	if (
		item.type === "mcpToolCall" &&
		item.server === "codecut_mcp" &&
		item.tool === "open_codecut_workspace"
	) {
		return true;
	}
	if (
		item.type === "function_call" &&
		(item.name === "mcp__codecut_mcp.open_codecut_workspace" ||
			item.name === "open_codecut_workspace")
	) {
		return true;
	}
	return false;
}

function isRequirementOpenCall(item) {
	if (
		item.type === "mcpToolCall" &&
		item.server === "codecut_mcp" &&
		item.tool === "open_codecut_requirement_confirmation"
	) {
		return true;
	}
	if (
		item.type === "function_call" &&
		(item.name ===
			"mcp__codecut_mcp.open_codecut_requirement_confirmation" ||
			item.name === "open_codecut_requirement_confirmation")
	) {
		return true;
	}
	return false;
}

function nestedStatus(value) {
	if (!value || typeof value !== "object") return undefined;
	if (typeof value.status === "string") return value.status;
	return (
		nestedStatus(value.structuredContent) ||
		nestedStatus(value.result) ||
		nestedStatus(value.output) ||
		nestedStatus(value.payload)
	);
}

function isRequirementConfirmedReadback(item) {
	const isGetCall =
		(item.type === "mcpToolCall" &&
			item.server === "codecut_mcp" &&
			item.tool === "get_codecut_requirement_confirmation") ||
		(item.type === "function_call" &&
			(item.name ===
				"mcp__codecut_mcp.get_codecut_requirement_confirmation" ||
				item.name === "get_codecut_requirement_confirmation"));
	if (!isGetCall) return false;
	return nestedStatus(item) === "confirmed";
}

function containsOpenAiOutputTemplate(value) {
	if (!value || typeof value !== "object") return false;
	if (Object.prototype.hasOwnProperty.call(value, "openai/outputTemplate")) {
		return true;
	}
	for (const entry of Object.values(value)) {
		if (containsOpenAiOutputTemplate(entry)) return true;
	}
	return false;
}

function containsRequirementConfirmationResourceUri(value) {
	if (typeof value === "string") {
		return value.startsWith("ui://codecut/") && value.includes("requirement-confirmation");
	}
	if (!value || typeof value !== "object") return false;
	for (const entry of Object.values(value)) {
		if (containsRequirementConfirmationResourceUri(entry)) return true;
	}
	return false;
}

function hasRequirementInlineOpener(item) {
	if (!isRequirementOpenCall(item)) return false;
	return (
		containsOpenAiOutputTemplate(item) ||
		containsRequirementConfirmationResourceUri(item)
	);
}

function isProjectSideEffectCall(item) {
	if (item.type === "mcpToolCall" && item.server === "codecut_mcp") {
		return (
			item.tool === "submit_codecut_setup" ||
			item.tool === "create_codecut_project_from_requirement"
		);
	}
	if (item.type === "function_call") {
		return [
			"mcp__codecut_mcp.submit_codecut_setup",
			"submit_codecut_setup",
			"mcp__codecut_mcp.create_codecut_project_from_requirement",
			"create_codecut_project_from_requirement",
		].includes(item.name);
	}
	return false;
}

function isShellCall(item) {
	return item.type === "function_call" && item.name === "exec_command";
}

function isFileChange(item) {
	return item.type === "fileChange";
}

function isTextFallback(item) {
	const text = textFromMessage(item);
	return /直接回复|C\/A\/A\/A\/A|剪辑前请确认|text-only questions/i.test(text);
}

function isSetupFollowUpMessage(item) {
	const text = textFromMessage(item);
	if (!text) return false;
	return (
		text.includes("Use $codecut to continue the real CodeCut editing chain") &&
		text.includes("--confirmation-token")
	);
}

function flagEnabled(value) {
	return value === true || value === "true" || value === "1";
}

export function assertWidgetIntakeThread({
	threadId,
	records,
	requireFollowUp = false,
	requireConfirmedRequirement = false,
}) {
	const items = records.flatMap((record) => collectItems(record, []));
	const widgetCallCount = items.filter(isWidgetCall).length;
	const requirementOpenCallCount = items.filter(isRequirementOpenCall).length;
	const requirementConfirmedReadbackCount = items.filter(
		isRequirementConfirmedReadback,
	).length;
	const requirementInlineOpenerCount = items.filter(
		hasRequirementInlineOpener,
	).length;
	const projectSideEffectCallCount = items.filter(
		isProjectSideEffectCall,
	).length;
	const disallowedShellCallCount = items.filter(isShellCall).length;
	const disallowedFileChangeCount = items.filter(isFileChange).length;
	const textFallbackCount = items.filter(isTextFallback).length;
	const followUpMessageCount = items.filter(isSetupFollowUpMessage).length;

	if (disallowedShellCallCount > 0) {
		throw new Error("Fresh widget validation thread must not run shell commands.");
	}
	if (disallowedFileChangeCount > 0) {
		throw new Error("Fresh widget validation thread must not write files.");
	}
	if (flagEnabled(requireConfirmedRequirement)) {
		if (requirementOpenCallCount === 0) {
			throw new Error(
				"Codecut requirement confirmation was not proven: missing codecut_mcp.open_codecut_requirement_confirmation mcpToolCall.",
			);
		}
		if (requirementOpenCallCount > 1) {
			throw new Error(
				`Codecut requirement confirmation regressed: expected exactly one open_codecut_requirement_confirmation call, found ${requirementOpenCallCount}.`,
			);
		}
		if (requirementInlineOpenerCount > 0) {
			throw new Error(
				"Codecut requirement confirmation regressed: found inline MCP App opener metadata.",
			);
		}
		if (projectSideEffectCallCount > 0) {
			throw new Error(
				"Codecut requirement confirmation regressed: project creation ran during intake validation.",
			);
		}
		if (requirementConfirmedReadbackCount === 0) {
			throw new Error(
				"Codecut requirement confirmation was not proven: missing confirmed get_codecut_requirement_confirmation readback.",
			);
		}
		if (textFallbackCount > 0) {
			throw new Error(
				"Codecut requirement confirmation regressed: found text fallback prompt after requirement validation.",
			);
		}
		return {
			status: "passed",
			threadId,
			widgetCallCount,
			requirementOpenCallCount,
			requirementConfirmedReadbackCount,
			requirementInlineOpenerCount,
			projectSideEffectCallCount,
			disallowedShellCallCount,
			disallowedFileChangeCount,
			textFallbackCount,
			followUpMessageCount,
		};
	}
	if (widgetCallCount === 0) {
		const suffix =
			textFallbackCount > 0 ? "; found text fallback prompt." : ".";
		throw new Error(
			`Codecut widget intake was not proven: missing codecut_mcp.open_codecut_workspace mcpToolCall${suffix}`,
		);
	}
	if (widgetCallCount > 1) {
		throw new Error(
			`Codecut widget intake regressed: expected exactly one open_codecut_workspace call, found ${widgetCallCount}.`,
		);
	}
	if (textFallbackCount > 0) {
		throw new Error(
			"Codecut widget intake regressed: found text fallback prompt after widget validation.",
		);
	}
	if (flagEnabled(requireFollowUp) && followUpMessageCount === 0) {
		throw new Error(
			"Codecut setup follow-up was not proven: missing visible continuation user message.",
		);
	}

	return {
		status: "passed",
		threadId,
		widgetCallCount,
		requirementOpenCallCount,
		requirementConfirmedReadbackCount,
		requirementInlineOpenerCount,
		projectSideEffectCallCount,
		disallowedShellCallCount,
		disallowedFileChangeCount,
		textFallbackCount,
		followUpMessageCount,
	};
}

export async function runWidgetIntakeVerification({
	threadId,
	sessionFile,
	requireFollowUp,
	requireConfirmedRequirement,
	sessionsRoot = join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions"),
}) {
	if (!threadId) {
		throw new Error("--thread-id is required.");
	}
	const filePath = sessionFile
		? resolve(sessionFile)
		: await findThreadSessionFile({ sessionsRoot, threadId });
	await stat(filePath);
	const records = await readThreadRecordFile({ filePath });
	const report = assertWidgetIntakeThread({
		threadId,
		records,
		requireFollowUp: flagEnabled(requireFollowUp),
		requireConfirmedRequirement: flagEnabled(requireConfirmedRequirement),
	});
	return { ...report, sessionFile: filePath };
}

if (isCli) {
	try {
		const flags = parseWidgetIntakeFlags(process.argv.slice(2));
		if (flags.help) {
			console.log(usage());
			process.exit(0);
		}
		const result = await runWidgetIntakeVerification({
			threadId: flags.threadId,
			sessionFile: flags.sessionFile,
			sessionsRoot: flags.sessionsRoot,
			requireFollowUp: flags.requireFollowUp,
			requireConfirmedRequirement: flags.requireConfirmedRequirement,
		});
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
