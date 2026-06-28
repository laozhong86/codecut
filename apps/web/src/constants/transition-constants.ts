import type { TransitionType } from "@/types/timeline";

export interface TransitionPreset {
	type: TransitionType;
	label: string;
	category: "fade" | "wipe" | "slide" | "zoom" | "cinematic" | "effect";
}

export const TRANSITION_PRESETS: TransitionPreset[] = [
	{ type: "fade", label: "Fade", category: "fade" },
	{ type: "dissolve", label: "Dissolve", category: "fade" },
	{ type: "wipe-left", label: "Wipe Left", category: "wipe" },
	{ type: "wipe-right", label: "Wipe Right", category: "wipe" },
	{ type: "wipe-up", label: "Wipe Up", category: "wipe" },
	{ type: "wipe-down", label: "Wipe Down", category: "wipe" },
	{ type: "slide-left", label: "Slide Left", category: "slide" },
	{ type: "slide-right", label: "Slide Right", category: "slide" },
	{ type: "slide-up", label: "Slide Up", category: "slide" },
	{ type: "slide-down", label: "Slide Down", category: "slide" },
	{ type: "zoom-in", label: "Zoom In", category: "zoom" },
	{ type: "zoom-out", label: "Zoom Out", category: "zoom" },
	{ type: "blur-crossfade", label: "Blur Crossfade", category: "cinematic" },
	{ type: "flash-white", label: "Flash White", category: "cinematic" },
	{ type: "push-soft", label: "Push Soft", category: "cinematic" },
	{ type: "whip-pan-left", label: "Whip Pan Left", category: "effect" },
	{ type: "whip-pan-right", label: "Whip Pan Right", category: "effect" },
	{ type: "cinematic-zoom", label: "Cinematic Zoom", category: "cinematic" },
	{ type: "chromatic-split", label: "Chromatic Split", category: "effect" },
];

export const DEFAULT_TRANSITION_DURATION = 0.5;

export const TRANSITION_CATEGORIES = [
	"fade",
	"wipe",
	"slide",
	"zoom",
	"cinematic",
	"effect",
] as const;

export const TRANSITION_CATEGORY_LABELS: Record<
	(typeof TRANSITION_CATEGORIES)[number],
	string
> = {
	fade: "Fade",
	wipe: "Wipe",
	slide: "Slide",
	zoom: "Zoom",
	cinematic: "Cinematic",
	effect: "Effect",
};
