import { describe, expect, test } from "bun:test";
import { resolveVideoTemplate } from "../resolve";

describe("resolveVideoTemplate", () => {
	test("routes talking-head cleanup requests to talking-head-short", () => {
		const result = resolveVideoTemplate({
			userIntent: "帮我把这段口播去废话，剪得紧凑一点",
			materialFacts: { hasTranscript: true },
		});

		expect(result).toMatchObject({
			success: true,
			template: { id: "talking-head-short" },
		});
	});

	test("routes tutorial and software demo requests to tutorial-demo", () => {
		const result = resolveVideoTemplate({
			userIntent: "把这个软件演示剪成教程，步骤要讲清楚",
			materialFacts: { hasTranscript: true, hasVisualProof: true },
		});

		expect(result).toMatchObject({
			success: true,
			template: { id: "tutorial-demo" },
		});
	});

	test("routes product conversion requests to product-proof-ad", () => {
		const result = resolveVideoTemplate({
			userIntent: "剪一个带货 UGC 广告，突出商品证明和转化",
			materialFacts: {
				hasTranscript: true,
				hasVisualProof: true,
				hasProductFacts: true,
			},
		});

		expect(result).toMatchObject({
			success: true,
			template: { id: "product-proof-ad" },
		});
	});

	test("routes existing narration and visual B-roll requests to narrated-broll", () => {
		const result = resolveVideoTemplate({
			userIntent: "用已有旁白和图片 B-roll 做一个讲解混剪",
			materialFacts: {
				hasExistingNarrationAudio: true,
				hasVisualBroll: true,
			},
		});

		expect(result).toMatchObject({
			success: true,
			template: { id: "narrated-broll" },
		});
	});

	test("prioritizes product proof over tutorial and talking-head wording", () => {
		const result = resolveVideoTemplate({
			userIntent: "这段口播教程要剪成商品 UGC 广告，强调转化",
			materialFacts: {
				hasTranscript: true,
				hasVisualProof: true,
				hasProductFacts: true,
			},
		});

		expect(result).toMatchObject({
			success: true,
			template: { id: "product-proof-ad" },
		});
	});

	test("fails fast when required evidence is missing", () => {
		const result = resolveVideoTemplate({
			userIntent: "剪一个商品带货广告",
			materialFacts: { hasTranscript: true },
		});

		expect(result).toEqual({
			success: false,
			templateId: "product-proof-ad",
			message:
				"Video template product-proof-ad requires visual-proof and product-facts.",
			missingEvidence: ["visual-proof", "product-facts"],
		});
	});

	test("does not downgrade narrated-broll when narration audio is missing", () => {
		const result = resolveVideoTemplate({
			userIntent: "用旁白和 B-roll 做混剪",
			materialFacts: { hasVisualBroll: true },
		});

		expect(result).toEqual({
			success: false,
			templateId: "narrated-broll",
			message:
				"Video template narrated-broll requires existing-narration-audio.",
			missingEvidence: ["existing-narration-audio"],
		});
	});
});
