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

export function assertWidgetIntakeThread({ threadId, records }) {
	const items = records.flatMap((record) => collectItems(record, []));
	const widgetCallCount = items.filter(isWidgetCall).length;
	const disallowedShellCallCount = items.filter(isShellCall).length;
	const disallowedFileChangeCount = items.filter(isFileChange).length;
	const textFallbackCount = items.filter(isTextFallback).length;

	if (disallowedShellCallCount > 0) {
		throw new Error("Fresh widget validation thread must not run shell commands.");
	}
	if (disallowedFileChangeCount > 0) {
		throw new Error("Fresh widget validation thread must not write files.");
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

	return {
		status: "passed",
		threadId,
		widgetCallCount,
		disallowedShellCallCount,
		disallowedFileChangeCount,
		textFallbackCount,
	};
}

export async function runWidgetIntakeVerification({
	threadId,
	sessionFile,
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
	const report = assertWidgetIntakeThread({ threadId, records });
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
		});
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}
