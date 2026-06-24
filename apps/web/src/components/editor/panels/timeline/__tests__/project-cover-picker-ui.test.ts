import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

describe("project cover picker UI", () => {
	test("settings panel is the single cover entry", async () => {
		const previewSource = await readFile(
			"apps/web/src/components/editor/panels/preview/index.tsx",
			"utf8",
		);
		const timelineSource = await readFile(
			"apps/web/src/components/editor/panels/timeline/index.tsx",
			"utf8",
		);
		const settingsSource = await readFile(
			"apps/web/src/components/editor/panels/assets/views/settings.tsx",
			"utf8",
		);

		expect(settingsSource).toContain('value: "cover"');
		expect(settingsSource).toContain("CoverSettingsView");
		expect(previewSource).not.toContain("ProjectCoverToolbarButton");
		expect(previewSource).not.toContain("ProjectCoverDialog");
		expect(timelineSource).not.toContain("ProjectCoverTimelineTile");
		expect(timelineSource).not.toContain("ProjectCoverDialog");
		expect(
			existsSync(
				"apps/web/src/components/editor/panels/timeline/project-cover-dialog.tsx",
			),
		).toBe(false);
	});

	test("cover settings can set a cover from the current frame or local upload", async () => {
		const source = await readFile(
			"apps/web/src/components/editor/panels/assets/views/settings.tsx",
			"utf8",
		);

		expect(source).toContain("handleUseCurrentFrame");
		expect(source).toContain("useFileUpload");
		expect(source).toContain("processMediaAssets");
		expect(source).toContain('source: "timeline_frame"');
		expect(source).toContain('accept: "image/*"');
	});

	test("cover settings labels have Chinese translations", async () => {
		const translation = JSON.parse(
			await readFile(
				"apps/web/public/locales/zh/translation.json",
				"utf8",
			),
		);
		const values = new Set(Object.values(translation));

		for (const label of [
			"封面",
			"当前封面",
			"无封面",
			"封面标题",
			"使用当前帧",
			"上传图片",
			"清除封面",
		]) {
			expect(values.has(label)).toBe(true);
		}
	});

	test("aspect ratio trigger is icon-only", async () => {
		const source = await readFile(
			"apps/web/src/components/editor/project-aspect-ratio-menu.tsx",
			"utf8",
		);

		expect(source).toContain('aria-label={t("Aspect ratio")}');
		expect(source).not.toContain("selectedLabel");
	});
});
