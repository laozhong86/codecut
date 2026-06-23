import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(fileURLToPath(import.meta.url));

describe("Codecut plugin startup guidance", () => {
	test("keeps the framework skill as the single default plugin entrypoint", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const startupPrompt = pluginManifest.interface.defaultPrompt.join("\n");

		expect(startupPrompt).toContain("$codecut-jianying-editor-framework");
		for (const stageSkill of [
			"$codecut-requirement-intake",
			"$codecut-material-ingest",
			"$codecut-executor-apply",
			"$codecut-reference-template",
		]) {
			expect(startupPrompt).not.toContain(stageSkill);
		}
	});

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

	test("declares the bundled Codecut MCP server", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const mcpManifest = JSON.parse(
			await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
		);

		expect(pluginManifest.mcpServers).toBe("./.mcp.json");
		expect(mcpManifest.mcpServers.codecut_mcp).toEqual({
			title: "Codecut MCP",
			description: "Expose stable Codecut local executor tools through MCP.",
			cwd: ".",
			command: "node",
			args: ["./mcp/server.mjs"],
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
		expect(skill).toContain("the `editorUrl` returned by `create-project`");
		expect(skill).toContain(
			"Do not reconstruct a bare `/editor/<projectId>` URL for executor projects",
		);
		expect(skill).toContain(
			"Do not call `tab.goto(previewUrl)` if the selected tab is already on the preview URL",
		);
		expect(skill).toContain("Browser is not the Agent runtime");
		expect(skill).not.toContain("osascript");
		expect(skill).not.toContain("View -> Open Browser Tab");
	});

	test("routes new creative intake through the workspace widget before text fallback", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const routerSkill = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut-jianying-editor-framework",
				"SKILL.md",
			),
			"utf8",
		);
		const routerAgentCard = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut-jianying-editor-framework",
				"agents",
				"openai.yaml",
			),
			"utf8",
		);
		const intakeSkill = await readFile(
			join(pluginRoot, "skills", "codecut-requirement-intake", "SKILL.md"),
			"utf8",
		);
		const intakeAgentCard = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut-requirement-intake",
				"agents",
				"openai.yaml",
			),
			"utf8",
		);
		const startupPrompt = pluginManifest.interface.defaultPrompt.join("\n");

		for (const content of [
			startupPrompt,
			routerSkill,
			routerAgentCard,
			intakeSkill,
			intakeAgentCard,
		]) {
			expect(content).toContain("open_codecut_workspace");
		}

		expect(intakeSkill).toContain("workspace widget tool is unavailable");
		expect(intakeSkill).toContain("tool_search");
		expect(intakeSkill).toContain("mcp__codecut_mcp.open_codecut_workspace");
		expect(intakeSkill).toContain("text-only questions");
	});

	test("documents fresh-thread widget intake verification", async () => {
		const agents = await readFile(join(pluginRoot, "AGENTS.md"), "utf8");
		const checklist = await readFile(
			join(pluginRoot, "docs", "codecut-widget-intake-fresh-thread.md"),
			"utf8",
		);

		for (const content of [agents, checklist]) {
			expect(content).toContain("fresh-thread");
			expect(content).toContain("verify-codecut-widget-intake-thread.mjs");
			expect(content).toContain("open_codecut_workspace");
		}
	});

	test("keeps bridge env command details on the executor surface", async () => {
		const executorSkill = await readFile(
			join(pluginRoot, "skills", "codecut-executor-apply", "SKILL.md"),
			"utf8",
		);
		const frameworkSkill = await readFile(
			join(pluginRoot, "skills", "codecut-jianying-editor-framework", "SKILL.md"),
			"utf8",
		);
		const workflowDocs = await readFile(
			join(pluginRoot, "docs", "codex-driven-editing.md"),
			"utf8",
		);

		for (const content of [executorSkill, workflowDocs]) {
			expect(content).toContain("apps/web/.env.local");
			expect(content).toContain("source apps/web/.env.local");
		}
		expect(frameworkSkill).toContain("Use `codecut-executor-apply`");
	});

	test("documents stage ownership and import confirmation boundaries", async () => {
		const frameworkSkill = await readFile(
			join(pluginRoot, "skills", "codecut-jianying-editor-framework", "SKILL.md"),
			"utf8",
		);
		const requirementIntake = await readFile(
			join(pluginRoot, "skills", "codecut-requirement-intake", "SKILL.md"),
			"utf8",
		);
		const materialIngest = await readFile(
			join(pluginRoot, "skills", "codecut-material-ingest", "SKILL.md"),
			"utf8",
		);
		const executorApply = await readFile(
			join(pluginRoot, "skills", "codecut-executor-apply", "SKILL.md"),
			"utf8",
		);
		const referenceTemplate = await readFile(
			join(pluginRoot, "skills", "codecut-reference-template", "SKILL.md"),
			"utf8",
		);

		expect(frameworkSkill).toContain("## Governance Layers");
		expect(frameworkSkill).toContain("## Required Stage Routing");
		expect(frameworkSkill).toContain("advanced repair tools");
		expect(frameworkSkill).toContain("strict EditPlan or");
		expect(requirementIntake).toContain("## Stage Ownership");
		expect(requirementIntake).toContain("owns only the permission decision");
		expect(materialIngest).toContain("owns source material facts only");
		expect(executorApply).toContain("owns executor readiness and execution");
		expect(referenceTemplate).toContain("owns reference-derived template evidence");
		expect(referenceTemplate).toContain("confirmedByUser: true");
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
			expect(content).toContain("build-post-cut-captions");
		}

		for (const content of [platformPresets, editPlanSchema, workflow]) {
			expect(content).toContain("talking-head-pop");
			expect(content).toContain("tutorial-clean");
			expect(content).toContain("documentary-soft");
		}
	});

	test("requires an explicit policy when the source already has subtitles", async () => {
		const subtitlePass = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut-jianying-editor-framework",
				"references",
				"workflow-recipes",
				"subtitle-pass.md",
			),
			"utf8",
		);

		expect(subtitlePass).toContain("Existing Subtitle Policy");
		expect(subtitlePass).toContain("editable caption/text track");
		expect(subtitlePass).toContain("burned-in source subtitles");
		expect(subtitlePass).toContain(
			"preserve, replace, translation overlay, or avoid",
		);
		expect(subtitlePass).toContain("Do not stack new captions");
	});
});
