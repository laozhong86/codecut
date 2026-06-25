import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { assertCodecutConfirmationToken } from "./codecut-confirmation-gate.mjs";

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = ".codecut-workspace";
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;
const RUN_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export const REQUIRED_VISUAL_QA_CHECK_IDS = [
	"first_frame_not_black",
	"title_not_clipped",
	"text_layers_not_overlapping",
	"subject_not_cropped_by_cover",
	"bottom_safe_area_clear",
	"ending_normal",
	"export_matches_timeline_preview",
];

function nowIso() {
	return new Date().toISOString();
}

function assertProjectId(projectId) {
	if (!projectId) {
		throw new Error("--project-id is required");
	}
	if (!PROJECT_ID_PATTERN.test(projectId)) {
		throw new Error(
			"--project-id may contain only letters, numbers, dot, dash, and underscore",
		);
	}
}

function assertRunId(runId) {
	if (!runId || !RUN_ID_PATTERN.test(runId)) {
		throw new Error("runId must be a safe identifier");
	}
}

function assertAbsolutePath({ filePath, flagName }) {
	if (!filePath) {
		throw new Error(`${flagName} is required`);
	}
	if (!isAbsolute(filePath)) {
		throw new Error(`${flagName} must be an absolute path`);
	}
}

async function assertFileExists({ filePath, message }) {
	try {
		const result = await stat(filePath);
		if (!result.isFile()) {
			throw new Error(message);
		}
	} catch (error) {
		if (error?.code === "ENOENT") {
			throw new Error(message);
		}
		throw error;
	}
}

async function assertWorkspaceExists({ sourceRoot, projectId }) {
	const workspaceFile = join(
		workspaceProjectDirectory({ sourceRoot, projectId }),
		"workspace.json",
	);
	await assertFileExists({
		filePath: workspaceFile,
		message: `Workspace does not exist for project ${projectId}`,
	});
}

function workspaceProjectDirectory({ sourceRoot = process.cwd(), projectId }) {
	assertProjectId(projectId);
	return join(resolve(sourceRoot), WORKSPACE_ROOT, "projects", projectId);
}

function visualQaDirectory({ sourceRoot = process.cwd(), projectId, runId }) {
	assertRunId(runId);
	return join(
		workspaceProjectDirectory({ sourceRoot, projectId }),
		"06-verification",
		"visual-qa",
		runId,
	);
}

function readFiniteNumber({ value, flagName }) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) {
		throw new Error(`${flagName} must be a finite number`);
	}
	return parsed;
}

function assertFrameCount(frameCount) {
	const parsed = Number(frameCount);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 16) {
		throw new Error("--frame-count must be an integer from 1 to 16");
	}
	return parsed;
}

function sampleTimes({ startTime, endTime, frameCount }) {
	if (frameCount === 1) return [Number(startTime.toFixed(6))];
	const safeEndTime = Math.max(startTime, endTime - 0.001);
	const span = safeEndTime - startTime;
	return Array.from({ length: frameCount }, (_, index) => {
		if (index === frameCount - 1) {
			return Number(safeEndTime.toFixed(6));
		}
		return Number((startTime + (span * index) / (frameCount - 1)).toFixed(6));
	});
}

function safeSeconds(value) {
	return String(value).replace(/[^0-9.-]/g, "_");
}

async function copyFileIfDifferent({ source, destination }) {
	if (resolve(source) === resolve(destination)) {
		await assertFileExists({
			filePath: destination,
			message: `${destination} does not exist`,
		});
		return;
	}
	await copyFile(source, destination);
}

async function assertWrittenFile(filePath) {
	await assertFileExists({
		filePath,
		message: `Expected visual QA artifact was not written: ${filePath}`,
	});
	const result = await stat(filePath);
	if (result.size <= 0) {
		throw new Error(`Expected visual QA artifact is empty: ${filePath}`);
	}
}

