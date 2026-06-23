import type { TimelineElement } from "@/types/timeline";

export function serializeElementVisualProperties(element: TimelineElement) {
	if (element.type === "text") {
		return {
			style: {
				fontSize: element.fontSize,
				fontFamily: element.fontFamily,
				color: element.color,
				backgroundColor: element.backgroundColor,
				textAlign: element.textAlign,
				fontWeight: element.fontWeight,
				fontStyle: element.fontStyle,
				textDecoration: element.textDecoration,
				richSpans: element.richSpans,
				opacity: element.opacity,
				transform: element.transform,
				...(element.hidden !== undefined ? { hidden: element.hidden } : {}),
				...(element.stroke ? { stroke: element.stroke } : {}),
				...(element.shadow ? { shadow: element.shadow } : {}),
				...(element.boxWidth !== undefined ? { boxWidth: element.boxWidth } : {}),
				...(element.backgroundBorderRadius !== undefined
					? { backgroundBorderRadius: element.backgroundBorderRadius }
					: {}),
				...(element.backgroundOpacity !== undefined
					? { backgroundOpacity: element.backgroundOpacity }
					: {}),
				...(element.backgroundPaddingX !== undefined
					? { backgroundPaddingX: element.backgroundPaddingX }
					: {}),
				...(element.backgroundPaddingY !== undefined
					? { backgroundPaddingY: element.backgroundPaddingY }
					: {}),
			},
		};
	}

	if (
		element.type === "video" ||
		element.type === "image" ||
		element.type === "sticker"
	) {
		return {
			visual: {
				hidden: element.hidden ?? false,
				opacity: element.opacity,
				transform: element.transform,
				...(element.type === "video" ? { muted: element.muted ?? false } : {}),
				...(element.type === "video" && element.playbackRate !== undefined
					? { playbackRate: element.playbackRate }
					: {}),
				...(element.type === "video" && element.reversed !== undefined
					? { reversed: element.reversed }
					: {}),
				...(element.type === "video" && element.mask
					? { mask: element.mask }
					: {}),
				...(element.type === "video" && element.sourceCrop
					? { sourceCrop: element.sourceCrop }
					: {}),
				...(element.type === "sticker" && element.color !== undefined
					? { color: element.color }
					: {}),
			},
		};
	}

	if (element.type === "audio") {
		return {
			audio: {
				sourceType: element.sourceType,
				...("mediaId" in element ? { mediaId: element.mediaId } : {}),
				...("sourceUrl" in element ? { sourceUrl: element.sourceUrl } : {}),
				volume: element.volume,
				muted: element.muted ?? false,
			},
		};
	}

	return {};
}
