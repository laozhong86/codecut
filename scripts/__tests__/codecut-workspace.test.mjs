import { describe, expect, test } from "bun:test";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	addWorkspaceAssets,
	buildWorkspacePaths,
	extractExportFrames,
	initWorkspace,
	probeWorkspaceAssets,
	recordVisualQaVerdict,
	runCli,
	writeWorkspaceDocument,
} from "../codecut-workspace.mjs";
import {
	createPendingCodecutConfirmation,
	mintCodecutConfirmationToken,
} from "../codecut-confirmation-gate.mjs";

async function makeTempRoot() {
	return mkdtemp(join(tmpdir(), "codecut-workspace-"));
}

async function createWorkspaceConfirmationToken(sourceRoot, projectId) {
	return mintCodecutConfirmationToken({
		root: sourceRoot,
		projectId,
		pendingConfirmationId: createPendingCodecutConfirmation(),
	});
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

const visualQaCheckIds = [
	"first_frame_not_black",
	"title_not_clipped",
	"text_layers_not_overlapping",
	"subject_not_cropped_by_cover",
	"bottom_safe_area_clear",
	"ending_normal",
	"export_matches_timeline_preview",
];

function passingVisualQaChecks() {
	return visualQaCheckIds.map((id) => ({
		id,
		status: "pass",
		evidence: `${id} passed.`,
	}));
}

function passingVisualQaVerdict({
	projectId,
	runId,
	timelineContactSheetPath,
	exportContactSheetPath,
	outputFile,
}) {
	return {
		schemaVersion: 1,
		projectId,
		runId,
		reviewedAt: "2026-06-25T12:00:00.000Z",
		status: "pass",
		timeline: {
			contactSheetPath: timelineContactSheetPath,
			frameCount: 3,
			sampleTimesSec: [0, 1, 2],
			passed: true,
		},
		export: {
			outputFile,
			contactSheetPath: exportContactSheetPath,
			frameCount: 3,
			sampleTimesSec: [0, 1, 2],
			passed: true,
			matchesTimelinePreview: true,
		},
		checks: passingVisualQaChecks(),
		issues: [
			{
				checkId: "title_not_clipped",
				timeSec: 0,
				description: "Top title was clipped before repair.",
				fixed: true,
			},
		],
	};
}

function timelineOnlyVisualQaVerdict({ projectId, runId, timelineContactSheetPath }) {
	return {
		schemaVersion: 1,
		projectId,
		runId,
		reviewedAt: "2026-06-25T12:00:00.000Z",
		status: "pass",
		timeline: {
			contactSheetPath: timelineContactSheetPath,
			frameCount: 3,
			sampleTimesSec: [0, 1, 2],
			passed: true,
		},
		checks: passingVisualQaChecks().map((check) =>
			check.id === "export_matches_timeline_preview"
				? {
						...check,
						status: "not_applicable",
						evidence: "No MP4 export was requested.",
					}
				: check,
		),
		issues: [],
	};
}

describe("Codecut workspace CLI helpers", () => {
	test("builds deterministic project workspace paths under the plugin root", async () => {
		const sourceRoot = await makeTempRoot();

		try {
			const paths = buildWorkspacePaths({
				sourceRoot,
				projectId: "launch-cut-001",
			});

			expect(paths.workspaceRoot).toBe(join(sourceRoot, ".codecut-workspace"));
			expect(paths.projectsRoot).toBe(
				join(sourceRoot, ".codecut-workspace/projects"),
			);
			expect(paths.projectDirectory).toBe(
				join(sourceRoot, ".codecut-workspace/projects/launch-cut-001"),
			);
			expect(() =>
				buildWorkspacePaths({ sourceRoot, projectId: "../bad" }),
			).toThrow("--project-id may contain only letters, numbers, dot, dash, and underscore");
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
		}
	});

	test("initializes the pre-edit workspace folders and planning documents", async () => {
		const sourceRoot = await makeTempRoot();
		const confirmationRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			confirmationRoot,
			"ugc-launch",
		);

		try {
			const result = await initWorkspace({
				sourceRoot,
				projectId: "ugc-launch",
				name: "UGC launch short",
				userMessage: "请剪一个竖屏带货短视频",
				confirmationToken,
				confirmationRoot,
			});

			const expectedDirectories = [
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
				"08-learning",
			];

			for (const directory of expectedDirectories) {
				await expect(
					access(join(result.projectDirectory, directory)),
				).resolves.toBeNull();
			}

			expect(
				await readFile(
					join(result.projectDirectory, "00-brief/user-message.md"),
					"utf8",
				),
			).toContain("请剪一个竖屏带货短视频");
			expect(
				await readFile(
					join(result.projectDirectory, "00-brief/clarification-questions.md"),
					"utf8",
				),
			).toContain("Recommended");
			expect(
				await readFile(
					join(result.projectDirectory, "00-brief/assumptions.md"),
					"utf8",
				),
			).toContain("Draft");
			expect(
				await readFile(
					join(result.projectDirectory, "00-brief/requirement-intake.md"),
					"utf8",
				),
			).toContain("Draft");
			expect(
				await readFile(
					join(result.projectDirectory, "03-content/talking-script.md"),
					"utf8",
				),
			).toContain("Draft");
			expect(
				await readFile(
					join(result.projectDirectory, "08-learning/methodology-proposal.md"),
					"utf8",
				),
			).toContain("Draft");
			expect(
				await readFile(
					join(result.projectDirectory, "08-learning/accepted-updates.md"),
					"utf8",
				),
			).toContain("Draft");
			expect(
				await readFile(
					join(sourceRoot, ".codecut-workspace/user-methodology/profile.md"),
					"utf8",
				),
			).toContain("User Editing Profile");
			expect(
				await readFile(
					join(sourceRoot, ".codecut-workspace/user-methodology/rules.md"),
					"utf8",
				),
			).toContain("User Editing Rules");
			expect(
				await readFile(
					join(sourceRoot, ".codecut-workspace/user-methodology/feedback-log.md"),
					"utf8",
				),
			).toContain("Event log only");
			expect(
				await readJson(
					join(result.projectDirectory, "02-inventory/asset-manifest.json"),
				),
			).toMatchObject({
				version: 1,
				projectId: "ugc-launch",
				assets: [],
			});
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(confirmationRoot, { recursive: true, force: true });
		}
	});

	test("writes requirement intake stage documents into the brief folder", async () => {
		const sourceRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"intake-cut",
		);

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "intake-cut",
				name: "Intake cut",
				userMessage: "剪一个产品视频",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			const intakeResult = await writeWorkspaceDocument({
				sourceRoot,
				projectId: "intake-cut",
				kind: "requirement-intake",
				content: "# Requirement Intake\n\nGate passed.\n",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			const assumptionsResult = await writeWorkspaceDocument({
				sourceRoot,
				projectId: "intake-cut",
				kind: "assumptions",
				content: "# Assumptions\n\nSafe defaults.\n",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			expect(intakeResult.path.endsWith(join("00-brief", "requirement-intake.md"))).toBe(true);
			expect(assumptionsResult.path.endsWith(join("00-brief", "assumptions.md"))).toBe(true);
			expect(await readFile(intakeResult.path, "utf8")).toContain("Gate passed.");
			expect(await readFile(assumptionsResult.path, "utf8")).toContain("Safe defaults.");
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
		}
	});

	test("blocks workspace initialization before widget confirmation", async () => {
		const sourceRoot = await makeTempRoot();

		try {
			await expect(
				initWorkspace({
					sourceRoot,
					projectId: "blocked-cut",
					name: "Blocked cut",
					userMessage: "剪一条视频",
				}),
			).rejects.toThrow("confirmationToken is required");
			await expect(
				access(join(sourceRoot, ".codecut-workspace/projects/blocked-cut")),
			).rejects.toThrow();
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
		}
	});

	test("copies provided assets into category folders and updates the manifest", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"asset-cut",
		);
		const videoPath = join(inputRoot, "source.mp4");
		const audioPath = join(inputRoot, "voice.wav");
		const imagePath = join(inputRoot, "cover.png");
		const documentPath = join(inputRoot, "brief.pdf");
		await writeFile(videoPath, "video");
		await writeFile(audioPath, "audio");
		await writeFile(imagePath, "image");
		await writeFile(documentPath, "document");

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "asset-cut",
				name: "Asset cut",
				userMessage: "剪一条产品短视频",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			const result = await addWorkspaceAssets({
				sourceRoot,
				projectId: "asset-cut",
				files: [videoPath, audioPath, imagePath, documentPath],
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			expect(result.assets.map((asset) => asset.category)).toEqual([
				"video",
				"audio",
				"images",
				"documents",
			]);
			for (const asset of result.assets) {
				await expect(
					access(join(result.projectDirectory, asset.relativePath)),
				).resolves.toBeNull();
				expect(asset.originalPath).toBeTruthy();
				expect(asset.size).toBeGreaterThan(0);
			}

			const manifest = await readJson(
				join(result.projectDirectory, "02-inventory/asset-manifest.json"),
			);
			expect(manifest.assets).toHaveLength(4);
			expect(manifest.assets[0]).toMatchObject({
				fileName: "source.mp4",
				mimeType: "video/mp4",
				category: "video",
				relativePath: "01-assets/video/source.mp4",
			});
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(inputRoot, { recursive: true, force: true });
		}
	});

	test("blocks asset ingest before widget confirmation", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"asset-cut",
		);
		const videoPath = join(inputRoot, "source.mp4");
		await writeFile(videoPath, "video");

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "asset-cut",
				name: "Asset cut",
				userMessage: "剪一条产品短视频",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			await expect(
				addWorkspaceAssets({
					sourceRoot,
					projectId: "asset-cut",
					files: [videoPath],
				}),
			).rejects.toThrow("confirmationToken is required");
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(inputRoot, { recursive: true, force: true });
		}
	});

	test("probes video and audio assets with ffprobe and writes inventory reports", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"probe-cut",
		);
		const videoPath = join(inputRoot, "source.mp4");
		const audioPath = join(inputRoot, "voice.wav");
		await writeFile(videoPath, "video");
		await writeFile(audioPath, "audio");
		const calls = [];

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "probe-cut",
				name: "Probe cut",
				userMessage: "素材先盘点",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			await addWorkspaceAssets({
				sourceRoot,
				projectId: "probe-cut",
				files: [videoPath, audioPath],
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			const result = await probeWorkspaceAssets({
				sourceRoot,
				projectId: "probe-cut",
				confirmationToken,
				confirmationRoot: sourceRoot,
				execFileImpl: async (command, args) => {
					calls.push({ command, args });
					const target = args.at(-1);
					if (target.endsWith(".mp4")) {
						return {
							stdout: JSON.stringify({
								format: { duration: "12.5" },
								streams: [
									{
										codec_type: "video",
										width: 1920,
										height: 1080,
										r_frame_rate: "30/1",
									},
									{ codec_type: "audio", sample_rate: "48000", channels: 2 },
								],
							}),
						};
					}
					return {
						stdout: JSON.stringify({
							format: { duration: "4.2" },
							streams: [
								{ codec_type: "audio", sample_rate: "44100", channels: 1 },
							],
						}),
					};
				},
			});

			expect(calls).toHaveLength(2);
			expect(calls[0].command).toBe("ffprobe");
			expect(result.assets[0].probe).toMatchObject({
				durationSeconds: 12.5,
				video: { width: 1920, height: 1080, frameRate: 30 },
				audio: { sampleRate: 48000, channels: 2 },
			});
			expect(result.assets[1].probe).toMatchObject({
				durationSeconds: 4.2,
				audio: { sampleRate: 44100, channels: 1 },
			});

			const paths = buildWorkspacePaths({ sourceRoot, projectId: "probe-cut" });
			expect(
				await readFile(
					join(paths.projectDirectory, "02-inventory/material-audit.md"),
					"utf8",
				),
			).toContain("source.mp4");
			expect(
				await readJson(
					join(paths.projectDirectory, "02-inventory/ffprobe-report.json"),
				),
			).toMatchObject({
				projectId: "probe-cut",
				assets: [{ fileName: "source.mp4" }, { fileName: "voice.wav" }],
			});
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(inputRoot, { recursive: true, force: true });
		}
	});

	test("extracts exported MP4 frames into the visual QA workspace folder", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"qa-cut",
		);
		const exportFile = join(inputRoot, "final.mp4");
		await writeFile(exportFile, "mp4");
		const calls = [];

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "qa-cut",
				name: "QA cut",
				userMessage: "剪完后要验收",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			const result = await extractExportFrames({
				sourceRoot,
				projectId: "qa-cut",
				runId: "qa-20260625-120000",
				exportFile,
				startTime: 0,
				endTime: 2,
				frameCount: 3,
				confirmationToken,
				confirmationRoot: sourceRoot,
				execFileImpl: async (command, args) => {
					calls.push({ command, args });
					const outputPath = args.at(-1);
					if (typeof outputPath === "string" && outputPath.endsWith(".png")) {
						await writeFile(outputPath, "png");
					}
					return { stdout: "", stderr: "" };
				},
			});

			expect(calls.every((call) => call.command === "ffmpeg")).toBe(true);
			expect(result.frameCount).toBe(3);
			expect(result.sampleTimesSec).toEqual([0, 0.9995, 1.999]);
			expect(result.contactSheetPath).toBe(
				join(
					sourceRoot,
					".codecut-workspace/projects/qa-cut/06-verification/visual-qa/qa-20260625-120000/export-contact-sheet.png",
				),
			);
			expect(await readJson(result.manifestPath)).toMatchObject({
				projectId: "qa-cut",
				runId: "qa-20260625-120000",
				exportFile,
				frameCount: 3,
				sampleTimesSec: [0, 0.9995, 1.999],
			});
			await expect(access(result.contactSheetPath)).resolves.toBeNull();
			await expect(access(result.framePaths[0])).resolves.toBeNull();
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(inputRoot, { recursive: true, force: true });
		}
	});

	test("rejects invalid visual QA export frame inputs", async () => {
		const sourceRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"qa-invalid",
		);

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "qa-invalid",
				name: "QA invalid",
				userMessage: "验收失败路径",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			await expect(
				extractExportFrames({
					sourceRoot,
					projectId: "qa-invalid",
					runId: "../bad",
					exportFile: "/tmp/final.mp4",
					startTime: 0,
					endTime: 2,
					frameCount: 3,
					confirmationToken,
					confirmationRoot: sourceRoot,
				}),
			).rejects.toThrow("runId must be a safe identifier");
			await expect(
				extractExportFrames({
					sourceRoot,
					projectId: "qa-invalid",
					runId: "qa-valid",
					exportFile: "relative.mp4",
					startTime: 0,
					endTime: 2,
					frameCount: 3,
					confirmationToken,
					confirmationRoot: sourceRoot,
				}),
			).rejects.toThrow("--export-file must be an absolute path");
			await expect(
				extractExportFrames({
					sourceRoot,
					projectId: "qa-invalid",
					runId: "qa-valid",
					exportFile: "/tmp/final.mp4",
					startTime: 2,
					endTime: 2,
					frameCount: 3,
					confirmationToken,
					confirmationRoot: sourceRoot,
				}),
			).rejects.toThrow("--end-time must be greater than --start-time");
			await expect(
				extractExportFrames({
					sourceRoot,
					projectId: "qa-invalid",
					runId: "qa-valid",
					exportFile: "/tmp/final.mp4",
					startTime: 0,
					endTime: 2,
					frameCount: 3,
					confirmationRoot: sourceRoot,
				}),
			).rejects.toThrow("confirmationToken is required");
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
		}
	});

	test("records visual QA verdict and copies contact sheets into verification", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"qa-record",
		);
		const timelineContactSheetPath = join(inputRoot, "timeline.png");
		const outputFile = join(inputRoot, "final.mp4");
		await writeFile(timelineContactSheetPath, "timeline");
		await writeFile(outputFile, "mp4");

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "qa-record",
				name: "QA record",
				userMessage: "记录验收",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			const paths = buildWorkspacePaths({
				sourceRoot,
				projectId: "qa-record",
			});
			const visualQaDirectory = join(
				paths.projectDirectory,
				"06-verification/visual-qa/qa-20260625-120000",
			);
			const exportContactSheetPath = join(
				visualQaDirectory,
				"export-contact-sheet.png",
			);
			await mkdir(visualQaDirectory, { recursive: true });
			await writeFile(exportContactSheetPath, "export");
			const verdictPath = join(inputRoot, "verdict.json");
			await writeFile(
				verdictPath,
				JSON.stringify(
					passingVisualQaVerdict({
						projectId: "qa-record",
						runId: "qa-20260625-120000",
						timelineContactSheetPath,
						exportContactSheetPath,
						outputFile,
					}),
				),
			);

			const result = await recordVisualQaVerdict({
				sourceRoot,
				projectId: "qa-record",
				runId: "qa-20260625-120000",
				verdictJsonFile: verdictPath,
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			expect(result.status).toBe("pass");
			expect(result.timelineContactSheetPath).toBe(
				join(visualQaDirectory, "timeline-contact-sheet.png"),
			);
			expect(result.exportContactSheetPath).toBe(exportContactSheetPath);
			expect(await readJson(result.verdictJsonPath)).toMatchObject({
				projectId: "qa-record",
				runId: "qa-20260625-120000",
				status: "pass",
			});
			expect(await readFile(result.verdictMarkdownPath, "utf8")).toContain(
				"Visual QA Verdict",
			);
			await expect(access(result.timelineContactSheetPath)).resolves.toBeNull();
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(inputRoot, { recursive: true, force: true });
		}
	});

	test("records timeline-only visual QA verdict without passing export QA", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"qa-timeline-only",
		);
		const timelineContactSheetPath = join(inputRoot, "timeline.png");
		await writeFile(timelineContactSheetPath, "timeline");

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "qa-timeline-only",
				name: "QA timeline only",
				userMessage: "只交付编辑器项目",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			const verdictPath = join(inputRoot, "timeline-only-verdict.json");
			await writeFile(
				verdictPath,
				JSON.stringify(
					timelineOnlyVisualQaVerdict({
						projectId: "qa-timeline-only",
						runId: "qa-20260625-120000",
						timelineContactSheetPath,
					}),
				),
			);

			const result = await recordVisualQaVerdict({
				sourceRoot,
				projectId: "qa-timeline-only",
				runId: "qa-20260625-120000",
				verdictJsonFile: verdictPath,
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			const recorded = await readJson(result.verdictJsonPath);

			expect(result.status).toBe("pass");
			expect(result.exportContactSheetPath).toBeUndefined();
			expect(recorded.export).toBeUndefined();
			expect(
				recorded.checks.find(
					(check) => check.id === "export_matches_timeline_preview",
				),
			).toMatchObject({ status: "not_applicable" });
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(inputRoot, { recursive: true, force: true });
		}
	});

	test("rejects visual QA verdicts with missing checks or export evidence", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"qa-reject",
		);
		const timelineContactSheetPath = join(inputRoot, "timeline.png");
		const outputFile = join(inputRoot, "final.mp4");
		await writeFile(timelineContactSheetPath, "timeline");
		await writeFile(outputFile, "mp4");

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "qa-reject",
				name: "QA reject",
				userMessage: "拒绝坏验收",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			const missingCheckPath = join(inputRoot, "missing-check.json");
			const missingExportPath = join(inputRoot, "missing-export.json");
			const unresolvedIssuePath = join(inputRoot, "unresolved-issue.json");
			const base = passingVisualQaVerdict({
				projectId: "qa-reject",
				runId: "qa-20260625-120000",
				timelineContactSheetPath,
				exportContactSheetPath: join(inputRoot, "missing-export.png"),
				outputFile,
			});
			await writeFile(
				missingCheckPath,
				JSON.stringify({
					...base,
					checks: base.checks.filter((check) => check.id !== "ending_normal"),
				}),
			);
			await writeFile(missingExportPath, JSON.stringify(base));
			await writeFile(
				unresolvedIssuePath,
				JSON.stringify({
					...base,
					status: "pass",
					issues: [
						{
							checkId: "title_not_clipped",
							timeSec: 0,
							description: "Top title is still clipped.",
							fixed: false,
						},
					],
				}),
			);

			await expect(
				recordVisualQaVerdict({
					sourceRoot,
					projectId: "qa-reject",
					runId: "qa-20260625-120000",
					verdictJsonFile: missingCheckPath,
					confirmationToken,
					confirmationRoot: sourceRoot,
				}),
			).rejects.toThrow("visual QA verdict is missing required check");
			await expect(
				recordVisualQaVerdict({
					sourceRoot,
					projectId: "qa-reject",
					runId: "qa-20260625-120000",
					verdictJsonFile: missingExportPath,
					confirmationToken,
					confirmationRoot: sourceRoot,
				}),
			).rejects.toThrow("export contact sheet does not exist");
			await expect(
				recordVisualQaVerdict({
					sourceRoot,
					projectId: "qa-reject",
					runId: "qa-20260625-120000",
					verdictJsonFile: unresolvedIssuePath,
					confirmationToken,
					confirmationRoot: sourceRoot,
				}),
			).rejects.toThrow("pass verdict cannot include unresolved issues");
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
			await rm(inputRoot, { recursive: true, force: true });
		}
	});

	test("writes named planning documents into the workspace", async () => {
		const sourceRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"script-cut",
		);

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "script-cut",
				name: "Script cut",
				userMessage: "需要口播脚本",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			const result = await writeWorkspaceDocument({
				sourceRoot,
				projectId: "script-cut",
				kind: "talking-script",
				content: "第一句先说结果。",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			expect(result.path.endsWith(join("03-content", "talking-script.md"))).toBe(
				true,
			);
			expect(await readFile(result.path, "utf8")).toContain("第一句先说结果。");
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
		}
	});

	test("writes methodology learning documents into the private project workspace", async () => {
		const sourceRoot = await makeTempRoot();
		const confirmationToken = await createWorkspaceConfirmationToken(
			sourceRoot,
			"learning-cut",
		);

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "learning-cut",
				name: "Learning cut",
				userMessage: "剪完后沉淀偏好",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			const proposalResult = await writeWorkspaceDocument({
				sourceRoot,
				projectId: "learning-cut",
				kind: "methodology-proposal",
				content: "# Methodology Proposal\n\nSuggested rule.\n",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});
			const acceptedResult = await writeWorkspaceDocument({
				sourceRoot,
				projectId: "learning-cut",
				kind: "methodology-accepted-updates",
				content: "# Accepted Updates\n\nUser confirmed.\n",
				confirmationToken,
				confirmationRoot: sourceRoot,
			});

			expect(
				proposalResult.path.endsWith(
					join("08-learning", "methodology-proposal.md"),
				),
			).toBe(true);
			expect(
				acceptedResult.path.endsWith(
					join("08-learning", "accepted-updates.md"),
				),
			).toBe(true);
			expect(await readFile(proposalResult.path, "utf8")).toContain(
				"Suggested rule.",
			);
			expect(await readFile(acceptedResult.path, "utf8")).toContain(
				"User confirmed.",
			);
		} finally {
			await rm(sourceRoot, { recursive: true, force: true });
		}
	});

	test("prints CLI usage", async () => {
		const output = [];
		const exitCode = await runCli({
			argv: ["help"],
			stdout: (value) => output.push(value),
		});

		expect(exitCode).toBe(0);
		expect(output.join("\n")).toContain(
			"node scripts/codecut-workspace.mjs init",
		);
	});
});
