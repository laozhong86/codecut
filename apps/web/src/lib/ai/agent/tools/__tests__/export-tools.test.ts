import { describe, expect, test } from "bun:test";
import { getToolByName } from "../index";

describe("export agent tool", () => {
	test("registers export_project for bridge automation", () => {
		const tool = getToolByName({ name: "export_project" });

		expect(tool?.name).toBe("export_project");
	});

	test("rejects invalid export arguments before touching editor runtime", async () => {
		const tool = getToolByName({ name: "export_project" });
		const result = await tool?.execute({
			format: "gif",
			quality: "high",
			includeAudio: true,
			download: true,
		});

		expect(result).toMatchObject({
			success: false,
			message: "format must be one of: mp4, webm",
		});
	});
});
