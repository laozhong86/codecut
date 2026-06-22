import { expect, test } from "@playwright/test";

const executorToken = "playwright-smoke";
const projectId = "playwright-editor-smoke";
const projectName = "Playwright executor smoke";
const timelineText = "Smoke title from executor";

test.beforeEach(async ({ request }) => {
	await request.delete("/api/codex-executor/project", {
		headers: { authorization: `Bearer ${executorToken}` },
		data: { projectId },
	});

	const createResponse = await request.post("/api/codex-executor/projects", {
		headers: { authorization: `Bearer ${executorToken}` },
		data: { projectId, name: projectName },
	});
	expect(createResponse.ok()).toBe(true);

	const commandResponse = await request.post("/api/codex-executor/commands", {
		headers: { authorization: `Bearer ${executorToken}` },
		data: {
			envelope: {
				version: 1,
				projectId,
				source: "codex",
				commands: [
					{
						id: "cmd-add-smoke-title",
						tool: "add_texts",
						args: {
							entries: [
								{
									startTime: 0,
									duration: 4,
									content: timelineText,
									name: "Smoke title",
									fontSize: 48,
									textAlign: "center",
								},
							],
						},
					},
				],
			},
		},
	});
	expect(commandResponse.ok()).toBe(true);
});

test.afterEach(async ({ request }) => {
	await request.delete("/api/codex-executor/project", {
		headers: { authorization: `Bearer ${executorToken}` },
		data: { projectId },
	});
});

test("editor displays an executor snapshot on the timeline", async ({ page }) => {
	await page.goto(`/en/editor/${projectId}`);

	await expect(page.getByRole("textbox")).toHaveValue(projectName);
	await expect(page.getByRole("status", { name: /Codex executor succeeded/ }))
		.toBeVisible();
	await expect(page.getByRole("region", { name: "Timeline" })).toBeVisible();
	await expect(page.getByText(timelineText)).toBeVisible();
});
