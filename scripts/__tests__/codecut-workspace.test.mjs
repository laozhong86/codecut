import { describe, expect, test } from "bun:test";
import {
	access,
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
	initWorkspace,
	probeWorkspaceAssets,
	runCli,
	writeWorkspaceDocument,
} from "../codecut-workspace.mjs";

async function makeTempRoot() {
	return mkdtemp(join(tmpdir(), "codecut-workspace-"));
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
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

		try {
			const result = await initWorkspace({
				sourceRoot,
				projectId: "ugc-launch",
				name: "UGC launch short",
				userMessage: "请剪一个竖屏带货短视频",
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
					join(result.projectDirectory, "03-content/talking-script.md"),
					"utf8",
				),
			).toContain("Draft");
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
		}
	});

	test("copies provided assets into category folders and updates the manifest", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
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
			});

			const result = await addWorkspaceAssets({
				sourceRoot,
				projectId: "asset-cut",
				files: [videoPath, audioPath, imagePath, documentPath],
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

	test("probes video and audio assets with ffprobe and writes inventory reports", async () => {
		const sourceRoot = await makeTempRoot();
		const inputRoot = await makeTempRoot();
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
			});
			await addWorkspaceAssets({
				sourceRoot,
				projectId: "probe-cut",
				files: [videoPath, audioPath],
			});

			const result = await probeWorkspaceAssets({
				sourceRoot,
				projectId: "probe-cut",
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

	test("writes named planning documents into the workspace", async () => {
		const sourceRoot = await makeTempRoot();

		try {
			await initWorkspace({
				sourceRoot,
				projectId: "script-cut",
				name: "Script cut",
				userMessage: "需要口播脚本",
			});
			const result = await writeWorkspaceDocument({
				sourceRoot,
				projectId: "script-cut",
				kind: "talking-script",
				content: "第一句先说结果。",
			});

			expect(result.path.endsWith("03-content/talking-script.md")).toBe(true);
			expect(await readFile(result.path, "utf8")).toContain("第一句先说结果。");
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
