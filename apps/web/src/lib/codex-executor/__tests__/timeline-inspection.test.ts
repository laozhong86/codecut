import { stat, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import type { ExecutorProjectState } from "../executor";
import { inspectTimelineWithNodeRenderer } from "../timeline-inspection";

describe("inspectTimelineWithNodeRenderer text motion", () => {
	test("renders sampled frames for motion text without mutating state", async () => {
		const outputDirectory = await mkdtemp(
			join(tmpdir(), "codecut-text-motion-inspect-"),
		);
		const state: ExecutorProjectState = {
			version: 1,
			revision: 1,
			browserBridgeToken: "token",
			project: {
				id: "project-1",
				name: "Motion Inspect",
				settings: {
					canvasSize: { width: 360, height: 640 },
					fps: 30,
					background: { type: "color", color: "#111827" },
				},
				createdAt: "2026-06-24T00:00:00.000Z",
				updatedAt: "2026-06-24T00:00:00.000Z",
			},
			tracks: [
				{
					id: "track-text",
					type: "text",
					name: "Text",
					hidden: false,
					elements: [
						{
							id: "text-1",
							type: "text",
							name: "Motion title",
							content: "STOP",
							richSpans: [],
							startTime: 0,
							duration: 1.2,
							trimStart: 0,
							trimEnd: 0,
							fontSize: 10,
							fontFamily: "Arial",
							color: "#ffffff",
							backgroundColor: "transparent",
							textAlign: "center",
							fontWeight: "bold",
							fontStyle: "normal",
							textDecoration: "none",
							transform: {
								scale: 1,
								position: { x: 0, y: -180 },
								rotate: 0,
							},
							opacity: 1,
							motionPreset: "slam-in",
							keyframes: {
								opacity: [
									{ time: 0, value: 0, interpolation: "ease-out" },
									{ time: 0.12, value: 1 },
								],
							},
						},
					],
				},
			],
			mediaAssets: [],
			derivedAssets: [],
		};
		const originalState = structuredClone(state);

		const result = await inspectTimelineWithNodeRenderer({
			state,
			mediaAssets: [],
			args: { startTime: 0, endTime: 0.6, frameCount: 3 },
			outputDirectory,
		});

		expect(result.frameTimes).toEqual([0, 0.3, 0.6]);
		expect(result.canvasSize).toEqual({ width: 360, height: 640 });
		expect(result.sheetSize).toEqual({ width: 1080, height: 640 });
		expect((await stat(result.artifactPath)).size).toBeGreaterThan(0);
		expect(state).toEqual(originalState);
	});
});
