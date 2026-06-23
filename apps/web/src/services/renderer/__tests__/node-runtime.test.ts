import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { CanvasRenderer } from "../canvas-renderer";
import { ColorNode } from "../nodes/color-node";
import { createNodeRendererRuntime } from "@/lib/codex-executor/node-renderer-runtime";
import type { RendererCanvas } from "@/services/renderer/runtime";

const guardedGlobals = ["document", "window", "OffscreenCanvas"] as const;
const originalDescriptors = new Map<
	(typeof guardedGlobals)[number],
	PropertyDescriptor | undefined
>();

function installBrowserGlobalGuards() {
	for (const key of guardedGlobals) {
		originalDescriptors.set(
			key,
			Object.getOwnPropertyDescriptor(globalThis, key),
		);
		Object.defineProperty(globalThis, key, {
			configurable: true,
			get() {
				throw new Error(`Unexpected browser global access: ${key}`);
			},
		});
	}
}

function restoreBrowserGlobals() {
	for (const key of guardedGlobals) {
		const descriptor = originalDescriptors.get(key);
		if (descriptor) {
			Object.defineProperty(globalThis, key, descriptor);
		} else {
			delete (globalThis as Record<string, unknown>)[key];
		}
	}
	originalDescriptors.clear();
}

function canvasColorStats(canvas: RendererCanvas) {
	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Could not read decoded fixture canvas.");
	}
	const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
	let saturation = 0;
	let grayishPixels = 0;
	const pixels = data.length / 4;

	for (let offset = 0; offset < data.length; offset += 4) {
		const red = data[offset];
		const green = data[offset + 1];
		const blue = data[offset + 2];
		const max = Math.max(red, green, blue);
		const min = Math.min(red, green, blue);
		saturation += max === 0 ? 0 : (max - min) / max;
		if (max - min < 8) {
			grayishPixels += 1;
		}
	}

	return {
		averageSaturation: saturation / pixels,
		grayishRatio: grayishPixels / pixels,
	};
}

const grayFrameFixturePath = process.env.CODECUT_GRAYFRAME_FIXTURE_MP4;
const fixtureTest = grayFrameFixturePath ? test : test.skip;
const ffmpegStderrBoundsTest = process.platform === "win32" ? test.skip : test;

describe("node renderer runtime", () => {
	afterEach(() => {
		restoreBrowserGlobals();
	});

	test("renders without document, window, or OffscreenCanvas globals", async () => {
		installBrowserGlobalGuards();
		const runtime = createNodeRendererRuntime();
		const renderer = new CanvasRenderer({
			width: 64,
			height: 36,
			fps: 12,
			runtime,
		});

		await renderer.render({
			node: new ColorNode({ color: "#123456" }),
			time: 0,
		});

		expect(renderer.canvas.width).toBe(64);
		expect(renderer.canvas.height).toBe(36);
	});

	test("rejects video frames above the node decode memory budget", async () => {
		const runtime = createNodeRendererRuntime();

		await expect(
			runtime.getFrameAt({
				mediaId: "oversized-video",
				file: new File([new Uint8Array([1])], "oversized.mp4", {
					type: "video/mp4",
				}),
				sourcePath: "/tmp/oversized.mp4",
				sourceWidth: 8192,
				sourceHeight: 8192,
				sourceFrameRate: 30,
				time: 0,
			}),
		).rejects.toThrow("Node renderer ffmpeg decode frame is too large.");
	});

	test("rejects non-local video source paths before spawning ffmpeg", async () => {
		const runtime = createNodeRendererRuntime();

		await expect(
			runtime.getFrameAt({
				mediaId: "remote-video",
				file: new File([new Uint8Array([1])], "remote.mp4", {
					type: "video/mp4",
				}),
				sourcePath: "https://example.com/remote.mp4",
				sourceWidth: 2,
				sourceHeight: 2,
				sourceFrameRate: 30,
				time: 0,
			}),
		).rejects.toThrow(
			"Node renderer video decoding requires an absolute local source path",
		);
	});

	ffmpegStderrBoundsTest("bounds ffmpeg stderr while decoding frames", async () => {
		const binDirectory = await mkdtemp(join(tmpdir(), "codecut-ffmpeg-"));
		const ffmpegPath = join(binDirectory, "ffmpeg");
		await writeFile(
			ffmpegPath,
			[
				"#!/bin/sh",
				"i=0",
				"while [ $i -lt 70000 ]; do",
				"  printf x >&2",
				"  i=$((i + 1))",
				"done",
				"exit 1",
				"",
			].join("\n"),
		);
		await chmod(ffmpegPath, 0o755);
		const originalPath = process.env.PATH;
		process.env.PATH = `${binDirectory}${delimiter}${originalPath ?? ""}`;
		try {
			const runtime = createNodeRendererRuntime();
			await expect(
				runtime.getFrameAt({
					mediaId: "noisy-ffmpeg",
					file: new File([new Uint8Array([1])], "noisy.mp4", {
						type: "video/mp4",
					}),
					sourcePath: "/tmp/noisy.mp4",
					sourceWidth: 2,
					sourceHeight: 2,
					sourceFrameRate: 30,
					time: 0,
				}),
			).rejects.toThrow("ffmpeg stderr exceeded the decode limit");
		} finally {
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
		}
	});

	fixtureTest(
		"decodes the gray-frame regression fixture with color",
		async () => {
			if (!grayFrameFixturePath) {
				throw new Error("CODECUT_GRAYFRAME_FIXTURE_MP4 is required.");
			}
			const bytes = await readFile(grayFrameFixturePath);
			const runtime = createNodeRendererRuntime();
			const frame = await runtime.getFrameAt({
				mediaId: "gray-frame-regression",
				file: new File([bytes], "gray-frame-regression.mp4", {
					type: "video/mp4",
				}),
				sourcePath: grayFrameFixturePath,
				sourceWidth: 1920,
				sourceHeight: 1080,
				sourceFrameRate: 30,
				time: 1,
			} as Parameters<typeof runtime.getFrameAt>[0] & { sourcePath: string });

			if (!frame) {
				throw new Error("Expected a decoded fixture frame.");
			}
			const stats = canvasColorStats(frame.canvas);
			expect(stats.averageSaturation).toBeGreaterThan(0.25);
			expect(stats.grayishRatio).toBeLessThan(0.5);
		},
	);
});
