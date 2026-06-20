import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("editor built-in agent panel", () => {
	test("desktop editor page does not render the built-in AI Agent panel", () => {
		const pageSource = readFileSync(
			new URL("../../../app/[locale]/editor/[project_id]/page.tsx", import.meta.url),
			"utf8",
		);

		expect(pageSource).not.toContain("AgentPanel");
		expect(pageSource).not.toContain("useAgentStore");
		expect(pageSource).not.toContain("panels.agent");
	});

	test("editor header does not expose the built-in AI Agent toggle", () => {
		const headerSource = readFileSync(
			new URL("../editor-header.tsx", import.meta.url),
			"utf8",
		);

		expect(headerSource).not.toContain("AgentToggle");
		expect(headerSource).not.toContain("SparklesIcon");
		expect(headerSource).not.toContain("useAgentStore");
		expect(headerSource).not.toContain("AI Agent");
	});
});
