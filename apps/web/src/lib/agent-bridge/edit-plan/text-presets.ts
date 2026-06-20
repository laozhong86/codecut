import type { buildTextElement } from "@/lib/timeline/element-utils";
import type {
	EditPlan,
	EditPlanCaptionStyle,
	EditPlanTextStylePreset,
} from "./schema";

type TextElementRaw = Parameters<typeof buildTextElement>[0]["raw"];

function getCaptionBoxWidth({
	aspectRatio,
}: {
	aspectRatio: EditPlan["target"]["aspectRatio"];
}): number {
	if (aspectRatio === "9:16") return 42;
	if (aspectRatio === "1:1") return 72;
	return 120;
}

function getTitleBoxWidth({
	aspectRatio,
}: {
	aspectRatio: EditPlan["target"]["aspectRatio"];
}): number {
	if (aspectRatio === "9:16") return 52;
	if (aspectRatio === "1:1") return 78;
	return 128;
}

export function resolveTitleStylePreset({
	preset,
	aspectRatio,
}: {
	preset: EditPlanTextStylePreset;
	aspectRatio: EditPlan["target"]["aspectRatio"];
}): TextElementRaw {
	if (preset === "lower_title") {
		return {
			fontFamily: "Inter",
			fontSize: 8,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "transparent",
			stroke: { color: "#000000", width: 3 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 4 },
			boxWidth: getTitleBoxWidth({ aspectRatio }),
			transform: {
				scale: 1,
				position: { x: 0, y: 180 },
				rotate: 0,
			},
		};
	}

	return {
		fontFamily: "Inter",
		fontSize: 10,
		fontWeight: "bold",
		color: "#ffffff",
		backgroundColor: "#000000",
		backgroundOpacity: 0.72,
		backgroundPaddingX: 28,
		backgroundPaddingY: 14,
		backgroundBorderRadius: 10,
		boxWidth: getTitleBoxWidth({ aspectRatio }),
		transform: {
			scale: 1,
			position: { x: 0, y: -420 },
			rotate: 0,
		},
	};
}

export function resolveCaptionStylePreset({
	captionStyle,
	aspectRatio,
}: {
	captionStyle: EditPlanCaptionStyle;
	aspectRatio: EditPlan["target"]["aspectRatio"];
}): TextElementRaw {
	const transform = {
		scale: 1,
		position:
			captionStyle.position === "lower-safe"
				? { x: 0, y: 300 }
				: { x: 0, y: 0 },
		rotate: 0,
	};
	const boxWidth = getCaptionBoxWidth({ aspectRatio });

	if (captionStyle.preset === "black-bar") {
		return {
			fontFamily: "Inter",
			fontSize: 5,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "#000000",
			backgroundOpacity: 0.78,
			backgroundPaddingX: 24,
			backgroundPaddingY: 12,
			backgroundBorderRadius: 8,
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "keyword_caption") {
		return {
			fontFamily: "Inter",
			fontSize: 6,
			fontWeight: "bold",
			color: "#ffd84d",
			backgroundColor: "transparent",
			stroke: { color: "#000000", width: 3 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 4 },
			boxWidth,
			transform,
		};
	}

	return {
		fontFamily: "Inter",
		fontSize: 6,
		fontWeight: "bold",
		color: "#ffffff",
		backgroundColor: "transparent",
		stroke: { color: "#000000", width: 3 },
		shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 4 },
		boxWidth,
		transform,
	};
}
