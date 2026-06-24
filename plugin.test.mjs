import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(fileURLToPath(import.meta.url));

describe("Codecut plugin startup guidance", () => {
	test("keeps the Codecut skill as the single default plugin entrypoint", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const startupPrompt = pluginManifest.interface.defaultPrompt.join("\n");

		expect(startupPrompt).toContain("$codecut");
		for (const stageSkill of [
			"$codecut-requirement-intake",
			"$codecut-material-ingest",
			"$codecut-executor-apply",
			"$codecut-reference-template",
			"$codecut-tiktok-downloader",
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
				"codecut",
				"SKILL.md",
			),
			"utf8",
		);
		const executorSkill = await readFile(
			join(pluginRoot, "skills", "codecut-executor-apply", "SKILL.md"),
			"utf8",
		);
		const agentCard = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut",
				"agents",
				"openai.yaml",
			),
			"utf8",
		);
		const startupPrompt = pluginManifest.interface.defaultPrompt.join("\n");
		const normalizedSkill = skill.replace(/\s+/g, " ");
		const normalizedExecutorSkill = executorSkill.replace(/\s+/g, " ");

		expect(startupPrompt).toContain("Codex in-app browser");
		expect(startupPrompt).toContain(
			"Whenever Codecut creates a project and receives an editorUrl",
		);
		expect(agentCard).toContain("Codex in-app browser");
		expect(agentCard).toContain(
			"Whenever Codecut creates a project and receives an editorUrl",
		);
		expect(skill).toContain("setupBrowserRuntime");
		expect(skill).toContain('agent.browsers.get("iab")');
		expect(skill).toContain('browser.capabilities.get("visibility")');
		expect(skill).toContain(
			'await (await browser.capabilities.get("visibility")).set(true);',
		);
		expect(skill).toContain("browser.tabs.selected()");
		expect(skill).toContain("browser.tabs.new()");
		expect(skill).toContain("await tab.goto(previewUrl);");
		expect(skill).toContain("if ((await tab.url()) !== previewUrl)");
		expect(skill).toContain("http://127.0.0.1:4100/en/projects");
		expect(skill).toContain("the `editorUrl` returned by `create-project`");
		expect(normalizedSkill).toContain(
			"Whenever a Codecut project is created and an `editorUrl` is returned",
		);
		expect(normalizedSkill).toContain(
			"open that exact `editorUrl` in the Codex in-app browser before reporting the project ready",
		);
		expect(normalizedExecutorSkill).toContain(
			"After `create-project` returns an `editorUrl`, open that exact URL in the Codex in-app browser before the next executor step",
		);
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
				"codecut",
				"SKILL.md",
			),
			"utf8",
		);
		const routerAgentCard = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut",
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
		const normalizedRouterSkill = routerSkill.replace(/\r\n/g, "\n");

		for (const content of [
			startupPrompt,
			routerSkill,
			routerAgentCard,
			intakeSkill,
			intakeAgentCard,
		]) {
			expect(content).toContain("open_codecut_workspace");
		}

		expect(startupPrompt).toContain("MCP tool directly");
		expect(startupPrompt).toContain("before reading local files");
		expect(startupPrompt.indexOf("open_codecut_workspace")).toBeLessThan(
			startupPrompt.indexOf("$codecut"),
		);
		expect(intakeSkill).toContain("workspace widget tool is unavailable");
		expect(intakeSkill).toContain("tool_search");
		expect(intakeSkill).toContain("mcp__codecut_mcp.open_codecut_workspace");
		expect(intakeSkill).toContain("text-only questions");
		expect(startupPrompt).toContain("before reading local files");
		expect(startupPrompt).toContain("loading stage skills");
		expect(startupPrompt).toContain("running shell commands");
		expect(normalizedRouterSkill).toContain("before reading\nlocal files");
		expect(routerSkill).toContain("loading stage skills");
		expect(routerSkill).toContain("running shell commands");
		expect(routerSkill).toContain("before loading child skills or shell");
		expect(routerSkill).not.toContain(
			"Use `codecut-requirement-intake` first; it should open",
		);
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
		expect(checklist).toContain("do not inspect skills");
		expect(checklist).toContain(
			"Use tool_search only if open_codecut_workspace is not visible",
		);
		expect(checklist).toContain("The only allowed Codecut MCP tool call is");
	});

	test("keeps bridge env command details on the executor surface", async () => {
		const executorSkill = await readFile(
			join(pluginRoot, "skills", "codecut-executor-apply", "SKILL.md"),
			"utf8",
		);
		const frameworkSkill = await readFile(
			join(pluginRoot, "skills", "codecut", "SKILL.md"),
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
			join(pluginRoot, "skills", "codecut", "SKILL.md"),
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
		expect(executorApply).toContain("Before any long render or `export_project`");
		expect(referenceTemplate).toContain("owns reference-derived template evidence");
		expect(referenceTemplate).toContain("confirmedByUser: true");
	});

	test("centralizes user-visible workflow stage contracts in a reference", async () => {
		const contractPath = join(
			pluginRoot,
			"skills",
			"codecut",
			"references",
			"workflow-stage-contract.md",
		);
		const contract = await readFile(contractPath, "utf8");
		const frameworkSkill = await readFile(
			join(pluginRoot, "skills", "codecut", "SKILL.md"),
			"utf8",
		);
		const workflowDocs = await readFile(
			join(pluginRoot, "docs", "codex-driven-editing.md"),
			"utf8",
		);

		expect(frameworkSkill).toContain("workflow-stage-contract.md");
		expect(workflowDocs).toContain("workflow-stage-contract.md");

		for (const stage of [
			"requirement-intake",
			"material-ingest",
			"evidence-build",
			"edit-planning",
			"executor-apply",
			"verification-export",
			"reference-template",
		]) {
			expect(contract).toContain(`\`${stage}\``);
		}

		for (const requiredColumn of [
			"Owner",
			"Input",
			"Output Artifact",
			"User-Visible Status",
			"Stop Condition",
			"Next Handoff",
		]) {
			expect(contract).toContain(requiredColumn);
		}

		for (const rule of [
			"Do not use FFmpeg, shell scripts, or subtitle burn-in as the Codecut editing path.",
			"Do not let MCP tools choose the workflow.",
			"Do not treat a local MP4 as completion without matching Codecut timeline readback.",
		]) {
			expect(contract).toContain(rule);
		}
	});

	test("documents atomic MCP capability output and failure shapes", async () => {
		const toolContract = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut",
				"references",
				"codecut-agent-tool-contract.md",
			),
			"utf8",
		);

		expect(toolContract).toContain("## Atomic Capability Contract");
		for (const requiredColumn of [
			"Capability",
			"Side Effect Boundary",
			"Success Output",
			"Failure Shape",
			"Agent Next Action",
		]) {
			expect(toolContract).toContain(requiredColumn);
		}
		for (const requiredField of [
			"`structuredContent`",
			"`isError: true`",
			"`structuredContent.error`",
			"`create_failed`",
			"`import_failed`",
			"`readback_failed`",
		]) {
			expect(toolContract).toContain(requiredField);
		}
		for (const toolName of [
			"open_codecut_workspace",
			"build_video_context",
			"apply_edit_plan",
			"verify_timeline",
			"export_project",
		]) {
			expect(toolContract).toContain(`\`${toolName}\``);
		}
	});

	test("routes TikTok source downloads through a dedicated stage skill", async () => {
		const frameworkSkill = await readFile(
			join(pluginRoot, "skills", "codecut", "SKILL.md"),
			"utf8",
		);
		const frameworkAgentCard = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut",
				"agents",
				"openai.yaml",
			),
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
		const tiktokDownloader = await readFile(
			join(pluginRoot, "skills", "codecut-tiktok-downloader", "SKILL.md"),
			"utf8",
		);
		const tiktokDownloaderScript = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut-tiktok-downloader",
				"scripts",
				"download_tiktok.py",
			),
			"utf8",
		);
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const startupPrompt = pluginManifest.interface.defaultPrompt.join("\n");

		expect(tiktokDownloader).toContain("name: codecut-tiktok-downloader");
		expect(tiktokDownloader).toContain("TikTok");
		expect(tiktokDownloader).toContain("yt-dlp");
		expect(tiktokDownloader).toContain("tikwm");
		expect(tiktokDownloader).toMatch(/older than 90 days/);
		expect(tiktokDownloader).toMatch(/update\s+`yt-dlp`/);
		expect(tiktokDownloader).toMatch(
			/before treating the failure as a TikTok\s+fallback condition/,
		);
		expect(tiktokDownloader).toContain("download_manifest.json");
		expect(tiktokDownloader).toContain(".codecut-workspace/projects/<projectId>/01-assets");
		expect(tiktokDownloader).toContain("Do not run executor mutation commands");
		expect(tiktokDownloader).toContain("hand off to `codecut-material-ingest`");
		expect(tiktokDownloader).toContain("hand back to `codecut-requirement-intake`");
		expect(tiktokDownloader).toContain("scripts/download_tiktok.py");
		expect(tiktokDownloaderScript).toContain("required=True");
		expect(tiktokDownloaderScript).toContain("download_manifest.json");
		expect(tiktokDownloaderScript).toContain("tikwm");

		const pySyntaxCheck = spawnSync("python3", [
			"-c",
			"import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text())",
			join(
				pluginRoot,
				"skills",
				"codecut-tiktok-downloader",
				"scripts",
				"download_tiktok.py",
			),
		]);
		expect(pySyntaxCheck.status).toBe(0);

		for (const content of [
			frameworkSkill,
			frameworkAgentCard,
			requirementIntake,
			materialIngest,
		]) {
			expect(content).toContain("codecut-tiktok-downloader");
		}

		expect(startupPrompt).not.toContain("$codecut-tiktok-downloader");
	});

	test("requires visual preflight for horizontal sources converted to vertical shorts", async () => {
		const skillRoot = join(
			pluginRoot,
			"skills",
			"codecut",
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
		expect(editPlanSchema).toContain("visual.sourceCrop");
		expect(editPlanSchema).toContain(
			"Generate a one-time fallback MP4 outside editable timeline semantics",
		);
	});

	test("requires post-cut caption timing and video-type caption preset routing", async () => {
		const skillRoot = join(
			pluginRoot,
			"skills",
			"codecut",
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
				"codecut",
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
