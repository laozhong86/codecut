import { beforeEach, describe, expect, test } from "bun:test";
import { EditorCore } from "@/core";
import { buildDefaultScene } from "@/lib/scenes";
import { createTemplate } from "@/lib/templates";
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

	test("exposes the unified template planning contract", () => {
		initializePromptProject();

		const prompt = buildSystemPrompt();

		expect(prompt).toContain("Template Contract");
		expect(prompt).toContain("talking-head-short");
		expect(prompt).toContain("tutorial-demo");
		expect(prompt).toContain("product-proof-ad");
		expect(prompt).toContain("narrated-broll");
		expect(prompt).toContain("Templates are planning constraints");
		expect(prompt).toContain("call resolve_template");
		expect(prompt).toContain("does not support TTS");
		expect(prompt).toContain("BGM");
		expect(prompt).toContain("SFX");
		expect(prompt).toContain("video or image B-roll");
		expect(prompt).toContain("independent timed text elements");
		expect(prompt).not.toContain(
			"does not support TTS, BGM, SFX, image B-roll",
		);
		expect(prompt).not.toContain(["P0", "Video", "Template"].join(" "));
		expect(prompt).not.toContain(["system", "template", "script"].join(" "));
	});

	test("exposes Codecut templates as editing context", () => {
		initializePromptProject();

		const prompt = buildSystemPrompt({
			templates: [
				createTemplate({
					id: "ugc-proof",
					name: "UGC proof template",
					source: "user",
					readOnly: false,
					trigger: {
						types: ["product-proof-ad"],
						defaultForTypes: ["product-proof-ad"],
						aliases: ["ugc proof"],
					},
					plan: {
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
					execution: {
						path: "edit-plan-v1",
						requiredEvidence: ["transcript", "visual-proof", "product-facts"],
						defaultStructure: ["hook", "proof", "CTA"],
						captionPreset: "creator-clean",
						stopConditions: ["Product facts are missing."],
					},
					networkMaterialPolicy: {
						defaultEnabled: false,
						searchBasis: "voiceover_content",
						defaultPlacement: "background",
						allowedPlacements: ["background", "top", "bottom"],
					},
					now: new Date("2026-06-22T00:00:00.000Z"),
				}),
			],
		});

		expect(prompt).toContain("Codecut Templates");
		expect(prompt).toContain("ugc-proof");
		expect(prompt).toContain("Default triggers: product-proof-ad");
		expect(prompt).toContain("Execution path: edit-plan-v1");
		expect(prompt).toContain(
			"Required evidence: transcript, visual-proof, product-facts",
		);
		expect(prompt).toContain("Open with the strongest visible proof.");
		expect(prompt).toContain("Before any EditingDecisionLedger");
		expect(prompt).toContain(
			"Do not read draft template JSON files as the source of truth",
		);
		expect(prompt).toContain("import_template");
		expect(prompt).not.toContain(
			["import", "system", "template", "script"].join("_"),
		);
	});
});
