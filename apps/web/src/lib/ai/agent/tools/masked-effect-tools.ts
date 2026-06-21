import { EditorCore } from "@/core";
import {
	createHumanPipEffect,
	createTextBackgroundEffect,
	requireHumanPipPlacement,
} from "@/lib/derived-assets/masked-effects";
import { calculateTotalDuration } from "@/lib/timeline";
import type { MediaAsset } from "@/types/assets";
import type { DerivedAsset } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import type { AgentToolResult } from "../types";
import type { AgentTool } from "./types";

interface MaskedEffectEditor {
	project: {
		getDerivedAssets(): DerivedAsset[];
	};
	media: {
		getAssets(): MediaAsset[];
	};
	timeline: {
		getTracks(): TimelineTrack[];
		updateTracks(tracks: TimelineTrack[]): void;
	};
}

function requireString({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} is required`);
	}
	return value;
}

function requireNumber({
	value,
	label,
}: {
	value: unknown;
	label: string;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new Error(`${label} is required`);
	}
	return value;
}

function requireReplaceExisting(value: unknown): boolean {
	if (typeof value !== "boolean") {
		throw new Error("replaceExisting is required");
	}
	return value;
}

function ensureCanReplaceTimeline({
	editor,
	replaceExisting,
}: {
	editor: MaskedEffectEditor;
	replaceExisting: boolean;
}): AgentToolResult | null {
	if (editor.timeline.getTracks().length > 0 && !replaceExisting) {
		return {
			success: false,
			message: "Timeline is not empty. Set replaceExisting=true to replace it.",
		};
	}
	return null;
}

function summarizeEffect({
	effect,
	tracks,
}: {
	effect: "text-background" | "human-pip";
	tracks: TimelineTrack[];
}) {
	return {
		effect,
		trackCount: tracks.length,
		elementCount: tracks.reduce(
			(total, track) => total + track.elements.length,
			0,
		),
		totalDuration: calculateTotalDuration({ tracks }),
	};
}

export function executeCreateTextBackgroundEffectTool({
	args,
	editor,
}: {
	args: Record<string, unknown>;
	editor: MaskedEffectEditor;
}): AgentToolResult {
	try {
		const replaceExisting = requireReplaceExisting(args.replaceExisting);
		const blocked = ensureCanReplaceTimeline({ editor, replaceExisting });
		if (blocked) return blocked;

		const result = createTextBackgroundEffect({
			sourceMediaId: requireString({
				value: args.sourceMediaId,
				label: "sourceMediaId",
			}),
			derivedAssetId: requireString({
				value: args.derivedAssetId,
				label: "derivedAssetId",
			}),
			content: requireString({ value: args.content, label: "content" }),
			startTime: requireNumber({ value: args.startTime, label: "startTime" }),
			duration: requireNumber({ value: args.duration, label: "duration" }),
			mediaAssets: editor.media.getAssets(),
			derivedAssets: editor.project.getDerivedAssets(),
		});

		editor.timeline.updateTracks(result.tracks);
		const summary = summarizeEffect({
			effect: "text-background",
			tracks: result.tracks,
		});
		return {
			success: true,
			message: `Created text-background effect with ${summary.trackCount} track(s).`,
			data: summary,
		};
	} catch (error) {
		return {
			success: false,
			message:
				error instanceof Error
					? error.message
					: "Text-background effect could not be created.",
		};
	}
}

export function executeCreateHumanPipEffectTool({
	args,
	editor,
}: {
	args: Record<string, unknown>;
	editor: MaskedEffectEditor;
}): AgentToolResult {
	try {
		const replaceExisting = requireReplaceExisting(args.replaceExisting);
		const blocked = ensureCanReplaceTimeline({ editor, replaceExisting });
		if (blocked) return blocked;

		const result = createHumanPipEffect({
			foregroundMediaId: requireString({
				value: args.foregroundMediaId,
				label: "foregroundMediaId",
			}),
			backgroundMediaId: requireString({
				value: args.backgroundMediaId,
				label: "backgroundMediaId",
			}),
			derivedAssetId: requireString({
				value: args.derivedAssetId,
				label: "derivedAssetId",
			}),
			placement: requireHumanPipPlacement(
				requireString({
					value: args.placement,
					label: "placement",
				}),
			),
			scale: requireNumber({ value: args.scale, label: "scale" }),
			startTime: requireNumber({ value: args.startTime, label: "startTime" }),
			duration: requireNumber({ value: args.duration, label: "duration" }),
			mediaAssets: editor.media.getAssets(),
			derivedAssets: editor.project.getDerivedAssets(),
		});

		editor.timeline.updateTracks(result.tracks);
		const summary = summarizeEffect({
			effect: "human-pip",
			tracks: result.tracks,
		});
		return {
			success: true,
			message: `Created human-pip effect with ${summary.trackCount} track(s).`,
			data: summary,
		};
	} catch (error) {
		return {
			success: false,
			message:
				error instanceof Error
					? error.message
					: "Human PIP effect could not be created.",
		};
	}
}

export const createTextBackgroundEffectTool: AgentTool = {
	name: "create_text_background_effect",
	description:
		"Create a deterministic text-background masked video effect from an existing person-mask derived asset. This tool does not generate masks or call an LLM.",
	parameters: {
		type: "object",
		properties: {
			sourceMediaId: { type: "string" },
			derivedAssetId: { type: "string" },
			content: { type: "string" },
			startTime: { type: "number" },
			duration: { type: "number" },
			replaceExisting: { type: "boolean" },
		},
		required: [
			"sourceMediaId",
			"derivedAssetId",
			"content",
			"startTime",
			"duration",
			"replaceExisting",
		],
	},
	async execute(args) {
		return executeCreateTextBackgroundEffectTool({
			args,
			editor: EditorCore.getInstance(),
		});
	},
};

export const createHumanPipEffectTool: AgentTool = {
	name: "create_human_pip_effect",
	description:
		"Create a deterministic human picture-in-picture masked video effect from an existing person-mask derived asset. This tool does not generate masks or call an LLM.",
	parameters: {
		type: "object",
		properties: {
			foregroundMediaId: { type: "string" },
			backgroundMediaId: { type: "string" },
			derivedAssetId: { type: "string" },
			placement: {
				type: "string",
				enum: ["right_down", "right_up", "left_down", "left_up", "center"],
			},
			scale: { type: "number" },
			startTime: { type: "number" },
			duration: { type: "number" },
			replaceExisting: { type: "boolean" },
		},
		required: [
			"foregroundMediaId",
			"backgroundMediaId",
			"derivedAssetId",
			"placement",
			"scale",
			"startTime",
			"duration",
			"replaceExisting",
		],
	},
	async execute(args) {
		return executeCreateHumanPipEffectTool({
			args,
			editor: EditorCore.getInstance(),
		});
	},
};

export const maskedEffectTools: AgentTool[] = [
	createTextBackgroundEffectTool,
	createHumanPipEffectTool,
];