export async function extractExportFrames({
	sourceRoot = process.cwd(),
	projectId,
	runId,
	exportFile,
	startTime,
	endTime,
	frameCount,
	confirmationToken,
	confirmationRoot,
	execFileImpl = execFileAsync,
}) {
	assertProjectId(projectId);
	assertRunId(runId);
	assertAbsolutePath({ filePath: exportFile, flagName: "--export-file" });
	const parsedStartTime = readFiniteNumber({
		value: startTime,
		flagName: "--start-time",
	});
	const parsedEndTime = readFiniteNumber({
		value: endTime,
		flagName: "--end-time",
	});
	if (parsedEndTime <= parsedStartTime) {
		throw new Error("--end-time must be greater than --start-time");
	}
	const parsedFrameCount = assertFrameCount(frameCount);
	await assertCodecutConfirmationToken({
		root: confirmationRoot,
		projectId,
		confirmationToken,
	});
	await assertWorkspaceExists({ sourceRoot, projectId });
	await assertFileExists({
		filePath: exportFile,
		message: `Export file does not exist: ${exportFile}`,
	});

	const qaDirectory = visualQaDirectory({ sourceRoot, projectId, runId });
	const framesDirectory = join(qaDirectory, "export-frames");
	await mkdir(framesDirectory, { recursive: true });
	const times = sampleTimes({
		startTime: parsedStartTime,
		endTime: parsedEndTime,
		frameCount: parsedFrameCount,
	});
	const framePaths = [];
	for (let index = 0; index < times.length; index += 1) {
		const framePath = join(
			framesDirectory,
			`frame-${String(index + 1).padStart(3, "0")}-${safeSeconds(times[index])}s.png`,
		);
		await execFileImpl("ffmpeg", [
			"-y",
			"-v",
			"error",
			"-ss",
			String(times[index]),
			"-i",
			exportFile,
			"-frames:v",
			"1",
			framePath,
		]);
		await assertWrittenFile(framePath);
		framePaths.push(framePath);
	}

	const contactSheetPath = join(qaDirectory, "export-contact-sheet.png");
	if (framePaths.length === 1) {
		await copyFile(framePaths[0], contactSheetPath);
	} else {
		const stackArgs = [
			"-y",
			"-v",
			"error",
			...framePaths.flatMap((framePath) => ["-i", framePath]),
			"-filter_complex",
			`hstack=inputs=${framePaths.length}`,
			contactSheetPath,
		];
		await execFileImpl("ffmpeg", stackArgs);
	}
	await assertWrittenFile(contactSheetPath);

	const manifestPath = join(qaDirectory, "export-frames-manifest.json");
	const manifest = {
		schemaVersion: 1,
		projectId,
		runId,
		generatedAt: nowIso(),
		exportFile,
		startTime: parsedStartTime,
		endTime: parsedEndTime,
		frameCount: parsedFrameCount,
		sampleTimesSec: times,
		framePaths,
		contactSheetPath,
	};
	await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

	return {
		projectId,
		runId,
		exportFile,
		frameCount: parsedFrameCount,
		sampleTimesSec: times,
		framePaths,
		contactSheetPath,
		manifestPath,
	};
}

function assertBoolean(value, message) {
	if (typeof value !== "boolean") {
		throw new Error(message);
	}
}

function assertFrameEvidence({ evidence, label }) {
	if (!evidence || typeof evidence !== "object") {
		throw new Error(`${label} evidence is required`);
	}
	assertAbsolutePath({
		filePath: evidence.contactSheetPath,
		flagName: `${label}.contactSheetPath`,
	});
	if (!Number.isInteger(evidence.frameCount) || evidence.frameCount < 1) {
		throw new Error(`${label}.frameCount must be a positive integer`);
	}
	if (
		!Array.isArray(evidence.sampleTimesSec) ||
		evidence.sampleTimesSec.length !== evidence.frameCount
	) {
		throw new Error(`${label}.sampleTimesSec must match frameCount`);
	}
	for (const time of evidence.sampleTimesSec) {
		if (!Number.isFinite(Number(time))) {
			throw new Error(`${label}.sampleTimesSec must contain numbers`);
		}
	}
	assertBoolean(evidence.passed, `${label}.passed must be boolean`);
}

