import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const CONFIRMATION_DIRECTORY = ".codecut-confirmations";
const CONFIRMATION_FILE = "tokens.json";
const CONFIRMATION_ROOT_ENV = "CODECUT_CONFIRMATION_ROOT";
const pendingPrefix = "ccpending_";
const confirmedPrefix = "ccconfirmed_";
const storedSetupResultLimit = 50;
const activePendingConfirmationIds = new Set();

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

function readConfirmationStateSync(root) {
	try {
		return JSON.parse(readFileSync(confirmationFilePath(root), "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") {
			return { version: 1, confirmations: [] };
		}
		throw error;
	}
}

function writeConfirmationStateSync(root, state) {
	const filePath = confirmationFilePath(root);
	mkdirSync(join(resolveCodecutConfirmationRoot({ root }), CONFIRMATION_DIRECTORY), {
		recursive: true,
	});
	writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
}

function persistPendingCodecutConfirmation({ root, pendingConfirmationId }) {
	const state = readConfirmationStateSync(root);
	const pendingConfirmations = Array.isArray(state.pendingConfirmations)
		? state.pendingConfirmations
		: [];
	state.pendingConfirmations = [
		...pendingConfirmations.filter(
			(record) => record?.pendingConfirmationId !== pendingConfirmationId,
		),
		{
			pendingConfirmationId,
			createdAt: nowIso(),
		},
	];
	writeConfirmationStateSync(root, state);
}

export function createPendingCodecutConfirmation({ root } = {}) {
	const pendingConfirmationId = `${pendingPrefix}${randomBytes(12).toString("hex")}`;
	if (root) {
		persistPendingCodecutConfirmation({ root, pendingConfirmationId });
	} else {
		activePendingConfirmationIds.add(pendingConfirmationId);
	}
	return pendingConfirmationId;
}

export function isPendingCodecutConfirmation(value) {
	return typeof value === "string" && /^ccpending_[a-f0-9]{24}$/.test(value);
}

async function consumePendingCodecutConfirmation(value, { root } = {}) {
	if (!isPendingCodecutConfirmation(value)) return false;
	const consumedFromMemory = activePendingConfirmationIds.delete(value);
	const state = await readConfirmationState(root);
	const pendingConfirmations = Array.isArray(state.pendingConfirmations)
		? state.pendingConfirmations
		: [];
	const remainingPendingConfirmations = pendingConfirmations.filter(
		(record) => record?.pendingConfirmationId !== value,
	);
	const consumedFromDisk =
		remainingPendingConfirmations.length !== pendingConfirmations.length;
	if (consumedFromDisk) {
		state.pendingConfirmations = remainingPendingConfirmations;
		await writeConfirmationState(root, state);
	}
	return consumedFromMemory || consumedFromDisk;
}

export async function mintCodecutConfirmationToken({
	root,
	projectId,
	requestedProjectId,
	pendingConfirmationId,
}) {
	if (!projectId) {
		throw new Error("projectId is required for CodeCut setup confirmation");
	}
	if (
		!(await consumePendingCodecutConfirmation(pendingConfirmationId, { root }))
	) {
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

export async function persistCodecutSetupResult({
	root,
	projectId,
	requestedProjectId,
	pendingConfirmationId,
	confirmationToken,
	continuePrompt,
	editorUrl,
	projectName,
	revision,
	importedMedia,
	deferredMediaSources,
	intent,
}) {
	if (!projectId) {
		throw new Error("projectId is required for CodeCut setup recovery");
	}
	if (!isPendingCodecutConfirmation(pendingConfirmationId)) {
		throw new Error(
			"pendingConfirmationId is required for CodeCut setup recovery",
		);
	}
	if (!confirmationToken) {
		throw new Error(
			"confirmationToken is required for CodeCut setup recovery",
		);
	}
	if (!continuePrompt) {
		throw new Error("continuePrompt is required for CodeCut setup recovery");
	}
	const state = await readConfirmationState(root);
	const setupResults = Array.isArray(state.setupResults)
		? state.setupResults
		: [];
	state.setupResults = [
		...setupResults.filter(
			(record) =>
				(record?.projectId !== projectId &&
					record?.requestedProjectId !== requestedProjectId) ||
				record?.pendingConfirmationId !== pendingConfirmationId,
		),
		{
			projectId,
			requestedProjectId,
			pendingConfirmationId,
			confirmationToken,
			continuePrompt,
			editorUrl,
			projectName,
			revision,
			importedMedia,
			deferredMediaSources,
			intent,
			createdAt: nowIso(),
		},
	].slice(-storedSetupResultLimit);
	await writeConfirmationState(root, state);
}

export async function readCodecutSetupResult({
	root,
	projectId,
	pendingConfirmationId,
}) {
	if (!projectId) {
		throw new Error("projectId is required for CodeCut setup recovery");
	}
	if (!isPendingCodecutConfirmation(pendingConfirmationId)) {
		throw new Error(
			"pendingConfirmationId is required for CodeCut setup recovery",
		);
	}
	const state = await readConfirmationState(root);
	const setupResults = Array.isArray(state.setupResults)
		? state.setupResults
		: [];
	for (let index = setupResults.length - 1; index >= 0; index -= 1) {
		const record = setupResults[index];
		if (
			(record?.projectId === projectId ||
				record?.requestedProjectId === projectId) &&
			record?.pendingConfirmationId === pendingConfirmationId
		) {
			const hash = tokenHash(record.confirmationToken);
			const confirmations = Array.isArray(state.confirmations)
				? state.confirmations
				: [];
			const matched = confirmations.some(
				(confirmation) =>
					confirmation?.pendingConfirmationId === pendingConfirmationId &&
					confirmation?.tokenHash === hash,
			);
			if (!matched) {
				throw new Error(
					`Recovered confirmationToken is invalid for CodeCut project ${projectId}`,
				);
			}
			return record;
		}
	}
	throw new Error(
		`No confirmed CodeCut setup result found for project ${projectId}`,
	);
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
