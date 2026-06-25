import { beforeEach, describe, expect, test } from "bun:test";
import { EditorCore } from "@/core";
import { buildDefaultScene } from "@/lib/scenes";
import { createLocalTemplateScript } from "@/lib/template-scripts";
import { buildSystemPrompt } from "../system-prompt";

function initializePromptProject() {
	const editor = EditorCore.getInstance();
	const now = new Date("2026-06-21T00:00:00.000Z");
	const scene = buildDefaultScene({ name: "Main scene", isMain: true });

	editor.scenes.initializeScenes({
		scenes: [scene],
		currentSceneId: scene.id,
	});
	editor.project.setActiveProject({
		project: {
			metadata: {
				id: "project-1",
				name: "Project",
				duration: 0,
				createdAt: now,
				updatedAt: now,
			},
			scenes: [scene],
			currentSceneId: scene.id,
			settings: {
				fps: 30,
				canvasSize: { width: 1080, height: 1920 },
				originalCanvasSize: null,
				background: { type: "color", color: "#000000" },
			},
			version: 5,
			derivedAssets: [],
		},
	});
}

describe("buildSystemPrompt", () => {
	beforeEach(() => {
		EditorCore.reset();
	});

	test("exposes the P0 video template planning contract", () => {
		initializePromptProject();

		const prompt = buildSystemPrompt();

		expect(prompt).toContain("P0 Video Template Contract");
		expect(prompt).toContain("talking-head-short");
		expect(prompt).toContain("tutorial-demo");
		expect(prompt).toContain("product-proof-ad");
		expect(prompt).toContain("narrated-broll");
		expect(prompt).toContain("Templates are planning constraints");
		expect(prompt).toContain("does not support TTS");
		expect(prompt).toContain("BGM");
		expect(prompt).toContain("SFX");
		expect(prompt).toContain("video or image B-roll");
		expect(prompt).toContain("independent timed text elements");
		expect(prompt).not.toContain("does not support TTS, BGM, SFX, image B-roll");
	});

	test("exposes Codecut system template scripts as read-only editing context", () => {
		initializePromptProject();

		const prompt = buildSystemPrompt({
			localTemplateScripts: [
				createLocalTemplateScript({
					id: "ugc-proof",
					name: "UGC proof script",
					trigger: {
						types: ["product-proof-ad"],
						defaultForTypes: ["product-proof-ad"],
						aliases: ["ugc proof"],
					},
					script: {
						objective: "Build a proof-led product short.",
						steps: [
							{
								id: "hook",
								label: "Hook",
								instruction: "Open with the strongest visible proof.",
							},
						],
						verification: ["Claims must map to visible proof."],
					},
					now: new Date("2026-06-22T00:00:00.000Z"),
				}),
			],
		});

		expect(prompt).toContain("Codecut System Template Scripts");
		expect(prompt).toContain("ugc-proof");
		expect(prompt).toContain("Default triggers: product-proof-ad");
		expect(prompt).toContain("Open with the strongest visible proof.");
		expect(prompt).toContain("Read the matching system template script");
		expect(prompt).toContain(
			"Do not read draft template JSON files as the source of truth",
		);
	});
});
