import { describe, expect, test } from "bun:test";
import type { MediaAsset } from "@/types/assets";
import { validateEditPlan } from "../validate";

function mediaAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
	return {
		id: "media-1",
		name: "Long interview.mp4",
		type: "video",
		duration: 120,
		width: 1920,
		height: 1080,
		file: new File(["video"], "long-interview.mp4", { type: "video/mp4" }),
		...overrides,
	};
}

function validPlan() {
	return {
		version: 1,
		projectId: "project-1",
		sourceMediaId: "media-1",
		target: {
			durationSec: 30,
			aspectRatio: "9:16",
		},
		clips: [
			{
				id: "clip-1",
				sourceStart: 10,
				sourceEnd: 25,
				timelineStart: 0,
				reason: "Sets up the core point.",
			},
			{
				id: "clip-2",
				sourceStart: 50,
				sourceEnd: 65,
				timelineStart: 15,
				reason: "Gives the concrete example.",
			},
		],
		title: {
			text: "The key insight",
			startTime: 0,
			duration: 3,
		},
		captions: [
			{
				text: "This is the key insight.",
				startTime: 0,
				duration: 2,
			},
		],
		rationale: "Combines setup and proof into a short clip.",
	};
}

describe("validateEditPlan", () => {
	test("accepts a valid Codex edit plan", () => {
		const result = validateEditPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toMatchObject({
			success: true,
			normalizedPlan: {
				projectId: "project-1",
				sourceMediaId: "media-1",
			},
		});
	});

	test("rejects a plan for another project", () => {
		const result = validateEditPlan({
			plan: { ...validPlan(), projectId: "other-project" },
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan projectId does not match the active project.",
			path: "projectId",
		});
	});

	test("rejects a missing source media asset", () => {
		const result = validateEditPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: [],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan sourceMediaId was not found in the project media library.",
			path: "sourceMediaId",
		});
	});

	test("rejects image media as an edit source", () => {
		const result = validateEditPlan({
			plan: validPlan(),
			projectId: "project-1",
			mediaAssets: [mediaAsset({ type: "image", duration: 120 })],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan source media must be video or audio.",
			path: "sourceMediaId",
		});
	});

	test("rejects clip ranges with sourceEnd before sourceStart", () => {
		const plan = validPlan();
		plan.clips[0] = {
			...plan.clips[0],
			sourceStart: 25,
			sourceEnd: 10,
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan clip sourceEnd must be greater than sourceStart.",
			path: "clips[0]",
		});
	});

	test("rejects clip ranges beyond the source media duration", () => {
		const plan = validPlan();
		plan.clips[1] = {
			...plan.clips[1],
			sourceEnd: 130,
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan clip sourceEnd exceeds source media duration.",
			path: "clips[1].sourceEnd",
		});
	});

	test("rejects clip totals that miss target duration tolerance", () => {
		const plan = {
			...validPlan(),
			target: { durationSec: 60, aspectRatio: "9:16" },
		};

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan clip duration total is outside the target tolerance.",
			path: "target.durationSec",
		});
	});

	test("rejects captions that exceed the generated timeline", () => {
		const plan = validPlan();
		plan.captions = [
			{
				text: "This caption is outside the edited timeline.",
				startTime: 29,
				duration: 4,
			},
		];

		const result = validateEditPlan({
			plan,
			projectId: "project-1",
			mediaAssets: [mediaAsset()],
		});

		expect(result).toEqual({
			success: false,
			message: "EditPlan caption exceeds the generated timeline duration.",
			path: "captions[0]",
		});
	});
});
