import type { TCanvasSize } from "@/types/project";

export type ProjectAspectRatioPresetValue = "16:9" | "9:16" | "1:1" | "4:5";
export type ProjectAspectRatioMenuValue =
	| ProjectAspectRatioPresetValue
	| "original"
	| "custom";

export interface ProjectAspectRatioPreset {
	value: ProjectAspectRatioPresetValue;
	label: string;
	canvasSize: TCanvasSize;
}

export const PROJECT_ASPECT_RATIO_PRESETS = [
	{
		value: "16:9",
		label: "16:9",
		canvasSize: { width: 1920, height: 1080 },
	},
	{
		value: "9:16",
		label: "9:16",
		canvasSize: { width: 1080, height: 1920 },
	},
	{
		value: "1:1",
		label: "1:1",
		canvasSize: { width: 1080, height: 1080 },
	},
	{
		value: "4:5",
		label: "4:5",
		canvasSize: { width: 1080, height: 1350 },
	},
] as const satisfies readonly ProjectAspectRatioPreset[];

function isSameCanvasSize(a: TCanvasSize, b: TCanvasSize): boolean {
	return a.width === b.width && a.height === b.height;
}

export function getProjectAspectRatioPreset({
	value,
}: {
	value: ProjectAspectRatioPresetValue;
}): ProjectAspectRatioPreset {
	const preset = PROJECT_ASPECT_RATIO_PRESETS.find(
		(candidate) => candidate.value === value,
	);
	if (!preset) {
		throw new Error(`Unsupported aspect ratio preset: ${value}`);
	}

	return preset;
}

export function getCanvasSizeForAspectRatioPreset({
	value,
	originalCanvasSize,
}: {
	value: ProjectAspectRatioMenuValue;
	originalCanvasSize?: TCanvasSize | null;
}): TCanvasSize {
	if (value === "original") {
		if (!originalCanvasSize) {
			throw new Error("Original canvas size is not available.");
		}

		return originalCanvasSize;
	}

	if (value === "custom") {
		throw new Error("Custom aspect ratio cannot be applied from a preset.");
	}

	return getProjectAspectRatioPreset({ value }).canvasSize;
}

export function getProjectAspectRatioValue({
	canvasSize,
	originalCanvasSize,
}: {
	canvasSize: TCanvasSize;
	originalCanvasSize?: TCanvasSize | null;
}): ProjectAspectRatioMenuValue {
	if (originalCanvasSize && isSameCanvasSize(canvasSize, originalCanvasSize)) {
		return "original";
	}

	const preset = PROJECT_ASPECT_RATIO_PRESETS.find((candidate) =>
		isSameCanvasSize(candidate.canvasSize, canvasSize),
	);

	return preset?.value ?? "custom";
}
