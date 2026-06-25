import { expect, test } from "@playwright/test";

const executorToken = "playwright-smoke";
const projectId = "playwright-editor-keyframes";
const projectName = "Playwright keyframe editor";
const timelineText = "Animated keyframe title";
let editorUrl = "";

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
	const createdProject = await createResponse.json();
	editorUrl = createdProject.editorUrl;

	const commandResponse = await request.post("/api/codex-executor/commands", {
		headers: { authorization: `Bearer ${executorToken}` },
		data: {
			envelope: {
				version: 1,
				projectId,
				source: "codex",
				commands: [
					{
						id: "cmd-add-keyframe-title",
						tool: "add_texts",
						args: {
							entries: [
								{
									startTime: 0,
									duration: 4,
									content: timelineText,
									name: "Keyframe title",
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

test("editor adds visual keyframes and renders a timeline marker", async ({
	page,
}) => {
	await page.goto(editorUrl);

	await expect(page.getByRole("textbox")).toHaveValue(projectName);
	await expect(page.getByRole("status", { name: /Codex executor succeeded/ }))
		.toBeVisible();
	await page.getByText(timelineText).first().click();

	const opacityToggle = page.getByRole("button", {
		name: "Toggle opacity keyframe",
	});
	await expect(opacityToggle).toBeVisible();

	await opacityToggle.click();
	await page.getByRole("button", { name: "Toggle position keyframe" }).click();
	await page.getByRole("button", { name: "Toggle scale keyframe" }).click();
	await page.getByRole("button", { name: "Toggle rotation keyframe" }).click();

	await expect(opacityToggle).toHaveAttribute("aria-pressed", "true");
	await expect(page.getByTestId("timeline-keyframe-marker")).toHaveCount(1);

	await page.getByLabel("Opacity percentage").fill("50");
	await page.keyboard.press("Tab");
	await expect(opacityToggle).toHaveAttribute("aria-pressed", "true");

	await page.getByRole("button", { name: "Play" }).click();
	await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
});
