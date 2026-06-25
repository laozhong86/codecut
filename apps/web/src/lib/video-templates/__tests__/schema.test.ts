import { describe, expect, test } from "bun:test";
import { VideoTemplateManifestSchema } from "../schema";

function validTemplate() {
	return {
		id: "talking-head-short",
		label: "Talking-head short",
		intent: "Tighten a talking-head source into a short-form draft.",
		requiredEvidence: ["transcript"],
		defaultStructure: [
			"hook",
			"strongest statement",
			"supporting beats",
			"loop/CTA",
		],
		captionPreset: "talking-head-pop",
		executionPath: "speech-cleanup-to-edit-plan-v1",
		stopConditions: ["Transcript is missing."],
		verification: [
			"apply_edit_plan succeeds",
			"get_timeline_state verifies clips",
		],
	};
}

describe("VideoTemplateManifestSchema", () => {
	test("accepts a valid planning-only video template manifest", () => {
		const result = VideoTemplateManifestSchema.safeParse(validTemplate());

		expect(result.success).toBe(true);
	});

	test("rejects unsupported caption presets", () => {
		const result = VideoTemplateManifestSchema.safeParse({
			...validTemplate(),
			captionPreset: "karaoke",
		});

		expect(result.success).toBe(false);
	});

	test("rejects unknown execution paths", () => {
		const result = VideoTemplateManifestSchema.safeParse({
			...validTemplate(),
			executionPath: "template-marketplace",
		});

		expect(result.success).toBe(false);
	});

	test("rejects fallbackTemplateId because templates must fail fast", () => {
		const result = VideoTemplateManifestSchema.safeParse({
			...validTemplate(),
			fallbackTemplateId: "talking-head-short",
		});

		expect(result.success).toBe(false);
	});

	test("requires product-proof-ad to declare product facts and visual proof", () => {
		const result = VideoTemplateManifestSchema.safeParse({
			...validTemplate(),
			id: "product-proof-ad",
			label: "Product proof ad",
			requiredEvidence: ["transcript"],
			captionPreset: "product-punch",
			executionPath: "edit-plan-v1",
		});

		expect(result.success).toBe(false);
	});

	test("requires narrated-broll to use NarratedRemixPlan v1 path", () => {
		const result = VideoTemplateManifestSchema.safeParse({
			...validTemplate(),
			id: "narrated-broll",
			label: "Narrated B-roll",
			requiredEvidence: ["existing-narration-audio", "video-broll"],
			captionPreset: "documentary-soft",
			executionPath: "edit-plan-v1",
		});

		expect(result.success).toBe(false);
	});
});
