import { randomBytes, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const CONFIRMATION_DIRECTORY = ".codecut-confirmations";
const CONFIRMATION_FILE = "tokens.json";
const CONFIRMATION_ROOT_ENV = "CODECUT_CONFIRMATION_ROOT";
const pendingPrefix = "ccpending_";
const confirmedPrefix = "ccconfirmed_";

function nowIso() {
	return new Date().toISOString();
}

function tokenHash(token) {
	return createHash("sha256").update(String(token)).digest("hex");
}

export function resolveCodecutConfirmationRoot({
	root,
	env = process.env,
} = {}) {
	const configuredRoot = root || env[CONFIRMATION_ROOT_ENV];
	if (configuredRoot) return resolve(String(configuredRoot));
	return join(homedir(), ".codex");
}

function confirmationFilePath(root) {
	return join(
		resolveCodecutConfirmationRoot({ root }),
		CONFIRMATION_DIRECTORY,
		CONFIRMATION_FILE,
	);
}

async function readConfirmationState(root) {
	try {
		return JSON.parse(await readFile(confirmationFilePath(root), "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") {
			return { version: 1, confirmations: [] };
		}
		throw error;
	}
}

async function writeConfirmationState(root, state) {
	const filePath = confirmationFilePath(root);
	await mkdir(join(resolveCodecutConfirmationRoot({ root }), CONFIRMATION_DIRECTORY), {
		recursive: true,
	});
	await writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
}

export function createPendingCodecutConfirmation() {
	return `${pendingPrefix}${randomBytes(12).toString("hex")}`;
}

export function isPendingCodecutConfirmation(value) {
	return typeof value === "string" && /^ccpending_[a-f0-9]{24}$/.test(value);
}

export async function mintCodecutConfirmationToken({
	root,
	projectId,
	pendingConfirmationId,
}) {
	if (!projectId) {
		throw new Error("projectId is required for CodeCut setup confirmation");
	}
	if (!isPendingCodecutConfirmation(pendingConfirmationId)) {
		throw new Error(
			"pendingConfirmationId from open_codecut_workspace is required before setup submission",
		);
	}
	const confirmationToken = `${confirmedPrefix}${randomBytes(16).toString("hex")}`;
	const state = await readConfirmationState(root);
	state.confirmations = [
		...(Array.isArray(state.confirmations) ? state.confirmations : []),
		{
			projectId,
			pendingConfirmationId,
			tokenHash: tokenHash(confirmationToken),
			confirmedAt: nowIso(),
		},
	];
	await writeConfirmationState(root, state);
	return confirmationToken;
}

export async function assertCodecutConfirmationToken({
	root,
	projectId,
	confirmationToken,
}) {
	if (!confirmationToken) {
		throw new Error(
			"confirmationToken is required. Submit the CodeCut setup widget before running side-effect tools.",
		);
	}
	if (!projectId) {
		throw new Error("projectId is required for confirmationToken validation");
	}
	const state = await readConfirmationState(root);
	const hash = tokenHash(confirmationToken);
	const matched = (Array.isArray(state.confirmations)
		? state.confirmations
		: []
	).some(
		(record) => record.projectId === projectId && record.tokenHash === hash,
	);
	if (!matched) {
		throw new Error(
			`confirmationToken is invalid for CodeCut project ${projectId}`,
		);
	}
	return true;
}
