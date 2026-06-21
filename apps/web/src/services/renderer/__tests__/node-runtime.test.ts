import { afterEach, describe, expect, test } from "bun:test";
import { CanvasRenderer } from "../canvas-renderer";
import { ColorNode } from "../nodes/color-node";
import { createNodeRendererRuntime } from "@/lib/codex-executor/node-renderer-runtime";

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
});
