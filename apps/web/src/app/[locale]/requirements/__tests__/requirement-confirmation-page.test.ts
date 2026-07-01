import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("requirement confirmation page UI", () => {
	test("page exposes project, source, character, sound, and confirmation controls", async () => {
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
		expect(source).toContain("characterId");
		expect(source).toContain("voicePackId");
		expect(source).toContain("bgmMode");
		expect(source).toContain("角色与声音");
		expect(source).toContain("角色");
		expect(source).toContain("关闭");
		expect(source).toContain("女声");
		expect(source).toContain("男声");
		expect(source).toContain("BGM");
		expect(source).toContain("智能匹配");
		expect(source).toContain("确认需求");
		expect(source).toContain("/api/codex-requirements/");
	});

	test("places confirmation actions fixed at the centered page bottom", async () => {
		const client = await readFile(
			"apps/web/src/app/[locale]/requirements/[draft_id]/requirement-confirmation-client.tsx",
			"utf8",
		);

		expect(client).toContain("fixed bottom-6 left-1/2");
		expect(client).toContain("-translate-x-1/2");
		expect(client).toContain("z-50 flex");
		expect(client).toContain("justify-center gap-3");
		expect(client).not.toContain("fixed bottom-6 left-20");
		expect(client).toContain("pb-28");
	});

	test("groups final specs, template, title, captions, character, and sound controls", async () => {
		const client = await readFile(
			"apps/web/src/app/[locale]/requirements/[draft_id]/requirement-confirmation-client.tsx",
			"utf8",
		);

		expect(client).toContain("成品规格");
		expect(client).toContain("模板");
		expect(client).toContain("视频封面");
		expect(client).toContain("标题");
		expect(client).toContain("字幕");
		expect(client).toContain("配音");
		expect(client).toContain("角色与声音");
		expect(client).toContain("角色");
		expect(client).toContain("BGM");
		expect(client).toContain("generateIntroCover");
		expect(client).toContain("titleEnabled");
		expect(client).toContain("captionEnabled");
		expect(client).toContain("characterId");
		expect(client).toContain("templatePreferenceMode");
		expect(client).toContain("Agent 自动匹配");
		expect(client).toContain("指定模板");
		expect(client).toContain("模板名称");
		expect(client).toContain("form.titleEnabled &&");
		expect(client).toContain("titleMode");
		expect(client).toContain("自动生成");
		expect(client).toContain("标题文本");
		expect(client).toContain("字体样式");
		expect(client).toContain("关闭");
		expect(client).toContain("智能匹配");
		expect(client).toContain("form.captionEnabled &&");
		expect(client).toContain('form.templatePreferenceMode === "specified"');
		expect(client).not.toContain("固定标题");
		expect(client).not.toContain("等待确认");
		expect(client).not.toContain("选择文件");
		expect(client).not.toContain("文件URL");
		expect(client).not.toContain("文件路径");
	});

	test("keeps video cover control the same height as other spec controls", async () => {
		const client = await readFile(
			"apps/web/src/app/[locale]/requirements/[draft_id]/requirement-confirmation-client.tsx",
			"utf8",
		);

		expect(client).toContain("视频封面");
		expect(client).toContain(
			'className="flex h-10 items-center justify-between gap-4 rounded-md border bg-background px-3"',
		);
		expect(client).not.toContain("flex min-h-10 items-center");
	});
});
