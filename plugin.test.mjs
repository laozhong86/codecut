import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(fileURLToPath(import.meta.url));

describe("Codecut plugin startup guidance", () => {
	test("declares a local web server app for the Codecut preview", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const appManifest = JSON.parse(
			await readFile(join(pluginRoot, ".app.json"), "utf8"),
		);
		const app = appManifest.apps.codecut;

		expect(pluginManifest.apps).toBe("./.app.json");
		expect(app.id).toBe("codecut");
		expect(app.launch).toEqual({
			type: "local-web-server",
			command: "bun",
			args: ["run", "dev:web"],
			url: "http://127.0.0.1:4100/en/projects",
		});
	});

	test("opens the local preview through the current Codex in-app browser", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const skill = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut-jianying-editor-framework",
				"SKILL.md",
			),
			"utf8",
		);
		const agentCard = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut-jianying-editor-framework",
				"agents",
				"openai.yaml",
			),
			"utf8",
		);
		const startupPrompt = pluginManifest.interface.defaultPrompt.join("\n");

		expect(startupPrompt).toContain("Codex in-app browser");
		expect(agentCard).toContain("Codex in-app browser");
		expect(skill).toContain("setupBrowserRuntime");
		expect(skill).toContain('agent.browsers.get("iab")');
		expect(skill).toContain('browser.capabilities.get("visibility")');
		expect(skill).toContain("browser.tabs.selected()");
		expect(skill).toContain("http://127.0.0.1:4100/en/projects");
		expect(skill).toContain("http://127.0.0.1:4100/en/editor/<projectId>");
		expect(skill).toContain(
			"Do not call `tab.goto(previewUrl)` if the selected tab is already on the preview URL",
		);
		expect(skill).toContain("Browser is not the Agent runtime");
		expect(skill).not.toContain("osascript");
		expect(skill).not.toContain("View -> Open Browser Tab");
	});

	test("documents apps/web env loading for bridge commands", async () => {
		const skill = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut-jianying-editor-framework",
				"SKILL.md",
			),
			"utf8",
		);
		const workflowDocs = await readFile(
			join(pluginRoot, "docs", "codex-driven-editing.md"),
			"utf8",
		);

		for (const content of [skill, workflowDocs]) {
			expect(content).toContain("apps/web/.env.local");
			expect(content).toContain("source apps/web/.env.local");
		}
	});

	test("requires visual preflight for horizontal sources converted to vertical shorts", async () => {
		const skillRoot = join(
			pluginRoot,
			"skills",
			"codecut-jianying-editor-framework",
		);
		const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
		const longToShort = await readFile(
			join(skillRoot, "references", "workflow-recipes", "long-to-short.md"),
			"utf8",
		);
		const platformPresets = await readFile(
			join(skillRoot, "references", "platform-presets.md"),
			"utf8",
		);
		const videoContext = await readFile(
			join(skillRoot, "references", "video-context-contract.md"),
			"utf8",
		);
		const editPlanSchema = await readFile(
			join(skillRoot, "references", "edit-plan-schema.md"),
			"utf8",
		);

		for (const content of [skill, longToShort, platformPresets]) {
			expect(content).toContain("visual preflight");
			expect(content).toContain(
				"vertical_face_safe_crop_above_burned_captions",
			);
			expect(content).toContain("Do not use `black-bar` as a subtitle mask");
		}

		expect(videoContext).toContain("burnedCaptionRegion");
		expect(videoContext).toContain("recommendedReframeTemplate");
		expect(videoContext).toContain("captionPolicy");
		expect(editPlanSchema).toContain("source crop");
		expect(editPlanSchema).toContain(
			"stop and report the runtime gap instead of hiding the problem with captions",
		);
	});

	test("requires post-cut caption timing and video-type caption preset routing", async () => {
		const skillRoot = join(
			pluginRoot,
			"skills",
			"codecut-jianying-editor-framework",
		);
		const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
		const subtitlePass = await readFile(
			join(skillRoot, "references", "workflow-recipes", "subtitle-pass.md"),
			"utf8",
		);
		const platformPresets = await readFile(
			join(skillRoot, "references", "platform-presets.md"),
			"utf8",
		);
		const editPlanSchema = await readFile(
			join(skillRoot, "references", "edit-plan-schema.md"),
			"utf8",
		);
		const workflow = await readFile(
			join(pluginRoot, "docs", "codex-driven-editing.md"),
			"utf8",
		);

		for (const content of [skill, subtitlePass, workflow]) {
			expect(content).toContain("post-cut caption source");
			expect(content).toContain("source transcript remap");
			expect(content).toContain("edited audio transcription");
		}

		for (const content of [platformPresets, editPlanSchema, workflow]) {
			expect(content).toContain("talking-head-pop");
			expect(content).toContain("tutorial-clean");
			expect(content).toContain("documentary-soft");
		}
	});
});
