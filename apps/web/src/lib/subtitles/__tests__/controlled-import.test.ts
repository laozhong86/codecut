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
});
