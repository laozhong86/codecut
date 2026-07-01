import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("requirement confirmation page UI", () => {
	test("page exposes project, source, voice, and confirmation controls", async () => {
		const page = await readFile(
			"apps/web/src/app/[locale]/requirements/[draft_id]/page.tsx",
			"utf8",
		);
		const client = await readFile(
			"apps/web/src/app/[locale]/requirements/[draft_id]/requirement-confirmation-client.tsx",
			"utf8",
		);
		const source = `${page}\n${client}`;

		expect(source).toContain("RequirementConfirmationClient");
		expect(source).toContain("projectName");
		expect(source).toContain("mediaSources");
		expect(source).toContain("voicePackId");
		expect(source).toContain("无配音");
		expect(source).toContain("播客女");
		expect(source).toContain("播客男");
		expect(source).toContain("确认需求");
		expect(source).toContain("/api/codex-requirements/");
	});

	test("places confirmation actions in the fixed lower-left page corner", async () => {
		const client = await readFile(
			"apps/web/src/app/[locale]/requirements/[draft_id]/requirement-confirmation-client.tsx",
			"utf8",
		);

		expect(client).toContain("fixed bottom-6 left-20");
		expect(client).toContain("z-50 flex gap-3");
		expect(client).toContain("pb-28");
	});
});
