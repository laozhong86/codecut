import { describe, expect, test } from "bun:test";

import { parseControlledSubtitles } from "../controlled-import";

describe("parseControlledSubtitles", () => {
	test("parses strict SRT cues", () => {
		const captions = parseControlledSubtitles({
			format: "srt",
			content: [
				"1",
				"00:00:01,250 --> 00:00:03,500",
				"First line",
				"Second line",
				"",
				"2",
				"00:00:04,000 --> 00:00:05,500",
				"Next cue",
				"",
			].join("\n"),
		});

		expect(captions).toEqual([
			{ text: "First line\nSecond line", startTime: 1.25, duration: 2.25 },
			{ text: "Next cue", startTime: 4, duration: 1.5 },
		]);
	});

	test("rejects SRT overlap and HTML styling", () => {
		expect(() =>
			parseControlledSubtitles({
				format: "srt",
				content: [
					"1",
					"00:00:01,000 --> 00:00:03,000",
					"<b>Styled</b>",
					"",
				].join("\n"),
			}),
		).toThrow("SRT subtitle text cannot contain HTML-like tags");

		expect(() =>
			parseControlledSubtitles({
				format: "srt",
				content: [
					"1",
					"00:00:01,000 --> 00:00:03,000",
					"First",
					"",
					"2",
					"00:00:02,500 --> 00:00:04,000",
					"Overlap",
					"",
				].join("\n"),
			}),
		).toThrow("SRT cues must not overlap");
	});

	test("rejects SRT timestamps with out-of-range minute or second fields", () => {
		expect(() =>
			parseControlledSubtitles({
				format: "srt",
				content: [
					"1",
					"00:60:01,000 --> 00:60:03,000",
					"Bad minutes",
				].join("\n"),
			}),
		).toThrow("Invalid SRT timestamp at cue 1");

		expect(() =>
			parseControlledSubtitles({
				format: "srt",
				content: [
					"1",
					"00:00:60,000 --> 00:01:02,000",
					"Bad seconds",
				].join("\n"),
			}),
		).toThrow("Invalid SRT timestamp at cue 1");
	});

	test("parses strict ASS Default-style dialogues", () => {
		const captions = parseControlledSubtitles({
			format: "ass",
			content: [
				"[Script Info]",
				"ScriptType: v4.00+",
				"",
				"[Events]",
				"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
				"Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,First\\NSecond",
			].join("\n"),
		});

		expect(captions).toEqual([
			{ text: "First\nSecond", startTime: 1, duration: 2.5 },
		]);
	});

	test("rejects ASS override blocks and unsupported styles", () => {
		expect(() =>
			parseControlledSubtitles({
				format: "ass",
				content: [
					"[Events]",
					"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
					"Dialogue: 0,0:00:01.00,0:00:03.00,Fancy,,0,0,0,,Styled",
				].join("\n"),
			}),
		).toThrow("ASS dialogue style must be Default");

		expect(() =>
			parseControlledSubtitles({
				format: "ass",
				content: [
					"[Events]",
					"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
					"Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\b1}Styled",
				].join("\n"),
			}),
		).toThrow("ASS override blocks are not supported");
	});

	test("accepts non-overlapping ASS dialogues that are not chronologically ordered", () => {
		const captions = parseControlledSubtitles({
			format: "ass",
			content: [
				"[Events]",
				"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
				"Dialogue: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,Later",
				"Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Earlier",
			].join("\n"),
		});

		expect(captions).toEqual([
			{ text: "Later", startTime: 4, duration: 1 },
			{ text: "Earlier", startTime: 1, duration: 1 },
		]);
	});

	test("rejects ASS timestamps with out-of-range minute or second fields", () => {
		expect(() =>
			parseControlledSubtitles({
				format: "ass",
				content: [
					"[Events]",
					"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
					"Dialogue: 0,0:60:01.00,0:60:03.00,Default,,0,0,0,,Bad minutes",
				].join("\n"),
			}),
		).toThrow("Invalid ASS timestamp at dialogue 1");

		expect(() =>
			parseControlledSubtitles({
				format: "ass",
				content: [
					"[Events]",
					"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
					"Dialogue: 0,0:00:60.00,0:01:02.00,Default,,0,0,0,,Bad seconds",
				].join("\n"),
			}),
		).toThrow("Invalid ASS timestamp at dialogue 1");
	});
});
