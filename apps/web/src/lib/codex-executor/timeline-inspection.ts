import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { calculateTotalDuration } from "@/lib/timeline";
import { CanvasRenderer } from "@/services/renderer/canvas-renderer";
import { buildScene } from "@/services/renderer/scene-builder";
import type { MediaAsset } from "@/types/assets";
import type { ExecutorProjectState } from "./executor";
import { createNodeRendererRuntime } from "./node-renderer-runtime";

export type InspectTimelineArgs = {
	startTime: number;
	endTime?: number;
	frameCount?: number;
};

function sampleTimes({
	startTime,
	endTime,
	frameCount,
}: Required<InspectTimelineArgs>): number[] {
	if (frameCount === 1) return [startTime];
	const span = endTime - startTime;
	return Array.from({ length: frameCount }, (_, index) =>
		Number((startTime + (span * index) / (frameCount - 1)).toFixed(6)),
	);
}

function safeNumber(value: number) {
	return String(value).replace(/[^0-9.-]/g, "_");
}

function canvasPngBuffer(canvas: unknown): Buffer {
	const target = canvas as {
		toBuffer(type?: string): Buffer;
	};
	return target.toBuffer("image/png");
}

export async function inspectTimelineWithNodeRenderer({
	state,
	mediaAssets,
	args,
	outputDirectory,
}: {
	state: ExecutorProjectState;
	mediaAssets: MediaAsset[];
	args: InspectTimelineArgs;
	outputDirectory: string;
}) {
	const totalDuration = calculateTotalDuration({ tracks: state.tracks });
	if (state.tracks.length === 0 || totalDuration <= 0) {
		throw new Error("Cannot inspect an empty timeline.");
	}
	const startTime = args.startTime;
	const endTime = args.endTime ?? startTime;
	if (endTime < startTime) {
		throw new Error(
			"inspect_timeline endTime must be greater than or equal to startTime.",
		);
	}
	const frameCount = args.frameCount ?? (endTime === startTime ? 1 : 3);
	const times = sampleTimes({ startTime, endTime, frameCount });
	const { width, height } = state.project.settings.canvasSize;
	const runtime = createNodeRendererRuntime();
	const renderer = new CanvasRenderer({
		width,
		height,
		fps: state.project.settings.fps,
		imageSmoothingQuality: "high",
		runtime,
	});
	const scene = buildScene({
		canvasSize: state.project.settings.canvasSize,
		tracks: state.tracks,
		mediaAssets,
		derivedAssets: state.derivedAssets,
		duration: totalDuration,
		background: state.project.settings.background,
	});
	const sheet = createCanvas(width * times.length, height);
	const sheetContext = sheet.getContext("2d");
	if (!sheetContext) {
		throw new Error("Failed to create timeline inspection contact sheet.");
	}

	for (let index = 0; index < times.length; index += 1) {
		const time = Math.min(Math.max(times[index], 0), totalDuration);
		await renderer.render({ node: scene, time });
		sheetContext.drawImage(
			renderer.canvas as never,
			index * width,
			0,
			width,
			height,
		);
	}

	await mkdir(outputDirectory, { recursive: true });
	const artifactPath = join(
		outputDirectory,
		`timeline-${safeNumber(startTime)}-${safeNumber(endTime)}-${frameCount}.png`,
	);
	const png = canvasPngBuffer(sheet);
	if (png.byteLength === 0) {
		throw new Error("Timeline inspection produced an empty PNG.");
	}
	await writeFile(artifactPath, png);
	return {
		artifactPath,
		frameTimes: times,
		canvasSize: { width, height },
		sheetSize: { width: width * times.length, height },
		totalDuration,
	};
}
