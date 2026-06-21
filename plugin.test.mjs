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
});
