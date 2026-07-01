import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(fileURLToPath(import.meta.url));

function sectionBetween(content, startHeading, nextHeadingLevel = "##") {
	const start = content.indexOf(startHeading);
	expect(start).toBeGreaterThanOrEqual(0);
	const next = content.indexOf(`\n${nextHeadingLevel} `, start + startHeading.length);
	return next === -1 ? content.slice(start) : content.slice(start, next);
}

describe("CodeCut plugin startup guidance", () => {
	test("states the Agent-driven visual video production positioning in plugin and README copy", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const readme = await readFile(join(pluginRoot, "README.md"), "utf8");
		const zhReadme = await readFile(join(pluginRoot, "README.zh-CN.md"), "utf8");
		const englishPositioning =
			"CodeCut is Codex + CapCut: an Agent-driven visual video production system. Codex performs the production work, while CodeCut shows progress, materials, timeline, preview, manual adjustment, and export in a local visual editor.";
		const englishLongDescription =
			"CodeCut is Codex + CapCut: an Agent-driven visual video production system. Codex understands the user's video goal, plans the production work, uses tools and artifacts to build the edit, and CodeCut presents the process in a local visual editor with media, timeline, preview, manual adjustment, and export.";
		const chinesePositioning =
			"CodeCut = Codex + CapCut。CodeCut 是 Agent 驱动的可视化视频生产系统：Codex 负责视频生产工作，CodeCut 通过本地可视化编辑器展示进度、素材、时间线、预览、人工调整和导出。";

		expect(readme).toContain(englishPositioning);
		expect(zhReadme).toContain(chinesePositioning);
		expect(pluginManifest.description).toBe(englishPositioning);
		expect(pluginManifest.interface.displayName).toBe("CodeCut");
		expect(pluginManifest.interface.shortDescription).toBe(
			"Codex + CapCut for Agent-driven visual video production.",
		);
		expect(pluginManifest.interface.longDescription).toBe(englishLongDescription);
		expect(readme).not.toContain("The first positioning is narrow:");
		expect(readme).not.toContain("Codex plugin + CapCut Pro AI workflow alternative");
		expect(zhReadme).not.toContain("更短的定位：");
		expect(zhReadme).not.toContain("Codex 插件 + CapCut / 剪映平替");
	});

	test("exposes user-clickable starter prompts and plugin icons", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const pluginInterface = pluginManifest.interface;

		expect(pluginInterface.defaultPrompt).toEqual([
			"Open CodeCut and set up an Agent-driven visual video production workspace.",
			"Import my local video into CodeCut and prepare a visible short-form timeline.",
			"Turn this source clip into a 30-90 second vertical short with captions and preview.",
		]);
		expect(pluginInterface.capabilities).toEqual([
			"Agent-driven video production workflow",
			"Visual editing workspace with media and timeline",
			"Trackable production records",
			"Transcript and visual-evidence planning",
			"Validated timeline updates and readback",
			"Preview, manual adjustment, and export proof",
		]);
		for (const prompt of pluginInterface.defaultPrompt) {
			expect(prompt.length).toBeLessThanOrEqual(90);
		}
		const promptText = [
			...pluginInterface.defaultPrompt,
			...pluginInterface.capabilities,
		].join("\n");
		for (const stageSkill of [
			"$codecut",
			"$codecut-requirement-intake",
			"$codecut-material-ingest",
			"$codecut-executor-apply",
			"$codecut-reference-template",
			"$codecut-tiktok-downloader",
			"open_codecut_workspace",
			"MCP tool",
			"before reading local files",
			"loading stage skills",
			"running shell commands",
			"executor mutation",
			"editorUrl",
		]) {
			expect(promptText).not.toContain(stageSkill);
		}

		expect(pluginInterface.composerIcon).toBe(
			"./assets/codecut-logo-flat-dynamic.svg",
		);
		expect(pluginInterface.logo).toBe(
			"./assets/codecut-logo-variant-3d-transparent-1024.png",
		);
		await access(join(pluginRoot, pluginInterface.composerIcon));
		await access(join(pluginRoot, pluginInterface.logo));
	});

	test("documents Cowart-style installation, manual install, usage, and release verification", async () => {
		const readme = await readFile(join(pluginRoot, "README.md"), "utf8");
		const zhReadme = await readFile(join(pluginRoot, "README.zh-CN.md"), "utf8");
		const releaseMatrix = await readFile(
			join(pluginRoot, "docs", "codecut-version-release-matrix.md"),
			"utf8",
		);
		const installSection = sectionBetween(
			readme,
			"## Installation",
		);
		const zhInstallSection = sectionBetween(
			zhReadme,
			"## 安装",
		);
		const usageSection = sectionBetween(readme, "## Usage");
		const zhUsageSection = sectionBetween(zhReadme, "## 使用");
		const releaseSection = sectionBetween(
			readme,
			"## Publish And Verify Local Updates",
		);
		const zhReleaseSection = sectionBetween(
			zhReadme,
			"## 发布本地更新与验证",
		);

		for (const content of [installSection, zhInstallSection]) {
			expect(content).toContain("Codex");
			expect(content).toContain("Manual");
			expect(content).toContain("https://github.com/laozhong86/codecut.git");
			expect(content).toContain("~/plugins/codecut");
			expect(content).toContain(".codex-plugin/plugin.json");
			expect(content).toContain("~/.agents/plugins/marketplace.json");
			expect(content).toContain('"path": "./plugins/codecut"');
			expect(content).toContain("codex plugin marketplace add");
			expect(content).toContain("codex plugin add codecut@personal");
			expect(content).toContain("bun install");
			expect(content).toContain("cp apps/web/.env.example apps/web/.env.local");
			expect(content).toContain("bun run build:web");
			expect(content).toContain("fresh Codex");
			expect(content).not.toContain("local-opc");
		}

		for (const content of [usageSection, zhUsageSection]) {
			expect(content).toContain("Open CodeCut and set up an Agent-driven visual video production workspace.");
			expect(content).toContain("http://127.0.0.1:4100/en/projects");
			expect(content).toContain(".codecut-workspace/projects/<project-id>/");
			expect(content).toContain("Import my local video into CodeCut and prepare a visible short-form timeline.");
			expect(content).toContain(
				"Turn this source clip into a 30-90 second vertical short with captions and preview.",
			);
		}

		for (const content of [releaseSection, zhReleaseSection]) {
			expect(content).toContain("node scripts/sync-codex-local-plugin.mjs");
			expect(content).toContain("bun run plugin:freshness");
			expect(content).toContain("tool_search");
			expect(content).toContain("open_codecut_workspace");
			expect(content).toContain("docs/codecut-version-release-matrix.md");
			expect(content).not.toContain("local-opc");
		}

		for (const checklistItem of [
			"manifest version",
			"MCP server version",
			"skills",
			"source-to-cache sync",
			"enabled config",
			"fresh-session tool surface",
		]) {
			expect(releaseMatrix).toContain(checklistItem);
		}
	});

	test("declares a local web server app for the CodeCut preview", async () => {
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

	test("declares the bundled CodeCut MCP server", async () => {
		const pluginManifest = JSON.parse(
			await readFile(join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"),
		);
		const mcpManifest = JSON.parse(
			await readFile(join(pluginRoot, ".mcp.json"), "utf8"),
		);

		expect(pluginManifest.mcpServers).toBe("./.mcp.json");
		expect(mcpManifest.mcpServers.codecut_mcp).toEqual({
			title: "CodeCut MCP",
			description:
				"CodeCut MCP tools for local editor setup, timeline readback, and verified editing operations.",
			cwd: ".",
			command: "node",
			args: ["./mcp/server.mjs"],
		});
	});

	test("opens the local preview through the current Codex in-app browser", async () => {
		const skill = await readFile(
			join(pluginRoot, "skills", "codecut", "SKILL.md"),
			"utf8",
		);
		const executorSkill = await readFile(
			join(pluginRoot, "skills", "codecut-executor-apply", "SKILL.md"),
			"utf8",
		);
		const executionContract = await readFile(
			join(
				pluginRoot,
				"skills",
				"codecut",
				"references",
				"execution-contract.md",
			),
			"utf8",
		);
		const agentCard = await readFile(
			join(pluginRoot, "skills", "codecut", "agents", "openai.yaml"),
			"utf8",
		);
		const normalizedSkill = skill.replace(/\s+/g, " ");
		const normalizedExecutorSkill = executorSkill.replace(/\s+/g, " ");
		const normalizedExecutionContract = executionContract.replace(/\s+/g, " ");

		expect(agentCard).toContain("Codex in-app browser");
			expect(agentCard).toContain(
				"Whenever CodeCut creates a project and receives an editorUrl",
			);
		expect(skill).toContain("references/execution-contract.md");
		expect(normalizedSkill).toContain(
			"the Codex in-app browser is only for human preview",
		);
		expect(executionContract).toContain("setupBrowserRuntime");
		expect(executionContract).toContain('agent.browsers.get("iab")');
		expect(executionContract).toContain('browser.capabilities.get("visibility")');
		expect(executionContract).toContain(
			'await (await browser.capabilities.get("visibility")).set(true);',
		);
		expect(executionContract).toContain("browser.tabs.selected()");
		expect(executionContract).toContain("browser.tabs.new()");
		expect(executionContract).toContain("await tab.goto(previewUrl);");
		expect(executionContract).toContain("if ((await tab.url()) !== previewUrl)");
		expect(executionContract).toContain("http://127.0.0.1:4100/en/projects");
		expect(executionContract).toContain(
			"the `editorUrl` returned by `create-project`",
		);
			expect(normalizedExecutionContract).toContain(
				"Whenever a CodeCut project is created and an `editorUrl` is returned",
			);
		expect(normalizedExecutionContract).toContain(
			"open that exact `editorUrl` in the Codex in-app browser before reporting the project ready",
		);
		expect(normalizedExecutorSkill).toContain(
			"After `create-project` returns an `editorUrl`, open that exact URL in the Codex in-app browser before the next executor step",
		);
		expect(executionContract).toContain(
			"Do not reconstruct a bare `/editor/<projectId>` URL for executor projects",
		);
		expect(normalizedExecutionContract).toContain(
			"Do not call `tab.goto(previewUrl)` if the selected tab is already on the preview URL",
		);
		expect(executionContract).toContain("Browser is not the Agent runtime");
		for (const content of [skill, executionContract]) {
			expect(content).not.toContain("osascript");
			expect(content).not.toContain("View -> Open Browser Tab");
		}
	});

	test("routes new creative intake through requirement confirmation before text fallback", async () => {
		const routerSkill = await readFile(
			join(pluginRoot, "skills", "codecut", "SKILL.md"),
			"utf8",
		);
		const routerAgentCard = await readFile(
			join(pluginRoot, "skills", "codecut", "agents", "openai.yaml"),
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
		const normalizedRouterSkill = routerSkill.replace(/\r\n/g, "\n");
		const compactRouterSkill = normalizedRouterSkill.replace(/\s+/g, " ");

		for (const content of [
			routerSkill,
			routerAgentCard,
			intakeSkill,
			intakeAgentCard,
		]) {
			expect(content).toContain("open_codecut_requirement_confirmation");
		}

		expect(intakeSkill).toContain("requirement confirmation tool is unavailable");
		expect(intakeSkill).toContain("tool_search");
		expect(intakeSkill).toContain(
			"mcp__codecut_mcp.open_codecut_requirement_confirmation",
		);
		expect(intakeSkill).toContain("text-only questions");
		expect(intakeSkill).toContain("create_codecut_project_from_requirement");
		for (const content of [routerAgentCard, intakeAgentCard]) {
			expect(content).toContain("node_repl");
			expect(content).toContain("setupBrowserRuntime");
			expect(content).toContain("scripts/browser-client.mjs");
			expect(content).toContain('agent.browsers.get("iab")');
		}
		for (const content of [routerSkill, intakeSkill]) {
			expect(content).toContain("Do not click the confirm or cancel buttons");
		}
		expect(normalizedRouterSkill).toContain("run `ffprobe` on that local file");
		expect(compactRouterSkill).toContain(
			"before loading stage skills, reading other local files",
		);
		expect(routerSkill).toContain("loading stage skills");
		expect(compactRouterSkill).toContain("running unrelated shell commands");
		expect(routerSkill).toContain(
			"before loading child skills or unrelated shell",
		);
		expect(routerSkill).not.toContain(
			"Use `codecut-requirement-intake` first; it should open",
		);
	});

	test("documents fresh-thread requirement confirmation verification", async () => {
		const agents = await readFile(join(pluginRoot, "AGENTS.md"), "utf8");
		const checklist = await readFile(
			join(pluginRoot, "docs", "codecut-widget-intake-fresh-thread.md"),
			"utf8",
		);

		for (const content of [agents, checklist]) {
			expect(content).toContain("fresh-thread");
			expect(content).toContain("verify-codecut-widget-intake-thread.mjs");
			expect(content).toContain("open_codecut_requirement_confirmation");
			expect(content).toContain("get_codecut_requirement_confirmation");
		}
		expect(checklist).toContain("do not inspect skills");
		expect(checklist).toContain(
			"Use tool_search only if open_codecut_requirement_confirmation",
		);
		expect(checklist).toContain(
			"codecut_mcp.open_codecut_requirement_confirmation",
		);
		expect(checklist).toContain("--require-confirmed-requirement true");
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
		expect(executorApply).toContain(
			"Before any long render or `export_project`",
		);
		expect(referenceTemplate).toContain(
			"owns reference-derived template evidence",
		);
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
				"router",
				"requirement-intake",
				"source-acquisition",
				"material-ingest",
				"reference-template",
				"edit-planning",
				"executor-apply",
			]) {
				expect(contract).toContain(`\`${stage}\``);
			}
			expect(contract).toContain("Non-Skill Workflow Phases");
			expect(contract).toContain(
				"`evidence-build` is a Codex-side workflow phase",
			);
			expect(contract).toContain(
				"Edit-planning is a loadable stage skill owned by `codecut-edit-planning`.",
			);
			expect(contract).not.toContain("`evidence-build` and `edit-planning`");
			expect(contract).toContain(
				'"Timeline updated", "Verified in timeline", or "Export produced"',
			);

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
			"Do not use FFmpeg, shell scripts, or subtitle burn-in as the CodeCut editing path.",
			"Do not let MCP tools choose the workflow.",
			"Do not treat a local MP4 as completion without matching CodeCut timeline readback.",
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

	test("keeps current agent-facing tool contracts on callable MCP names", async () => {
		const currentContractPaths = [
			["skills", "codecut", "references", "codecut-agent-tool-contract.md"],
			["skills", "codecut", "references", "execution-contract.md"],
			["skills", "codecut", "references", "round-trip-editing-contract.md"],
			[
				"skills",
				"codecut-edit-planning",
				"references",
				"workflow-recipes",
				"long-to-short.md",
			],
			["docs", "codex-driven-editing.md"],
		];

		for (const pathParts of currentContractPaths) {
			const content = await readFile(join(pluginRoot, ...pathParts), "utf8");
			expect(content).not.toContain("import_media_file");
			expect(content).not.toContain("update_project_settings");
		}

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
		expect(toolContract).toContain("Current callable MCP tools");
		expect(toolContract).toContain("`import_media`");
		expect(toolContract).toContain("optional import_media");
		expect(toolContract).toContain("`export_project`");
	});

	test("declares gardener manifests and usage-log entrypoints for CodeCut skills", async () => {
		const skillNames = [
			"codecut",
			"codecut-requirement-intake",
			"codecut-material-ingest",
			"codecut-edit-planning",
			"codecut-executor-apply",
			"codecut-reference-template",
			"codecut-tiktok-downloader",
		];

		for (const skillName of skillNames) {
			const manifest = await readFile(
				join(pluginRoot, "skills", skillName, "manifest.yaml"),
				"utf8",
			);
			expect(manifest).toContain(`name: ${skillName}`);
			expect(manifest).toContain("type: functional");
			expect(manifest).toContain("usage_log_entrypoint:");
			expect(manifest).toContain(`_runtime/logs/${skillName}/usage.jsonl`);
			expect(manifest).toContain("retrospective_log_entrypoint:");
			expect(manifest).toContain("Do not fabricate usage data");
			expect(manifest).toContain("cold_start_mode: false");
		}
	});

	test("routes TikTok source downloads through a dedicated stage skill", async () => {
		const frameworkSkill = await readFile(
			join(pluginRoot, "skills", "codecut", "SKILL.md"),
			"utf8",
		);
		const frameworkAgentCard = await readFile(
			join(pluginRoot, "skills", "codecut", "agents", "openai.yaml"),
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
		expect(tiktokDownloader).toContain(
			".codecut-workspace/projects/<projectId>/01-assets",
		);
		expect(tiktokDownloader).toContain("Do not run executor mutation commands");
		expect(tiktokDownloader).toContain("hand off to `codecut-material-ingest`");
		expect(tiktokDownloader).toContain(
			"hand back to `codecut-requirement-intake`",
		);
		expect(frameworkSkill).toContain(
			"Source-only acquisition is not a creative editing job",
		);
		expect(frameworkSkill).toContain(
			"Do not open the creative editing confirmation page",
		);
		expect(frameworkAgentCard).toContain(
			"source-only download/save/extract requests",
		);
		expect(materialIngest).toContain("For source-only acquisition requests");
		expect(tiktokDownloader).toContain(
			"Do not open creative editing intake unless the user later asks for editing",
		);
		expect(tiktokDownloader).toContain("scripts/download_tiktok.py");
		expect(tiktokDownloaderScript).toContain("required=True");
		expect(tiktokDownloaderScript).toContain("download_manifest.json");
		expect(tiktokDownloaderScript).toContain("tikwm");

		const pythonCommand = process.platform === "win32" ? "python" : "python3";
		const pySyntaxCheck = spawnSync(pythonCommand, [
			"-c",
			"import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text())",
			join(
				pluginRoot,
				"skills",
				"codecut-tiktok-downloader",
				"scripts",
				"download_tiktok.py",
			),
		], {
			encoding: "utf8",
			timeout: 20_000,
		});
		expect(pySyntaxCheck.error).toBeUndefined();
		expect(pySyntaxCheck.stderr).toBe("");
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
	}, 30_000);

	test("requires visual preflight for horizontal sources converted to vertical shorts", async () => {
		const skillRoot = join(pluginRoot, "skills", "codecut");
		const planningSkillRoot = join(pluginRoot, "skills", "codecut-edit-planning");
		const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
		const executionContract = await readFile(
			join(skillRoot, "references", "execution-contract.md"),
			"utf8",
		);
		const longToShort = await readFile(
			join(
				planningSkillRoot,
				"references",
				"workflow-recipes",
				"long-to-short.md",
			),
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

		expect(skill).toContain("references/execution-contract.md");
		for (const content of [executionContract, longToShort, platformPresets]) {
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
		const skillRoot = join(pluginRoot, "skills", "codecut");
		const planningSkillRoot = join(pluginRoot, "skills", "codecut-edit-planning");
		const skill = await readFile(join(skillRoot, "SKILL.md"), "utf8");
		const executionContract = await readFile(
			join(skillRoot, "references", "execution-contract.md"),
			"utf8",
		);
		const subtitlePass = await readFile(
			join(
				planningSkillRoot,
				"references",
				"workflow-recipes",
				"subtitle-pass.md",
			),
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

		expect(skill).toContain("references/execution-contract.md");
		for (const content of [executionContract, subtitlePass, workflow]) {
			const normalizedContent = content.replace(/\s+/g, " ");
			expect(normalizedContent).toContain("post-cut caption source");
			expect(normalizedContent).toContain("source transcript remap");
			expect(normalizedContent).toContain("edited audio transcription");
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
				"codecut-edit-planning",
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
