import { describe, expect, test } from "bun:test";

import {
	CODECUT_MCP_TOOLS,
	buildBridgeCliArgs,
	normalizeCliResult,
} from "./server.mjs";

describe("Codecut MCP server contract", () => {
	test("exposes only the stable Codecut editing primitives", () => {
		expect(CODECUT_MCP_TOOLS.map((tool) => tool.name)).toEqual([
			"get_project_info",
			"list_media_assets",
			"import_media",
			"transcribe_media",
			"build_video_context",
			"inspect_video_range",
			"build_post_cut_captions",
			"validate_edit_plan",
			"preview_edit_plan",
			"apply_edit_plan",
			"apply_narrated_remix_plan",
			"create_text_background_effect",
			"create_human_pip_effect",
			"generate_digital_human",
			"verify_timeline",
			"export_project",
			"get_timeline_state",
		]);
	});

	test("maps read primitives to explicit codex-bridge send commands", () => {
		expect(
			buildBridgeCliArgs("get_project_info", { projectId: "project-1" }),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"get_project_info",
			"--args-json",
			"{}",
		]);

		expect(
			buildBridgeCliArgs("list_media_assets", { projectId: "project-1" }),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"list_media_assets",
			"--args-json",
			"{}",
		]);

		expect(
			buildBridgeCliArgs("get_timeline_state", { projectId: "project-1" }),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"get_timeline_state",
			"--args-json",
			"{}",
		]);
	});

	test("maps write primitives to narrow codex-bridge commands", () => {
		expect(
			buildBridgeCliArgs("import_media", {
				projectId: "project-1",
				filePath: "/tmp/source.mp4",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"import-media",
			"--project-id",
			"project-1",
			"--file-path",
			"/tmp/source.mp4",
		]);

		expect(
			buildBridgeCliArgs("apply_edit_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/edit-plan.json",
				replaceExisting: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"apply-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/edit-plan.json",
			"--replace-existing",
			"true",
		]);

		expect(
			buildBridgeCliArgs("apply_narrated_remix_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/remix-plan.json",
				replaceExisting: false,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"apply-narrated-remix-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/remix-plan.json",
			"--replace-existing",
			"false",
		]);
	});

	test("maps executor analysis and generation tools to codex-bridge commands", () => {
		expect(
			buildBridgeCliArgs("transcribe_media", {
				projectId: "project-1",
				mediaId: "media-1",
				language: "auto",
				modelId: "whisper-base",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"transcribe",
			"--project-id",
			"project-1",
			"--media-id",
			"media-1",
			"--language",
			"auto",
			"--model-id",
			"whisper-base",
		]);
		expect(
			buildBridgeCliArgs("build_video_context", {
				projectId: "project-1",
				mediaId: "media-1",
				language: "auto",
				modelId: "whisper-base",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"build-video-context",
			"--project-id",
			"project-1",
			"--media-id",
			"media-1",
			"--language",
			"auto",
			"--model-id",
			"whisper-base",
		]);
		expect(
			buildBridgeCliArgs("inspect_video_range", {
				projectId: "project-1",
				mediaId: "media-1",
				startSeconds: 1,
				endSeconds: 3,
				frameCount: 4,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"inspect-video-range",
			"--project-id",
			"project-1",
			"--media-id",
			"media-1",
			"--start-seconds",
			"1",
			"--end-seconds",
			"3",
			"--frame-count",
			"4",
		]);
		expect(
			buildBridgeCliArgs("build_post_cut_captions", {
				projectId: "project-1",
				language: "zh",
				modelId: "whisper-base",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"build-post-cut-captions",
			"--project-id",
			"project-1",
			"--language",
			"zh",
			"--model-id",
			"whisper-base",
		]);
		expect(
			buildBridgeCliArgs("generate_digital_human", {
				projectId: "project-1",
				imageMediaId: "image-1",
				audioMediaId: "audio-1",
				scriptText: "hello",
				motionPrompt: "natural talking",
				width: 1280,
				height: 720,
				fps: 25,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"generate-digital-human",
			"--project-id",
			"project-1",
			"--image-media-id",
			"image-1",
			"--audio-media-id",
			"audio-1",
			"--script-text",
			"hello",
			"--motion-prompt",
			"natural talking",
			"--width",
			"1280",
			"--height",
			"720",
			"--fps",
			"25",
		]);
	});

	test("maps validation verification effect and export tools without business logic", () => {
		expect(
			buildBridgeCliArgs("validate_edit_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/edit-plan.json",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"validate-edit-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/edit-plan.json",
		]);
		expect(
			buildBridgeCliArgs("preview_edit_plan", {
				projectId: "project-1",
				planJsonFile: "/tmp/edit-plan.json",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"preview-edit-plan",
			"--project-id",
			"project-1",
			"--plan-json-file",
			"/tmp/edit-plan.json",
		]);
		expect(
			buildBridgeCliArgs("verify_timeline", {
				projectId: "project-1",
				verificationJsonFile: "/tmp/verification.json",
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"verify-timeline",
			"--project-id",
			"project-1",
			"--verification-json-file",
			"/tmp/verification.json",
		]);
		expect(
			buildBridgeCliArgs("create_text_background_effect", {
				projectId: "project-1",
				sourceMediaId: "media-1",
				derivedAssetId: "mask-1",
				content: "Hook",
				startTime: 0,
				duration: 5,
				replaceExisting: true,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"send",
			"--project-id",
			"project-1",
			"--tool",
			"create_text_background_effect",
			"--args-json",
			JSON.stringify({
				sourceMediaId: "media-1",
				derivedAssetId: "mask-1",
				content: "Hook",
				startTime: 0,
				duration: 5,
				replaceExisting: true,
			}),
		]);
		expect(
			buildBridgeCliArgs("export_project", {
				projectId: "project-1",
				format: "mp4",
				quality: "high",
				includeAudio: true,
				outputFile: "/tmp/out.mp4",
				overwrite: false,
			}),
		).toEqual([
			"scripts/codex-bridge.mjs",
			"export",
			"--project-id",
			"project-1",
			"--format",
			"mp4",
			"--quality",
			"high",
			"--include-audio",
			"true",
			"--output-file",
			"/tmp/out.mp4",
			"--overwrite",
			"false",
		]);
	});

	test("rejects unknown tools instead of forwarding arbitrary bridge commands", () => {
		expect(() =>
			buildBridgeCliArgs("add_video_to_timeline", { projectId: "project-1" }),
		).toThrow("Unsupported Codecut MCP tool: add_video_to_timeline");
	});

	test("returns parsed JSON as structured content when CLI stdout is JSON", () => {
		const result = normalizeCliResult({
			toolName: "get_project_info",
			stdout: '{"projectId":"project-1","ok":true}',
			stderr: "",
		});

		expect(result.structuredContent).toEqual({
			projectId: "project-1",
			ok: true,
		});
		expect(result.content[0].text).toContain("get_project_info completed");
	});

	test("keeps non-JSON CLI stdout visible to the model", () => {
		const result = normalizeCliResult({
			toolName: "get_timeline_state",
			stdout: "timeline ready",
			stderr: "",
		});

		expect(result.structuredContent).toEqual({ stdout: "timeline ready" });
		expect(result.content[0].text).toContain("timeline ready");
	});

	test("wraps non-object JSON stdout so structured content stays object-shaped", () => {
		const result = normalizeCliResult({
			toolName: "list_media_assets",
			stdout: '["media-1"]',
			stderr: "",
		});

		expect(result.structuredContent).toEqual({ stdout: '["media-1"]' });
	});
});
