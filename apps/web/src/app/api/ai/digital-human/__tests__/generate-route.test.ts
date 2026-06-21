import { describe, expect, test } from "bun:test";
import { parseDigitalHumanGenerateFormData } from "../generate/route";

function validFormData(overrides: Record<string, string | File> = {}): FormData {
	const formData = new FormData();
	formData.set(
		"image",
		new File(["image"], "portrait.png", { type: "image/png" }),
	);
	formData.set(
		"audio",
		new File(["audio"], "voice.mp3", { type: "audio/mpeg" }),
	);
	formData.set("scriptText", "欢迎来到今天的口播");
	formData.set("motionPrompt", "女人自然点头微笑");
	formData.set("width", "1280");
	formData.set("height", "720");
	formData.set("fps", "25");
	for (const [key, value] of Object.entries(overrides)) {
		formData.set(key, value);
	}
	return formData;
}

describe("digital human generate route", () => {
	test("parses valid RunningHub generation form data", () => {
		const parsed = parseDigitalHumanGenerateFormData({
			formData: validFormData(),
		});

		expect(parsed.imageFile.type).toBe("image/png");
		expect(parsed.audioFile.type).toBe("audio/mpeg");
		expect(parsed.request).toMatchObject({
			scriptText: "欢迎来到今天的口播",
			motionPrompt: "女人自然点头微笑",
			width: 1280,
			height: 720,
			fps: 25,
		});
	});

	test("rejects unsupported upload file types", () => {
		expect(() =>
			parseDigitalHumanGenerateFormData({
				formData: validFormData({
					image: new File(["html"], "portrait.html", { type: "text/html" }),
				}),
			}),
		).toThrow("Image file type is not supported");
		expect(() =>
			parseDigitalHumanGenerateFormData({
				formData: validFormData({
					audio: new File(["video"], "voice.mp4", { type: "video/mp4" }),
				}),
			}),
		).toThrow("Audio file type is not supported");
	});

	test("rejects empty files and non-finite numeric inputs", () => {
		expect(() =>
			parseDigitalHumanGenerateFormData({
				formData: validFormData({
					audio: new File([], "voice.mp3", { type: "audio/mpeg" }),
				}),
			}),
		).toThrow("Audio file is empty");
		expect(() =>
			parseDigitalHumanGenerateFormData({
				formData: validFormData({ width: "Infinity" }),
			}),
		).toThrow("Invalid digital human generation request");
	});
});