function assertVisualQaChecks(checks) {
	if (!Array.isArray(checks)) {
		throw new Error("visual QA verdict checks must be an array");
	}
	const checksById = new Map();
	for (const check of checks) {
		if (!check || typeof check !== "object" || typeof check.id !== "string") {
			throw new Error("visual QA verdict checks must include id");
		}
		if (
			check.status !== "pass" &&
			check.status !== "fail" &&
			check.status !== "not_applicable"
		) {
			throw new Error(
				"visual QA verdict checks must use pass, fail, or not_applicable status",
			);
		}
		checksById.set(check.id, check);
	}
	for (const requiredId of REQUIRED_VISUAL_QA_CHECK_IDS) {
		if (!checksById.has(requiredId)) {
			throw new Error(
				`visual QA verdict is missing required check: ${requiredId}`,
			);
		}
	}
	return checksById;
}

function assertVisualQaIssues({ verdict, checksById }) {
	if (!Array.isArray(verdict.issues)) {
		throw new Error("visual QA verdict issues must be an array");
	}
	for (const issue of verdict.issues) {
		if (!issue || typeof issue !== "object") {
			throw new Error("visual QA verdict issue must be an object");
		}
		if (!checksById.has(issue.checkId)) {
			throw new Error("visual QA verdict issue uses an unknown checkId");
		}
		if (
			typeof issue.description !== "string" ||
			issue.description.length === 0
		) {
			throw new Error("visual QA verdict issue description is required");
		}
		assertBoolean(issue.fixed, "visual QA verdict issue fixed must be boolean");
	}
	if (
		verdict.status === "pass" &&
		verdict.issues.some((issue) => issue.fixed !== true)
	) {
		throw new Error("pass verdict cannot include unresolved issues");
	}
}

function buildVisualQaMarkdown(verdict) {
	const lines = [
		"# Visual QA Verdict",
		"",
		`Project ID: ${verdict.projectId}`,
		`Run ID: ${verdict.runId}`,
		`Reviewed at: ${verdict.reviewedAt}`,
		`Status: ${verdict.status}`,
		"",
		"## Timeline",
		"",
		`Contact sheet: ${verdict.timeline.contactSheetPath}`,
		`Frame count: ${verdict.timeline.frameCount}`,
		`Sample times: ${verdict.timeline.sampleTimesSec.join(", ")}`,
		`Passed: ${verdict.timeline.passed}`,
	];
	if (verdict.export) {
		lines.push(
			"",
			"## Export",
			"",
			`Output file: ${verdict.export.outputFile}`,
			`Contact sheet: ${verdict.export.contactSheetPath}`,
			`Frame count: ${verdict.export.frameCount}`,
			`Sample times: ${verdict.export.sampleTimesSec.join(", ")}`,
			`Passed: ${verdict.export.passed}`,
			`Matches timeline preview: ${verdict.export.matchesTimelinePreview}`,
		);
	}
	lines.push("", "## Checks", "");
	for (const check of verdict.checks) {
		lines.push(`- ${check.id}: ${check.status}`);
	}
	lines.push("", "## Issues", "");
	if (verdict.issues.length === 0) {
		lines.push("- None");
	} else {
		for (const issue of verdict.issues) {
			lines.push(
				`- ${issue.checkId}: ${issue.description} (fixed: ${issue.fixed})`,
			);
		}
	}
	lines.push("");
	return lines.join("\n");
}

