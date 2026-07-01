import { describe, expect, test } from "bun:test";
import type { TextElement } from "@/types/timeline";
import { TEXT_STYLE_PRESETS } from "../text-style-presets";

function textElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Stats title",
		content: "Tiktok 爆款视频拆解\n2290万播放\n47万点赞",
		richSpans: [],
		fontSize: 4,
		fontFamily: "CodecutYanBoSong",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		startTime: 0,
		duration: 3,
		trimStart: 0,
		trimEnd: 0,
		transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
		opacity: 1,
		...overrides,
	};
}

describe("TEXT_STYLE_PRESETS", () => {
	test("builds a single-layer social stats title with first-line rich styling", () => {
		const preset = TEXT_STYLE_PRESETS.find(
			(candidate) => candidate.id === "social-stats-title",
		);
		if (!preset?.buildStyles) {
			throw new Error("Missing social stats title preset.");
		}

		const styles = preset.buildStyles(textElement());

		expect(styles).toMatchObject({
			color: "#ff8a1c",
			backgroundColor: "#07131f",
			backgroundOpacity: 0.78,
			fontWeight: "bold",
			richSpans: [
				{
					start: 0,
					end: 13,
					color: "#ffffff",
					fontScale: 0.84,
					fontWeight: "bold",
				},
			],
		});
	});
});
