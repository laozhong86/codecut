import { describe, expect, test } from "bun:test";
import {
	auditCaptions,
	CAPTION_QUALITY_MAX_DURATION_SECONDS,
	CAPTION_QUALITY_MIN_DURATION_SECONDS,
} from "../caption-quality";

const captionStyle = {
	preset: "talking-head-pop",
	position: "lower-safe",
	size: "medium",
} as const;

const layout = {
	captionStyle,
	aspectRatio: "9:16" as const,
	canvasSize: { width: 1080, height: 1920 },
	timelineDuration: 12,
};

describe("auditCaptions", () => {
	test("passes readable non-overlapping captions", () => {
		const report = auditCaptions({
			...layout,
			captions: [
				{ text: "第一句", startTime: 0, duration: 1 },
				{ text: "A clear caption.", startTime: 1.2, duration: 1.5 },
			],
		});

		expect(report).toMatchObject({
			ok: true,
			issueCount: 0,
			metrics: {
				captionCount: 2,
				minDuration: 1,
				maxDuration: 1.5,
			},
		});
	});

	test("passes mixed Chinese real-estate captions with decimal values", () => {
		const report = auditCaptions({
			...layout,
			captions: [
				{ text: "建面117.55平", startTime: 0, duration: 1.2 },
				{ text: "预算1,000万以内", startTime: 1.3, duration: 1.2 },
			],
		});

		expect(report).toMatchObject({
			ok: true,
			issueCount: 0,
		});
	});

	test("fails captions below the minimum readable duration", () => {
		const report = auditCaptions({
			...layout,
			captions: [
				{
					text: "Too fast",
					startTime: 0,
					duration: CAPTION_QUALITY_MIN_DURATION_SECONDS - 0.1,
				},
			],
		});

		expect(report).toMatchObject({
			ok: false,
			issues: [
				{
					code: "caption_too_short",
					path: "captions[0].duration",
				},
			],
		});
	});

	test("fails captions above the maximum readable duration", () => {
		const report = auditCaptions({
			...layout,
			captions: [
				{
					text: "Too slow",
					startTime: 0,
					duration: CAPTION_QUALITY_MAX_DURATION_SECONDS + 0.1,
				},
			],
		});

		expect(report).toMatchObject({
			ok: false,
			issues: [
				{
					code: "caption_too_long",
					path: "captions[0].duration",
				},
			],
		});
	});

	test("fails overlapping captions", () => {
		const report = auditCaptions({
			...layout,
			captions: [
				{ text: "First", startTime: 0, duration: 1 },
				{ text: "Second", startTime: 0.9, duration: 1 },
			],
		});

		expect(report).toMatchObject({
			ok: false,
			issues: [
				{
					code: "caption_overlap",
					path: "captions[1].startTime",
				},
			],
		});
	});

	test("fails captions beyond the timeline duration", () => {
		const report = auditCaptions({
			...layout,
			captions: [
				{
					text: "Out of range",
					startTime: 11,
					duration: 2,
				},
			],
		});

		expect(report).toMatchObject({
			ok: false,
			issues: [
				{
					code: "caption_outside_timeline",
					path: "captions[0]",
				},
			],
		});
	});

	test("fails captions that cannot fit the preset line limits", () => {
		const report = auditCaptions({
			...layout,
			captions: [
				{
					text: "你在平台上认识的资源是冲着平台来的但是离开以后就没有了",
					startTime: 0,
					duration: 1,
				},
			],
		});

		expect(report).toMatchObject({
			ok: false,
			issues: [
				{
					code: "caption_line_break_failed",
					path: "captions[0].text",
				},
			],
		});
	});
});
