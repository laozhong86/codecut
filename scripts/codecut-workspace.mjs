#!/usr/bin/env node

import { execFile } from "node:child_process";
import {
	access,
	copyFile,
	mkdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import {
	basename,
	extname,
	isAbsolute,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { assertCodecutConfirmationToken } from "./codecut-confirmation-gate.mjs";
import {
	extractExportFrames,
	recordVisualQaVerdict,
} from "./codecut-visual-qa.mjs";

export {
	extractExportFrames,
	recordVisualQaVerdict,
} from "./codecut-visual-qa.mjs";

const execFileAsync = promisify(execFile);
const WORKSPACE_ROOT = ".codecut-workspace";
const PROJECT_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

const workspaceDirectories = [
	"00-brief",
	"01-assets/original",
	"01-assets/video",
	"01-assets/audio",
	"01-assets/images",
	"01-assets/brand",
	"01-assets/references",
	"01-assets/documents",
	"02-inventory/contact-sheets",
	"03-content/transcript",
	"04-planning",
	"05-execution",
	"06-verification",
	"07-exports",
];

const documentPaths = new Map([
	["user-message", "00-brief/user-message.md"],
	["intent-analysis", "00-brief/intent-analysis.md"],
	["clarification-questions", "00-brief/clarification-questions.md"],
	["clarification-answers", "00-brief/clarification-answers.md"],
	["assumptions", "00-brief/assumptions.md"],
	["requirement-intake", "00-brief/requirement-intake.md"],
	["content-breakdown", "03-content/content-breakdown.md"],
	["hook-selection", "03-content/hook-selection.md"],
	["voiceover-script", "03-content/voiceover-script.md"],
	["talking-script", "03-content/talking-script.md"],
	["material-audit", "02-inventory/material-audit.md"],
	["workflow-route", "04-planning/workflow-route.md"],
	["editing-decision-ledger", "04-planning/editing-decision-ledger.md"],
	["timeline-restructure", "04-planning/timeline-restructure.md"],
	["edit-plan-notes", "04-planning/edit-plan-notes.md"],
]);

const extensionMimeTypes = new Map([
	[".jpg", "image/jpeg"],
	[".jpeg", "image/jpeg"],
	[".png", "image/png"],
	[".webp", "image/webp"],
	[".gif", "image/gif"],
	[".heic", "image/heic"],
	[".svg", "image/svg+xml"],
	[".mp4", "video/mp4"],
	[".m4v", "video/mp4"],
	[".mov", "video/quicktime"],
	[".webm", "video/webm"],
	[".mkv", "video/x-matroska"],
	[".mp3", "audio/mpeg"],
	[".wav", "audio/wav"],
	[".m4a", "audio/mp4"],
	[".aac", "audio/aac"],
	[".ogg", "audio/ogg"],
	[".flac", "audio/flac"],
	[".pdf", "application/pdf"],
	[".txt", "text/plain"],
	[".md", "text/markdown"],
	[".json", "application/json"],
	[".csv", "text/csv"],
	[".doc", "application/msword"],
	[
		".docx",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	],
	[
		".pptx",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	],
	[
		".xlsx",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	],
]);

function nowIso() {
	return new Date().toISOString();
}

function usage() {
	return [
		"Usage:",
		"  node scripts/codecut-workspace.mjs init --project-id <id> --name <name> --user-message <text> --confirmation-token <token>",
		"  node scripts/codecut-workspace.mjs add-assets --project-id <id> --file /absolute/path/source.mp4 [--file /absolute/path/brief.pdf] --confirmation-token <token>",
		"  node scripts/codecut-workspace.mjs probe-assets --project-id <id> --confirmation-token <token>",
		"  node scripts/codecut-workspace.mjs write-doc --project-id <id> --kind <kind> --content-file /absolute/path/doc.md --confirmation-token <token>",
		"  node scripts/codecut-workspace.mjs extract-export-frames --project-id <id> --run-id <id> --export-file /absolute/path/final.mp4 --start-time <seconds> --end-time <seconds> --frame-count <1..16> --confirmation-token <token>",
		"  node scripts/codecut-workspace.mjs record-visual-qa --project-id <id> --run-id <id> --verdict-json-file /absolute/path/visual-qa-verdict.json --confirmation-token <token>",
		"",
		"Optional:",
		"  --source-root <path>  Defaults to the current plugin root.",
		"",
		"Workspace root:",
		"  .codecut-workspace/projects/<projectId>",
	].join("\n");
}

function parseFlags(argv) {
	const flags = {};
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
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

		if (key === "file") {
			flags.files ??= [];
			flags.files.push(value);
		} else {
			if (Object.hasOwn(flags, key)) {
				throw new Error(`Duplicate flag: ${entry}`);
			}
			flags[key] = value;
		}
		index += 1;
	}
	return flags;
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

function toWorkspaceRelative(projectDirectory, path) {
	return relative(projectDirectory, path).split(sep).join("/");
}

async function pathExists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

function mimeTypeForFilePath(filePath) {
	const extension = extname(filePath).toLowerCase();
	const mimeType = extensionMimeTypes.get(extension);
	if (!mimeType) {
		throw new Error(`Unsupported asset file type: ${filePath}`);
	}
	return mimeType;
}

function categoryForMimeType(mimeType) {
	if (mimeType.startsWith("video/")) return "video";
	if (mimeType.startsWith("audio/")) return "audio";
	if (mimeType.startsWith("image/")) return "images";
	return "documents";
}

function defaultDocumentContent({ kind, projectId, name, userMessage }) {
	const heading = kind
		.split("-")
		.map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
		.join(" ");
	if (kind === "user-message") {
		return `# User Message\n\nProject: ${name}\nProject ID: ${projectId}\n\n${userMessage}\n`;
	}
	if (kind === "clarification-questions") {
		return [
			"# Clarification Questions",
			"",
			"1. 发布平台 / Publish platform",
			"   A. TikTok/Reels/Shorts (Recommended) - short-form reach and 9:16 delivery.",
			"   B. YouTube horizontal - longer horizontal viewing.",
			"   C. Xiaohongshu/lifestyle - softer lifestyle pacing.",
			"   D. Other/custom - specify platform and constraints.",
			"",
			"2. 画幅 / Aspect ratio",
			"   A. Vertical 9:16 (Recommended) - safest for short-form platforms.",
			"   B. Horizontal 16:9 - preserve source composition.",
			"   C. Square 1:1 - feed-safe layout.",
			"   D. Other/custom - specify width and height.",
			"",
			"3. 时长范围 / Duration range",
			"   A. 30-60s (Recommended) - enough time for hook, proof, and CTA.",
			"   B. 15-30s - faster hook and fewer proof beats.",
			"   C. 60-90s - more explanation and slower pacing.",
			"   D. Other/custom - specify target duration.",
			"",
			"4. 视频类型 / Video type",
			"   A. UGC proof/product ad (Recommended) - conversion-oriented structure.",
			"   B. Tutorial/demo - clear step-by-step explanation.",
			"   C. Talking-head - speech-led clarity and pacing.",
			"   D. Other/custom - describe the content type.",
			"",
			"5. 剪辑风格 / Editing style",
			"   A. Fast-cut creator-native (Recommended) - stronger short-form retention.",
			"   B. Clean tutorial - calmer and more instructional.",
			"   C. Cinematic premium - slower brand feel.",
			"   D. Other/custom - provide a reference or description.",
			"",
			"6. 字幕策略 / Caption policy",
			"   A. Post-cut captions from edited audio (Recommended) - keeps captions aligned after cuts.",
			"   B. Source transcript remap - faster when transcript is reliable.",
			"   C. No captions - clean visual-only output.",
			"   D. Other/custom - describe language and style.",
			"",
		].join("\n");
	}
	return `# ${heading}\n\nProject: ${name}\nProject ID: ${projectId}\n\nDraft:\n\n`;
}

export function buildWorkspacePaths({ sourceRoot = process.cwd(), projectId }) {
	assertProjectId(projectId);
	const resolvedSourceRoot = resolve(sourceRoot);
	const workspaceRoot = join(resolvedSourceRoot, WORKSPACE_ROOT);
	const projectsRoot = join(workspaceRoot, "projects");
	const projectDirectory = join(projectsRoot, projectId);
	return {
		sourceRoot: resolvedSourceRoot,
		workspaceRoot,
		projectsRoot,
		projectDirectory,
		workspaceFile: join(projectDirectory, "workspace.json"),
		manifestFile: join(projectDirectory, "02-inventory/asset-manifest.json"),
	};
}

export async function initWorkspace({
	sourceRoot = process.cwd(),
	projectId,
	name,
	userMessage,
	confirmationToken,
	confirmationRoot,
}) {
	if (!name) {
		throw new Error("--name is required");
	}
	if (!userMessage) {
		throw new Error("--user-message is required");
	}
	const paths = buildWorkspacePaths({ sourceRoot, projectId });
	await assertCodecutConfirmationToken({
		root: confirmationRoot,
		projectId,
		confirmationToken,
	});
	if (await pathExists(paths.workspaceFile)) {
		throw new Error(`Workspace already exists for project ${projectId}`);
	}

	for (const directory of workspaceDirectories) {
		await mkdir(join(paths.projectDirectory, directory), { recursive: true });
	}

	const createdAt = nowIso();
	const workspace = {
		version: 1,
		projectId,
		name,
		status: "intake",
		createdAt,
		updatedAt: createdAt,
	};
	await writeFile(paths.workspaceFile, JSON.stringify(workspace, null, 2), "utf8");
	await writeFile(
		paths.manifestFile,
		JSON.stringify(
			{ version: 1, projectId, generatedAt: createdAt, updatedAt: createdAt, assets: [] },
			null,
			2,
		),
		"utf8",
	);

	const writtenFiles = [paths.workspaceFile, paths.manifestFile];
	for (const [kind, relativePath] of documentPaths.entries()) {
		const path = join(paths.projectDirectory, relativePath);
		await writeFile(
			path,
			defaultDocumentContent({ kind, projectId, name, userMessage }),
			"utf8",
		);
		writtenFiles.push(path);
	}

	return {
		projectId,
		name,
		projectDirectory: paths.projectDirectory,
		directories: workspaceDirectories.map((directory) =>
			join(paths.projectDirectory, directory),
		),
		files: writtenFiles,
	};
}

async function readWorkspace(paths) {
	if (!(await pathExists(paths.workspaceFile))) {
		throw new Error(
			`Workspace does not exist for project ${basename(paths.projectDirectory)}. Run init first.`,
		);
	}
	return readJson(paths.workspaceFile);
}

async function uniqueDestinationPath(directory, fileName) {
	const extension = extname(fileName);
	const baseName = fileName.slice(0, fileName.length - extension.length);
	let candidate = join(directory, fileName);
	let index = 2;
	while (await pathExists(candidate)) {
		candidate = join(directory, `${baseName}-${index}${extension}`);
		index += 1;
	}
	return candidate;
}

export async function addWorkspaceAssets({
	sourceRoot = process.cwd(),
	projectId,
	files,
	confirmationToken,
	confirmationRoot,
}) {
	if (!Array.isArray(files) || files.length === 0) {
		throw new Error("--file is required at least once");
	}
	const paths = buildWorkspacePaths({ sourceRoot, projectId });
	await assertCodecutConfirmationToken({
		root: confirmationRoot,
		projectId,
		confirmationToken,
	});
	await readWorkspace(paths);
	const manifest = await readJson(paths.manifestFile);
	const addedAssets = [];

	for (const filePath of files) {
		if (!isAbsolute(filePath)) {
			throw new Error(`--file must be an absolute path: ${filePath}`);
		}
		const fileStat = await stat(filePath);
		if (!fileStat.isFile()) {
			throw new Error(`--file must point to a regular file: ${filePath}`);
		}
		const mimeType = mimeTypeForFilePath(filePath);
		const category = categoryForMimeType(mimeType);
		const destinationDirectory = join(
			paths.projectDirectory,
			"01-assets",
			category,
		);
		await mkdir(destinationDirectory, { recursive: true });
		const destinationPath = await uniqueDestinationPath(
			destinationDirectory,
			basename(filePath),
		);
		await copyFile(filePath, destinationPath);

		const asset = {
			id: `asset-${String(manifest.assets.length + addedAssets.length + 1).padStart(3, "0")}`,
			fileName: basename(destinationPath),
			originalPath: filePath,
			relativePath: toWorkspaceRelative(paths.projectDirectory, destinationPath),
			category,
			mimeType,
			size: fileStat.size,
			lastModified: fileStat.mtimeMs,
			addedAt: nowIso(),
		};
		addedAssets.push(asset);
	}

	manifest.assets = [...manifest.assets, ...addedAssets];
	manifest.updatedAt = nowIso();
	await writeFile(paths.manifestFile, JSON.stringify(manifest, null, 2), "utf8");

	return {
		projectId,
		projectDirectory: paths.projectDirectory,
		assets: addedAssets,
		manifestPath: paths.manifestFile,
	};
}

function parseFrameRate(value) {
	if (typeof value !== "string") return undefined;
	if (value.includes("/")) {
		const [numerator, denominator] = value.split("/").map(Number);
		if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
			return undefined;
		}
		return numerator / denominator;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseProbePayload(payload) {
	const durationSeconds = Number(payload?.format?.duration);
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("ffprobe could not read a positive media duration");
	}
	const streams = Array.isArray(payload?.streams) ? payload.streams : [];
	const videoStream = streams.find(
		(stream) =>
			stream.codec_type === "video" ||
			(Number.isFinite(Number(stream.width)) &&
				Number.isFinite(Number(stream.height))),
	);
	const audioStream = streams.find(
		(stream) =>
			stream.codec_type === "audio" ||
			Number.isFinite(Number(stream.sample_rate)) ||
			Number.isFinite(Number(stream.channels)),
	);
	const frameRate = parseFrameRate(videoStream?.r_frame_rate);
	return {
		durationSeconds,
		...(videoStream
			? {
					video: {
						width: Number(videoStream.width),
						height: Number(videoStream.height),
						...(frameRate ? { frameRate } : {}),
					},
				}
			: {}),
		...(audioStream
			? {
					audio: {
						...(Number.isFinite(Number(audioStream.sample_rate))
							? { sampleRate: Number(audioStream.sample_rate) }
							: {}),
						...(Number.isFinite(Number(audioStream.channels))
							? { channels: Number(audioStream.channels) }
							: {}),
					},
				}
			: {}),
	};
}

async function probeAsset({ asset, projectDirectory, execFileImpl }) {
	const targetPath = join(projectDirectory, asset.relativePath);
	try {
		const { stdout } = await execFileImpl("ffprobe", [
			"-v",
			"error",
			"-print_format",
			"json",
			"-show_format",
			"-show_streams",
			targetPath,
		]);
		return parseProbePayload(JSON.parse(String(stdout)));
	} catch (error) {
		throw new Error(
			`ffprobe failed for ${asset.fileName}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

function buildMaterialAuditMarkdown({ projectId, assets }) {
	const lines = [
		"# Material Audit",
		"",
		`Project ID: ${projectId}`,
		"",
		"| Asset | Category | Duration | Video | Audio | Notes |",
		"| --- | --- | ---: | --- | --- | --- |",
	];
	for (const asset of assets) {
		const probe = asset.probe;
		const duration = probe?.durationSeconds
			? `${probe.durationSeconds.toFixed(2)}s`
			: "-";
		const video = probe?.video
			? `${probe.video.width}x${probe.video.height}${probe.video.frameRate ? ` @ ${probe.video.frameRate.toFixed(2)}fps` : ""}`
			: "-";
		const audio = probe?.audio
			? [
					probe.audio.sampleRate ? `${probe.audio.sampleRate}Hz` : null,
					probe.audio.channels ? `${probe.audio.channels}ch` : null,
				]
					.filter(Boolean)
					.join(" / ")
			: "-";
		const notes =
			asset.category === "video" || asset.category === "audio"
				? "ffprobe checked"
				: "metadata only";
		lines.push(
			`| ${asset.fileName} | ${asset.category} | ${duration} | ${video} | ${audio} | ${notes} |`,
		);
	}
	lines.push("");
	return lines.join("\n");
}

export async function probeWorkspaceAssets({
	sourceRoot = process.cwd(),
	projectId,
	confirmationToken,
	confirmationRoot,
	execFileImpl = execFileAsync,
}) {
	const paths = buildWorkspacePaths({ sourceRoot, projectId });
	await assertCodecutConfirmationToken({
		root: confirmationRoot,
		projectId,
		confirmationToken,
	});
	await readWorkspace(paths);
	const manifest = await readJson(paths.manifestFile);
	const probedAssets = [];
	const assets = [];

	for (const asset of manifest.assets) {
		if (asset.category === "video" || asset.category === "audio") {
			const probe = await probeAsset({
				asset,
				projectDirectory: paths.projectDirectory,
				execFileImpl,
			});
			const updatedAsset = {
				...asset,
				probe,
				probedAt: nowIso(),
			};
			assets.push(updatedAsset);
			probedAssets.push(updatedAsset);
		} else {
			assets.push(asset);
		}
	}

	const updatedManifest = {
		...manifest,
		updatedAt: nowIso(),
		assets,
	};
	await writeFile(
		paths.manifestFile,
		JSON.stringify(updatedManifest, null, 2),
		"utf8",
	);

	const report = {
		version: 1,
		projectId,
		generatedAt: nowIso(),
		assets: probedAssets.map((asset) => ({
			id: asset.id,
			fileName: asset.fileName,
			relativePath: asset.relativePath,
			category: asset.category,
			mimeType: asset.mimeType,
			probe: asset.probe,
		})),
	};
	const reportPath = join(paths.projectDirectory, "02-inventory/ffprobe-report.json");
	const materialAuditPath = join(
		paths.projectDirectory,
		"02-inventory/material-audit.md",
	);
	await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
	await writeFile(
		materialAuditPath,
		buildMaterialAuditMarkdown({ projectId, assets }),
		"utf8",
	);

	return {
		projectId,
		projectDirectory: paths.projectDirectory,
		reportPath,
		materialAuditPath,
		assets: probedAssets,
	};
}

export async function writeWorkspaceDocument({
	sourceRoot = process.cwd(),
	projectId,
	kind,
	content,
	confirmationToken,
	confirmationRoot,
}) {
	if (!documentPaths.has(kind)) {
		throw new Error(
			`--kind must be one of: ${Array.from(documentPaths.keys()).join(", ")}`,
		);
	}
	if (typeof content !== "string" || content.length === 0) {
		throw new Error("--content-file must contain text");
	}
	const paths = buildWorkspacePaths({ sourceRoot, projectId });
	await assertCodecutConfirmationToken({
		root: confirmationRoot,
		projectId,
		confirmationToken,
	});
	await readWorkspace(paths);
	const path = join(paths.projectDirectory, documentPaths.get(kind));
	await writeFile(path, content, "utf8");
	return { projectId, kind, path };
}

export async function runCli({
	argv,
	stdout = (value) => process.stdout.write(`${value}\n`),
	sourceRoot = process.cwd(),
	execFileImpl = execFileAsync,
}) {
	const [command, ...rest] = argv;
	if (!command || command === "help" || command === "--help") {
		stdout(usage());
		return 0;
	}

	const flags = parseFlags(rest);
	const resolvedSourceRoot = flags.sourceRoot
		? resolve(flags.sourceRoot)
		: sourceRoot;

	if (command === "init") {
		const result = await initWorkspace({
			sourceRoot: resolvedSourceRoot,
			projectId: flags.projectId,
			name: flags.name,
			userMessage: flags.userMessage,
			confirmationToken: flags.confirmationToken,
		});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	}
	if (command === "add-assets") {
		const result = await addWorkspaceAssets({
			sourceRoot: resolvedSourceRoot,
			projectId: flags.projectId,
			files: flags.files,
			confirmationToken: flags.confirmationToken,
		});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	}
	if (command === "probe-assets") {
		const result = await probeWorkspaceAssets({
			sourceRoot: resolvedSourceRoot,
			projectId: flags.projectId,
			confirmationToken: flags.confirmationToken,
			execFileImpl,
		});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	}
	if (command === "write-doc") {
		if (!flags.contentFile) {
			throw new Error("--content-file is required");
		}
		if (!isAbsolute(flags.contentFile)) {
			throw new Error("--content-file must be an absolute path");
		}
		const result = await writeWorkspaceDocument({
			sourceRoot: resolvedSourceRoot,
				projectId: flags.projectId,
				kind: flags.kind,
				content: await readFile(flags.contentFile, "utf8"),
				confirmationToken: flags.confirmationToken,
			});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	}
	if (command === "extract-export-frames") {
		const result = await extractExportFrames({
			sourceRoot: resolvedSourceRoot,
			projectId: flags.projectId,
			runId: flags.runId,
			exportFile: flags.exportFile,
			startTime: Number(flags.startTime),
			endTime: Number(flags.endTime),
			frameCount: Number(flags.frameCount),
			confirmationToken: flags.confirmationToken,
			execFileImpl,
		});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	}
	if (command === "record-visual-qa") {
		if (!flags.verdictJsonFile) {
			throw new Error("--verdict-json-file is required");
		}
		if (!isAbsolute(flags.verdictJsonFile)) {
			throw new Error("--verdict-json-file must be an absolute path");
		}
		const result = await recordVisualQaVerdict({
			sourceRoot: resolvedSourceRoot,
			projectId: flags.projectId,
			runId: flags.runId,
			verdictJsonFile: flags.verdictJsonFile,
			confirmationToken: flags.confirmationToken,
		});
		stdout(JSON.stringify(result, null, 2));
		return 0;
	}

	throw new Error(`Unknown command: ${command}`);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	runCli({ argv: process.argv.slice(2) })
		.then((exitCode) => {
			process.exitCode = exitCode;
		})
		.catch((error) => {
			console.error(error instanceof Error ? error.message : error);
			console.error(usage());
			process.exitCode = 1;
		});
}
