import type { buildTextElement } from "@/lib/timeline/element-utils";
import {
	CODECUT_CJK_FONT_FAMILY,
	CODECUT_SMILEY_SANS_FONT_FAMILY,
	CODECUT_WEN_KAI_FONT_FAMILY,
	CODECUT_YAN_BO_SONG_FONT_FAMILY,
} from "@/lib/codecut-fonts";
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
	if (aspectRatio === "9:16") return 44;
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

function getLowerSafeCaptionY({
	aspectRatio,
}: {
	aspectRatio: EditPlan["target"]["aspectRatio"];
}): number {
	if (aspectRatio === "9:16") return 520;
	if (aspectRatio === "1:1") return 360;
	return 320;
}

export function resolveTitleStylePreset({
	preset,
	aspectRatio,
}: {
	preset: EditPlanTextStylePreset;
	aspectRatio: EditPlan["target"]["aspectRatio"];
}): TextElementRaw {
	const boxWidth = getTitleBoxWidth({ aspectRatio });

	if (preset === "lower_title") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 8,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "transparent",
			stroke: { color: "#000000", width: 3 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 4 },
			boxWidth,
			transform: {
				scale: 1,
				position: { x: 0, y: 180 },
				rotate: 0,
			},
		};
	}

	if (preset === "social_hook") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 11,
			fontWeight: "bold",
			color: "#ffe45c",
			backgroundColor: "transparent",
			stroke: { color: "#111111", width: 4 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 3, blur: 6 },
			boxWidth,
			transform: {
				scale: 1,
				position: { x: 0, y: -500 },
				rotate: 0,
			},
		};
	}

	if (preset === "product_badge") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 7,
			fontWeight: "bold",
			color: "#111827",
			backgroundColor: "#ffe45c",
			backgroundOpacity: 0.9,
			backgroundPaddingX: 24,
			backgroundPaddingY: 12,
			backgroundBorderRadius: 12,
			shadow: { color: "#000000", offsetX: 0, offsetY: 3, blur: 6 },
			boxWidth,
			transform: {
				scale: 1,
				position: { x: 0, y: -330 },
				rotate: 0,
			},
		};
	}

	if (preset === "chapter_bumper") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 8.5,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "#111827",
			backgroundOpacity: 0.78,
			backgroundPaddingX: 28,
			backgroundPaddingY: 14,
			backgroundBorderRadius: 8,
			stroke: { color: "#2563eb", width: 1.5 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 6 },
			boxWidth,
			transform: {
				scale: 1,
				position: { x: 0, y: 0 },
				rotate: 0,
			},
		};
	}

	if (preset === "hook_title") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 10,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "#000000",
			backgroundOpacity: 0.72,
			backgroundPaddingX: 28,
			backgroundPaddingY: 14,
			backgroundBorderRadius: 10,
			boxWidth,
			transform: {
				scale: 1,
				position: { x: 0, y: -420 },
				rotate: 0,
			},
		};
	}

	const exhaustivePreset: never = preset;
	throw new Error(`Unsupported title style preset: ${exhaustivePreset}`);
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
				? { x: 0, y: getLowerSafeCaptionY({ aspectRatio }) }
				: { x: 0, y: 0 },
		rotate: 0,
	};
	const boxWidth = getCaptionBoxWidth({ aspectRatio });

	if (captionStyle.preset === "creator-clean") {
		return {
			fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
			fontSize: 5.2,
			fontWeight: "normal",
			color: "#ffffff",
			backgroundColor: "transparent",
			shadow: { color: "rgba(0,0,0,0.42)", offsetX: 0, offsetY: 2, blur: 6 },
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "black-bar") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
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

	if (captionStyle.preset === "talking-head-pop") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 5.2,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "#0f172a",
			backgroundOpacity: 0.42,
			backgroundPaddingX: 24,
			backgroundPaddingY: 12,
			backgroundBorderRadius: 8,
			shadow: { color: "rgba(0,0,0,0.72)", offsetX: 0, offsetY: 3, blur: 10 },
			boxWidth: Math.max(boxWidth, 50),
			transform,
		};
	}

	if (captionStyle.preset === "tutorial-clean") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 5,
			fontWeight: "normal",
			color: "#ffffff",
			backgroundColor: "#111827",
			backgroundOpacity: 0.68,
			backgroundPaddingX: 18,
			backgroundPaddingY: 10,
			backgroundBorderRadius: 6,
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "documentary-soft") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 5,
			fontWeight: "bold",
			color: "#f8fafc",
			stroke: { color: "#0f172a", width: 2 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 5 },
			backgroundColor: "transparent",
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "product-punch") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 6,
			fontWeight: "bold",
			color: "#ffe45c",
			stroke: { color: "#111111", width: 4 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 3, blur: 6 },
			backgroundColor: "transparent",
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "lifestyle-warm") {
		return {
			fontFamily: CODECUT_WEN_KAI_FONT_FAMILY,
			fontSize: 5.4,
			fontWeight: "normal",
			color: "#fff7ed",
			backgroundColor: "#7c2d12",
			backgroundOpacity: 0.54,
			backgroundPaddingX: 20,
			backgroundPaddingY: 10,
			backgroundBorderRadius: 8,
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "cinematic-serif") {
		return {
			fontFamily: CODECUT_YAN_BO_SONG_FONT_FAMILY,
			fontSize: 5.1,
			fontWeight: "normal",
			color: "#f8fafc",
			shadow: { color: "rgba(0,0,0,0.58)", offsetX: 0, offsetY: 2, blur: 8 },
			backgroundColor: "#111827",
			backgroundOpacity: 0.32,
			backgroundPaddingX: 20,
			backgroundPaddingY: 10,
			backgroundBorderRadius: 6,
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "short-form-bold") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
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

	if (captionStyle.preset === "social-highlight") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 5.6,
			fontWeight: "bold",
			color: "#ffffff",
			backgroundColor: "#2563eb",
			backgroundOpacity: 0.86,
			backgroundPaddingX: 22,
			backgroundPaddingY: 10,
			backgroundBorderRadius: 10,
			stroke: { color: "#0f172a", width: 2 },
			shadow: { color: "#000000", offsetX: 0, offsetY: 2, blur: 5 },
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "comment-bubble") {
		return {
			fontFamily: CODECUT_CJK_FONT_FAMILY,
			fontSize: 5.2,
			fontWeight: "bold",
			color: "#111827",
			backgroundColor: "#ffffff",
			backgroundOpacity: 0.92,
			backgroundPaddingX: 24,
			backgroundPaddingY: 12,
			backgroundBorderRadius: 12,
			shadow: { color: "#000000", offsetX: 0, offsetY: 3, blur: 8 },
			boxWidth,
			transform,
		};
	}

	if (captionStyle.preset === "minimal-reel") {
		return {
			fontFamily: CODECUT_SMILEY_SANS_FONT_FAMILY,
			fontSize: 4.6,
			fontWeight: "normal",
			color: "#f8fafc",
			backgroundColor: "#0f172a",
			backgroundOpacity: 0.38,
			backgroundPaddingX: 18,
			backgroundPaddingY: 8,
			backgroundBorderRadius: 6,
			shadow: { color: "rgba(0,0,0,0.64)", offsetX: 0, offsetY: 2, blur: 8 },
			boxWidth,
			transform,
		};
	}

	const exhaustivePreset: never = captionStyle.preset;
	throw new Error(`Unsupported caption style preset: ${exhaustivePreset}`);
}