export async function recordVisualQaVerdict({
	sourceRoot = process.cwd(),
	projectId,
	runId,
	verdictJsonFile,
	confirmationToken,
	confirmationRoot,
}) {
	assertProjectId(projectId);
	assertRunId(runId);
	assertAbsolutePath({
		filePath: verdictJsonFile,
		flagName: "--verdict-json-file",
	});
	await assertCodecutConfirmationToken({
		root: confirmationRoot,
		projectId,
		confirmationToken,
	});
	await assertWorkspaceExists({ sourceRoot, projectId });
	await assertFileExists({
		filePath: verdictJsonFile,
		message: `Visual QA verdict input does not exist: ${verdictJsonFile}`,
	});

	const verdict = JSON.parse(await readFile(verdictJsonFile, "utf8"));
	if (verdict.schemaVersion !== 1) {
		throw new Error("visual QA verdict schemaVersion must be 1");
	}
	if (verdict.projectId !== projectId) {
		throw new Error("visual QA verdict projectId must match --project-id");
	}
	if (verdict.runId !== runId) {
		throw new Error("visual QA verdict runId must match --run-id");
	}
	if (verdict.status !== "pass" && verdict.status !== "fail") {
		throw new Error("visual QA verdict status must be pass or fail");
	}
	if (
		typeof verdict.reviewedAt !== "string" ||
		verdict.reviewedAt.length === 0
	) {
		throw new Error("visual QA verdict reviewedAt is required");
	}
	assertFrameEvidence({ evidence: verdict.timeline, label: "timeline" });
	const checksById = assertVisualQaChecks(verdict.checks);
	assertVisualQaIssues({ verdict, checksById });
	await assertFileExists({
		filePath: verdict.timeline.contactSheetPath,
		message: "timeline contact sheet does not exist",
	});
	if (verdict.export !== undefined && verdict.export !== null) {
		assertFrameEvidence({ evidence: verdict.export, label: "export" });
		assertAbsolutePath({
			filePath: verdict.export.outputFile,
			flagName: "export.outputFile",
		});
		assertBoolean(
			verdict.export.matchesTimelinePreview,
			"export.matchesTimelinePreview must be boolean",
		);
		await assertFileExists({
			filePath: verdict.export.outputFile,
			message: "export output file does not exist",
		});
		await assertFileExists({
			filePath: verdict.export.contactSheetPath,
			message: "export contact sheet does not exist",
		});
	}
	if (verdict.status === "pass") {
		if (!verdict.timeline.passed) {
			throw new Error("pass verdict requires timeline.passed");
		}
		if (
			verdict.export &&
			(!verdict.export.passed || !verdict.export.matchesTimelinePreview)
		) {
			throw new Error("pass verdict requires export QA to pass");
		}
		for (const check of verdict.checks) {
			const allowedTimelineOnlyExportCheck =
				!verdict.export &&
				check.id === "export_matches_timeline_preview" &&
				check.status === "not_applicable";
			if (check.status !== "pass" && !allowedTimelineOnlyExportCheck) {
				throw new Error("pass verdict requires every visual QA check to pass");
			}
		}
	}

	const qaDirectory = visualQaDirectory({ sourceRoot, projectId, runId });
	await mkdir(qaDirectory, { recursive: true });
	const timelineContactSheetPath = join(
		qaDirectory,
		"timeline-contact-sheet.png",
	);
	await copyFileIfDifferent({
		source: verdict.timeline.contactSheetPath,
		destination: timelineContactSheetPath,
	});
	verdict.timeline = {
		...verdict.timeline,
		contactSheetPath: timelineContactSheetPath,
	};
	let exportContactSheetPath;
	if (verdict.export) {
		exportContactSheetPath = join(qaDirectory, "export-contact-sheet.png");
		await copyFileIfDifferent({
			source: verdict.export.contactSheetPath,
			destination: exportContactSheetPath,
		});
		verdict.export = {
			...verdict.export,
			contactSheetPath: exportContactSheetPath,
		};
	}

	const verdictJsonPath = join(qaDirectory, "visual-qa-verdict.json");
	const verdictMarkdownPath = join(qaDirectory, "visual-qa-verdict.md");
	await writeFile(verdictJsonPath, JSON.stringify(verdict, null, 2), "utf8");
	await writeFile(verdictMarkdownPath, buildVisualQaMarkdown(verdict), "utf8");

	return {
		projectId,
		runId,
		status: verdict.status,
		verdictJsonPath,
		verdictMarkdownPath,
		timelineContactSheetPath,
		exportContactSheetPath,
	};
}
