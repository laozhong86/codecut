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
		expect(source).toContain("bgmSearchQuery");
		expect(source).toContain("bgmCandidates");
		expect(source).toContain("selectedBgmCandidateId");
		expect(source).toContain("角色与声音");
		expect(source).toContain("角色");
		expect(source).toContain("关闭");
		expect(source).toContain("女声");
		expect(source).toContain("男声");
		expect(source).toContain("自定义配音");
		expect(source).toContain("声音克隆");
		expect(source).toContain("配音文件 URL");
		expect(source).toContain("克隆音频 URL");
		expect(source).toContain("BGM");
		expect(source).toContain("智能匹配");
		expect(source).toContain("背景音乐候选");
		expect(source).toContain("授权");
		expect(source).toContain("来源");
		expect(source).toContain("预览");
		expect(source).toContain("需要先搜索并选择背景音乐");
		expect(source).not.toContain("bgmSearchInput");
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
		expect(client).toContain("创建模板");
		expect(client).toContain("模板名称");
		expect(client).toContain("模板草稿名称");
		expect(client).toContain("templateOptions");
		expect(client).toContain("form.titleEnabled &&");
		expect(client).toContain("titleMode");
		expect(client).toContain("自动生成");
		expect(client).toContain("标题文本");
		expect(client).toContain("字体样式");
		expect(client).toContain("关闭");
		expect(client).toContain("自定义配音");
		expect(client).toContain("声音克隆");
		expect(client).toContain("智能匹配");
		expect(client).toContain('form.voicePackId === "custom"');
		expect(client).toContain('form.voicePackId === "voice_clone"');
		expect(client).toContain("form.captionEnabled &&");
		expect(client).toContain('form.templatePreferenceMode === "specified"');
		expect(client).toContain('form.templatePreferenceMode === "create"');
		expect(client).toContain("draftTemplateName");
		expect(client).not.toContain("固定标题");
		expect(client).not.toContain("等待确认");
	});

	test("specified template uses the template library instead of a built-in-only list", async () => {
		const client = await readFile(
			"apps/web/src/app/[locale]/requirements/[draft_id]/requirement-confirmation-client.tsx",
			"utf8",
		);

		expect(client).toContain("templateService.listTemplates");
		expect(client).not.toContain("builtInTemplates.map");
		expect(client).toContain("requestedTemplate:");
		expect(client).toContain("value={form.requestedTemplate}");
		expect(client).toContain(
			'as RequirementConfirmationFormState["requestedTemplate"]',
		);
		expect(client).not.toContain(
			'<input\n\t\t\t\t\t\t\t\t\t\tclassName="h-10 rounded-md border bg-background px-3"\n\t\t\t\t\t\t\t\t\t\tvalue={form.requestedTemplate}',
		);
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
