# Build Visual Context v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local `build_visual_context` executor tool that creates timeline-wide visual evidence artifacts and conservative vertical-reframe preflight before Codex writes an EditPlan.

**Architecture:** Reuse the existing `inspect_video_range` pipeline instead of creating another FFmpeg path. Add a focused `visual-context.ts` builder that splits a video into fixed 60-second windows, calls the injected range inspector for each window, classifies source orientation, and returns explicit warnings for OCR/subject/semantic analysis that v1 does not implement. Wire the builder into the local executor, CLI, bridge schema, and agent-facing docs.

**Tech Stack:** Bun test, TypeScript, Zod, local Codex executor, existing `inspectVideoRange`, existing `scripts/codex-bridge.mjs` CLI, existing Codecut skill docs.

---

## Scope

This plan covers:

- Add `build_visual_context` to the local executor tool surface.
- Create deterministic 60-second visual windows.
- Reuse `inspect_video_range` for contact sheets, frame timestamps, waveform samples, and silence ranges.
- Return conservative visual preflight for explicit target aspect ratios.
- Add CLI support through `scripts/codex-bridge.mjs build-visual-context`.
- Add bridge schema support for browser-side command validation.
- Update docs and skill references so agents know when to call the tool.

This plan excludes:

- OCR.
- Face, person, body, product, or object detection.
- Person mask generation.
- Automatic crop box generation.
- Timeline mutation.
- Generated B-roll.
- UI changes.
- Cloud or LLM vision calls inside Codecut.

## File Structure

- Create `apps/web/src/lib/codex-executor/visual-context.ts`
  - Owns VisualContext types, window planning, orientation classification, reframe preflight, and the injected-inspector builder.

- Create `apps/web/src/lib/codex-executor/__tests__/visual-context.test.ts`
  - Tests pure windowing, orientation, preflight, builder success, and builder failure messages.

- Modify `apps/web/src/lib/codex-executor/executor.ts`
  - Adds `build_visual_context` to executor command enum, Zod schema, command dispatch, and dependency injection.

- Modify `apps/web/src/lib/codex-executor/__tests__/executor.test.ts`
  - Adds executor-level success and fail-fast tests.

- Modify `apps/web/src/lib/agent-bridge/schema.ts`
  - Adds `build_visual_context` to the bridge tool enum.

- Modify `apps/web/src/lib/agent-bridge/__tests__/schema.test.ts`
  - Tests the new bridge tool is accepted.

- Modify `scripts/codex-bridge.mjs`
  - Adds usage text, envelope builder, and CLI branch for `build-visual-context`.

- Modify `scripts/__tests__/codex-bridge.test.mjs`
  - Tests the CLI envelope and required `targetAspectRatio`.

- Modify `docs/codex-driven-editing.md`
  - Documents the new command in the editing workflow.

- Modify `skills/codecut-jianying-editor-framework/SKILL.md`
  - Requires `build_visual_context` before final EditPlan authoring for visual-proof or reframe-sensitive jobs.

- Modify `skills/codecut-jianying-editor-framework/references/video-context-contract.md`
  - Updates the contract from L3-on-demand range inspection to L3 timeline-wide visual evidence.

---

### Task 1: Add VisualContext Pure Builder

**Files:**
- Create: `apps/web/src/lib/codex-executor/visual-context.ts`
- Test: `apps/web/src/lib/codex-executor/__tests__/visual-context.test.ts`

- [ ] **Step 1: Write the failing pure VisualContext tests**

Create `apps/web/src/lib/codex-executor/__tests__/visual-context.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	VISUAL_CONTEXT_FRAMES_PER_WINDOW,
	buildVisualContextWindows,
	buildVisualContextWithInspector,
	buildVisualPreflight,
	classifySourceOrientation,
} from "../visual-context";

const videoAsset = {
	id: "media-1",
	name: "source.mp4",
	type: "video",
	durationSeconds: 128.4,
	width: 1920,
	height: 1080,
	path: "/tmp/source.mp4",
};

describe("visual context", () => {
	test("splits media into fixed 60 second visual windows", () => {
		expect(buildVisualContextWindows({ durationSeconds: 128.4 })).toEqual([
			{ id: "window-1", index: 1, startSeconds: 0, endSeconds: 60 },
			{ id: "window-2", index: 2, startSeconds: 60, endSeconds: 120 },
			{ id: "window-3", index: 3, startSeconds: 120, endSeconds: 128.4 },
		]);
	});

	test("keeps short media as one visual window", () => {
		expect(buildVisualContextWindows({ durationSeconds: 12 })).toEqual([
			{ id: "window-1", index: 1, startSeconds: 0, endSeconds: 12 },
		]);
	});

	test("rejects invalid durations", () => {
		expect(() =>
			buildVisualContextWindows({ durationSeconds: 0 }),
		).toThrow("VisualContext requires a positive duration.");
	});

	test("classifies source orientation from dimensions", () => {
		expect(classifySourceOrientation({ width: 1920, height: 1080 })).toBe(
			"landscape",
		);
		expect(classifySourceOrientation({ width: 1080, height: 1920 })).toBe(
			"portrait",
		);
		expect(classifySourceOrientation({ width: 1000, height: 980 })).toBe(
			"square",
		);
	});

	test("builds conservative vertical reframe preflight for landscape to 9:16", () => {
		expect(
			buildVisualPreflight({
				width: 1920,
				height: 1080,
				targetAspectRatio: "9:16",
			}),
		).toEqual({
			requiresReframe: true,
			reframeRisk: "needs_review",
			recommendedReframeTemplate:
				"vertical_face_safe_crop_above_burned_captions",
			captionPolicy: "inspect_artifacts_before_lower_safe_captions",
			subjectSafeArea: "unverified",
			burnedCaptionRegion: "unverified",
		});
	});

	test("does not require reframe when source and target are close", () => {
		expect(
			buildVisualPreflight({
				width: 1080,
				height: 1920,
				targetAspectRatio: "9:16",
			}),
		).toEqual({
			requiresReframe: false,
			reframeRisk: "none",
			recommendedReframeTemplate: null,
			captionPolicy: "standard_caption_safe_area",
			subjectSafeArea: "unverified",
			burnedCaptionRegion: "unverified",
		});
	});

	test("builds VisualContext with inspection evidence for every window", async () => {
		const calls: Array<{
			startSeconds: number;
			endSeconds: number;
			frameCount: number;
		}> = [];

		const context = await buildVisualContextWithInspector({
			mediaAsset: videoAsset,
			targetAspectRatio: "9:16",
			outputDirectory: "/tmp/visual-context",
			inspectRange: async ({
				startSeconds,
				endSeconds,
				frameCount,
			}) => {
				calls.push({ startSeconds, endSeconds, frameCount });
				return {
					mediaId: "media-1",
					sourceRange: {
						startSeconds,
						endSeconds,
						durationSeconds: endSeconds - startSeconds,
					},
					artifact: {
						kind: "video_range_contact_sheet",
						path: `/tmp/visual-context/${startSeconds}-${endSeconds}.png`,
						mimeType: "image/png",
						width: 1936,
						height: 520,
					},
					frames: [
						{ timeSeconds: startSeconds },
						{ timeSeconds: endSeconds },
					],
					audio: {
						hasAudio: true,
						waveformSamples: [0.1, 0.5],
						silenceRanges: [],
					},
					warnings: [],
				};
			},
		});

		expect(calls).toEqual([
			{ startSeconds: 0, endSeconds: 60, frameCount: 6 },
			{ startSeconds: 60, endSeconds: 120, frameCount: 6 },
			{ startSeconds: 120, endSeconds: 128.4, frameCount: 6 },
		]);
		expect(context).toMatchObject({
			version: 1,
			mediaId: "media-1",
			name: "source.mp4",
			qualityLevel: "L3_visual_evidence",
			target: { aspectRatio: "9:16" },
			metadata: {
				durationSeconds: 128.4,
				width: 1920,
				height: 1080,
				sourceOrientation: "landscape",
			},
			analysisWindows: [
				{
					id: "window-1",
					index: 1,
					startSeconds: 0,
					endSeconds: 60,
					frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				},
				{
					id: "window-2",
					index: 2,
					startSeconds: 60,
					endSeconds: 120,
					frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				},
				{
					id: "window-3",
					index: 3,
					startSeconds: 120,
					endSeconds: 128.4,
					frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				},
			],
			warnings: [
				"OCR not run",
				"subject detection not run",
				"burned caption detection not run",
				"semantic scene detection not run",
			],
		});
	});

	test("fails with window index and source range when inspection fails", async () => {
		await expect(
			buildVisualContextWithInspector({
				mediaAsset: videoAsset,
				targetAspectRatio: "9:16",
				outputDirectory: "/tmp/visual-context",
				inspectRange: async ({ startSeconds }) => {
					if (startSeconds === 60) {
						throw new Error("ffmpeg failed");
					}
					return {
						mediaId: "media-1",
						sourceRange: {
							startSeconds,
							endSeconds: startSeconds + 60,
							durationSeconds: 60,
						},
						artifact: {
							kind: "video_range_contact_sheet",
							path: "/tmp/window.png",
							mimeType: "image/png",
							width: 1936,
							height: 520,
						},
						frames: [],
						audio: {
							hasAudio: true,
							waveformSamples: [],
							silenceRanges: [],
						},
						warnings: [],
					};
				},
			}),
		).rejects.toThrow(
			"VisualContext window 2 failed for source range 60.00s-120.00s: ffmpeg failed",
		);
	});
});
```

- [ ] **Step 2: Run the failing VisualContext tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/visual-context.test.ts
```

Expected: FAIL because `../visual-context` does not exist.

- [ ] **Step 3: Implement the minimal VisualContext builder**

Create `apps/web/src/lib/codex-executor/visual-context.ts`:

```ts
import type {
	VideoRangeFrame,
	VideoRangeInspection,
} from "@/lib/codex-executor/video-range-inspection";

export const VISUAL_CONTEXT_WINDOW_SECONDS = 60;
export const VISUAL_CONTEXT_FRAMES_PER_WINDOW = 6;

export type VisualTargetAspectRatio = "9:16" | "16:9" | "1:1";
export type SourceOrientation = "landscape" | "portrait" | "square";
export type VisualReframeRisk = "none" | "needs_review";

export interface ExecutorVisualContextMediaAsset {
	id: string;
	name: string;
	type: string;
	durationSeconds?: number;
	width?: number;
	height?: number;
	path?: string;
}

export interface VisualContextWindow {
	id: string;
	index: number;
	startSeconds: number;
	endSeconds: number;
}

export interface CompletedVisualContextWindow extends VisualContextWindow {
	frameCount: number;
	artifact: VideoRangeInspection["artifact"];
	frames: VideoRangeFrame[];
	audio: VideoRangeInspection["audio"];
	warnings: string[];
}

export interface VisualPreflight {
	requiresReframe: boolean;
	reframeRisk: VisualReframeRisk;
	recommendedReframeTemplate:
		| "vertical_face_safe_crop_above_burned_captions"
		| null;
	captionPolicy:
		| "inspect_artifacts_before_lower_safe_captions"
		| "standard_caption_safe_area";
	subjectSafeArea: "unverified";
	burnedCaptionRegion: "unverified";
}

export interface VisualContext {
	version: 1;
	mediaId: string;
	name: string;
	qualityLevel: "L3_visual_evidence";
	target: { aspectRatio: VisualTargetAspectRatio };
	metadata: {
		durationSeconds: number;
		width: number;
		height: number;
		sourceOrientation: SourceOrientation;
	};
	analysisWindows: CompletedVisualContextWindow[];
	visualPreflight: VisualPreflight;
	warnings: string[];
}

export type InspectVisualRange = ({
	mediaAsset,
	startSeconds,
	endSeconds,
	frameCount,
	outputDirectory,
}: {
	mediaAsset: ExecutorVisualContextMediaAsset;
	startSeconds: number;
	endSeconds: number;
	frameCount: number;
	outputDirectory: string;
}) => Promise<VideoRangeInspection>;

function roundToMillis(value: number): number {
	return Number(value.toFixed(3));
}

function targetAspectRatioValue(targetAspectRatio: VisualTargetAspectRatio) {
	if (targetAspectRatio === "9:16") return 9 / 16;
	if (targetAspectRatio === "16:9") return 16 / 9;
	return 1;
}

export function buildVisualContextWindows({
	durationSeconds,
}: {
	durationSeconds: number;
}): VisualContextWindow[] {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("VisualContext requires a positive duration.");
	}

	const windows: VisualContextWindow[] = [];
	let startSeconds = 0;
	let index = 1;
	while (startSeconds < durationSeconds) {
		const endSeconds = Math.min(
			startSeconds + VISUAL_CONTEXT_WINDOW_SECONDS,
			durationSeconds,
		);
		windows.push({
			id: `window-${index}`,
			index,
			startSeconds: roundToMillis(startSeconds),
			endSeconds: roundToMillis(endSeconds),
		});
		startSeconds = endSeconds;
		index += 1;
	}
	return windows;
}

export function classifySourceOrientation({
	width,
	height,
}: {
	width: number;
	height: number;
}): SourceOrientation {
	if (!Number.isFinite(width) || width <= 0) {
		throw new Error("VisualContext width must be positive.");
	}
	if (!Number.isFinite(height) || height <= 0) {
		throw new Error("VisualContext height must be positive.");
	}

	const aspectRatio = width / height;
	if (aspectRatio > 1.05) return "landscape";
	if (aspectRatio < 1 / 1.05) return "portrait";
	return "square";
}

export function buildVisualPreflight({
	width,
	height,
	targetAspectRatio,
}: {
	width: number;
	height: number;
	targetAspectRatio: VisualTargetAspectRatio;
}): VisualPreflight {
	const sourceAspectRatio = width / height;
	const targetRatio = targetAspectRatioValue(targetAspectRatio);
	const requiresReframe =
		Math.abs(sourceAspectRatio - targetRatio) / sourceAspectRatio >= 0.2;
	const isLandscapeToVertical =
		classifySourceOrientation({ width, height }) === "landscape" &&
		targetAspectRatio === "9:16";

	return {
		requiresReframe,
		reframeRisk: requiresReframe ? "needs_review" : "none",
		recommendedReframeTemplate: isLandscapeToVertical
			? "vertical_face_safe_crop_above_burned_captions"
			: null,
		captionPolicy: requiresReframe
			? "inspect_artifacts_before_lower_safe_captions"
			: "standard_caption_safe_area",
		subjectSafeArea: "unverified",
		burnedCaptionRegion: "unverified",
	};
}

function assertVisualContextMediaAsset(
	mediaAsset: ExecutorVisualContextMediaAsset,
): asserts mediaAsset is ExecutorVisualContextMediaAsset & {
	durationSeconds: number;
	width: number;
	height: number;
	path: string;
} {
	if (mediaAsset.type !== "video") {
		throw new Error("VisualContext requires video media.");
	}
	if (
		!Number.isFinite(mediaAsset.durationSeconds) ||
		!mediaAsset.durationSeconds
	) {
		throw new Error("VisualContext requires media duration.");
	}
	if (!Number.isFinite(mediaAsset.width) || !mediaAsset.width) {
		throw new Error("VisualContext requires media width.");
	}
	if (!Number.isFinite(mediaAsset.height) || !mediaAsset.height) {
		throw new Error("VisualContext requires media height.");
	}
	if (!mediaAsset.path) {
		throw new Error("VisualContext media path is required.");
	}
}

export async function buildVisualContextWithInspector({
	mediaAsset,
	targetAspectRatio,
	outputDirectory,
	inspectRange,
}: {
	mediaAsset: ExecutorVisualContextMediaAsset;
	targetAspectRatio: VisualTargetAspectRatio;
	outputDirectory: string;
	inspectRange: InspectVisualRange;
}): Promise<VisualContext> {
	assertVisualContextMediaAsset(mediaAsset);

	const windows = buildVisualContextWindows({
		durationSeconds: mediaAsset.durationSeconds,
	});
	const analysisWindows: CompletedVisualContextWindow[] = [];

	for (const window of windows) {
		try {
			const inspection = await inspectRange({
				mediaAsset,
				startSeconds: window.startSeconds,
				endSeconds: window.endSeconds,
				frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				outputDirectory,
			});
			analysisWindows.push({
				...window,
				frameCount: VISUAL_CONTEXT_FRAMES_PER_WINDOW,
				artifact: inspection.artifact,
				frames: inspection.frames,
				audio: inspection.audio,
				warnings: inspection.warnings,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`VisualContext window ${window.index} failed for source range ${window.startSeconds.toFixed(2)}s-${window.endSeconds.toFixed(2)}s: ${message}`,
			);
		}
	}

	return {
		version: 1,
		mediaId: mediaAsset.id,
		name: mediaAsset.name,
		qualityLevel: "L3_visual_evidence",
		target: { aspectRatio: targetAspectRatio },
		metadata: {
			durationSeconds: mediaAsset.durationSeconds,
			width: mediaAsset.width,
			height: mediaAsset.height,
			sourceOrientation: classifySourceOrientation({
				width: mediaAsset.width,
				height: mediaAsset.height,
			}),
		},
		analysisWindows,
		visualPreflight: buildVisualPreflight({
			width: mediaAsset.width,
			height: mediaAsset.height,
			targetAspectRatio,
		}),
		warnings: [
			"OCR not run",
			"subject detection not run",
			"burned caption detection not run",
			"semantic scene detection not run",
		],
	};
}
```

- [ ] **Step 4: Run the VisualContext tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/visual-context.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/codex-executor/visual-context.ts apps/web/src/lib/codex-executor/__tests__/visual-context.test.ts
git commit -m "feat: add visual context builder"
```

---

### Task 2: Add Executor Command

**Files:**
- Modify: `apps/web/src/lib/codex-executor/executor.ts`
- Modify: `apps/web/src/lib/codex-executor/__tests__/executor.test.ts`

- [ ] **Step 1: Extend the executor test helper union**

In `apps/web/src/lib/codex-executor/__tests__/executor.test.ts`, add `"build_visual_context"` to the local `tool` union inside `envelope()`.

Expected helper shape:

```ts
tool:
	| "get_project_info"
	| "update_project_settings"
	| "list_media_assets"
	| "import_media_file"
	| "transcribe_media"
	| "build_video_context"
	| "build_visual_context"
	| "inspect_video_range"
	| "build_post_cut_captions"
	| "validate_edit_plan"
	| "preview_edit_plan"
	| "apply_edit_plan"
	| "apply_narrated_remix_plan"
	| "create_text_background_effect"
	| "create_human_pip_effect"
	| "generate_digital_human"
	| "export_project"
	| "verify_timeline"
	| "get_timeline_state";
```

- [ ] **Step 2: Add failing executor success test**

Add this test near the existing `inspect_video_range` executor tests:

```ts
test("builds visual context through the local executor without mutating project state", async () => {
	await createExecutorProject({ projectId, name: "Visual proof short" });
	const importResult = await executeCodexExecutorEnvelope({
		envelope: envelope({
			tool: "import_media_file",
			args: {
				fileName: "source.mp4",
				mimeType: "video/mp4",
				base64: Buffer.from("video").toString("base64"),
				size: 5,
				lastModified: 1,
				duration: 128.4,
				width: 1920,
				height: 1080,
			},
		}),
	});
	const mediaId = resultData<{ assets: Array<{ id: string }> }>(
		importResult.results[0],
	).assets[0].id;
	const before = await getExecutorProjectState({ projectId });
	const inspectedRanges: Array<{ startSeconds: number; endSeconds: number }> =
		[];

	const visualResult = await executeCodexExecutorEnvelope({
		envelope: envelope({
			tool: "build_visual_context",
			args: {
				mediaId,
				targetAspectRatio: "9:16",
			},
		}),
		inspectVideoRange: async ({
			startSeconds,
			endSeconds,
			frameCount,
			outputDirectory,
		}) => {
			inspectedRanges.push({ startSeconds, endSeconds });
			expect(frameCount).toBe(6);
			expect(outputDirectory.split(/[\\/]+/).slice(-3)).toEqual([
				"projects",
				projectId,
				"visual-context",
			]);
			return {
				mediaId,
				sourceRange: {
					startSeconds,
					endSeconds,
					durationSeconds: endSeconds - startSeconds,
				},
				artifact: {
					kind: "video_range_contact_sheet",
					path: `/tmp/${startSeconds}-${endSeconds}.png`,
					mimeType: "image/png",
					width: 1936,
					height: 520,
				},
				frames: [
					{ timeSeconds: startSeconds },
					{ timeSeconds: endSeconds },
				],
				audio: {
					hasAudio: true,
					waveformSamples: [0.1, 0.4],
					silenceRanges: [],
				},
				warnings: [],
			};
		},
	});

	expect(inspectedRanges).toEqual([
		{ startSeconds: 0, endSeconds: 60 },
		{ startSeconds: 60, endSeconds: 120 },
		{ startSeconds: 120, endSeconds: 128.4 },
	]);
	expect(visualResult.results[0]).toMatchObject({
		tool: "build_visual_context",
		success: true,
		message: "Built VisualContext for 'source.mp4'",
		data: {
			qualityLevel: "L3_visual_evidence",
			target: { aspectRatio: "9:16" },
			metadata: {
				durationSeconds: 128.4,
				width: 1920,
				height: 1080,
				sourceOrientation: "landscape",
			},
			visualPreflight: {
				requiresReframe: true,
				reframeRisk: "needs_review",
			},
			analysisWindows: [
				{ index: 1, startSeconds: 0, endSeconds: 60 },
				{ index: 2, startSeconds: 60, endSeconds: 120 },
				{ index: 3, startSeconds: 120, endSeconds: 128.4 },
			],
		},
	});
	expect(await getExecutorProjectState({ projectId })).toEqual(before);
});
```

- [ ] **Step 3: Add failing executor rejection tests**

Add these tests near the success test:

```ts
test("build_visual_context rejects image media before invoking inspection", async () => {
	await createExecutorProject({ projectId, name: "Visual proof short" });
	const importResult = await executeCodexExecutorEnvelope({
		envelope: envelope({
			tool: "import_media_file",
			args: {
				fileName: "cover.png",
				mimeType: "image/png",
				base64: Buffer.from("image").toString("base64"),
				size: 5,
				lastModified: 1,
				width: 1000,
				height: 1000,
			},
		}),
	});
	const mediaId = resultData<{ assets: Array<{ id: string }> }>(
		importResult.results[0],
	).assets[0].id;

	const visualResult = await executeCodexExecutorEnvelope({
		envelope: envelope({
			tool: "build_visual_context",
			args: {
				mediaId,
				targetAspectRatio: "9:16",
			},
		}),
		inspectVideoRange: async () => {
			throw new Error("inspectVideoRange should not run for image media");
		},
	});

	expect(visualResult.results[0]).toMatchObject({
		tool: "build_visual_context",
		success: false,
		message: "Media asset 'cover.png' is type 'image', expected video",
	});
});

test("build_visual_context rejects missing target aspect ratio", async () => {
	await createExecutorProject({ projectId, name: "Visual proof short" });

	const visualResult = await executeCodexExecutorEnvelope({
		envelope: envelope({
			tool: "build_visual_context",
			args: {
				mediaId: "missing-media",
			},
		}),
	});

	expect(visualResult.results[0]).toMatchObject({
		tool: "build_visual_context",
		success: false,
	});
	expect(String(visualResult.results[0].message)).toContain(
		"targetAspectRatio",
	);
});
```

- [ ] **Step 4: Run the failing executor tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/executor.test.ts
```

Expected: FAIL because `build_visual_context` is not in the executor schema.

- [ ] **Step 5: Wire the executor command**

In `apps/web/src/lib/codex-executor/executor.ts`, add imports:

```ts
import {
	buildVisualContextWithInspector,
	type InspectVisualRange,
} from "@/lib/codex-executor/visual-context";
```

Add the tool to `ExecutorToolName`:

```ts
| "build_visual_context"
```

Add the tool to the `commandSchema` enum:

```ts
"build_visual_context",
```

Add args schema near `buildVideoContextArgsSchema`:

```ts
const buildVisualContextArgsSchema = z
	.object({
		mediaId: z.string().min(1),
		targetAspectRatio: z.enum(["9:16", "16:9", "1:1"]),
	})
	.strict();
```

Add the command implementation near `runBuildVideoContext`:

```ts
async function runBuildVisualContext({
	state,
	args,
	inspectVideoRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	inspectVideoRange: InspectVisualRange;
}) {
	const parsed = buildVisualContextArgsSchema.parse(args);
	const asset = state.mediaAssets.find((entry) => entry.id === parsed.mediaId);
	if (!asset) {
		throw new Error(`Media asset '${parsed.mediaId}' not found`);
	}
	if (asset.type !== "video") {
		throw new Error(
			`Media asset '${asset.name}' is type '${asset.type}', expected video`,
		);
	}

	const context = await buildVisualContextWithInspector({
		mediaAsset: {
			id: asset.id,
			name: asset.name,
			type: asset.type,
			durationSeconds: asset.duration,
			width: asset.width,
			height: asset.height,
			path: asset.path,
		},
		targetAspectRatio: parsed.targetAspectRatio,
		outputDirectory: join(projectDirectory({ projectId: state.project.id }), "visual-context"),
		inspectRange: inspectVideoRange,
	});

	return {
		success: true,
		message: `Built VisualContext for '${asset.name}'`,
		data: context,
	};
}
```

Add `inspectVideoRange` type compatibility by reusing the existing dependency:

```ts
inspectVideoRange: InspectVisualRange;
```

Add dispatch near `build_video_context`:

```ts
if (command.tool === "build_visual_context") {
	return runBuildVisualContext({
		state,
		args: command.args,
		inspectVideoRange,
	});
}
```

- [ ] **Step 6: Run executor tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/executor.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/codex-executor/executor.ts apps/web/src/lib/codex-executor/__tests__/executor.test.ts
git commit -m "feat: expose visual context executor command"
```

---

### Task 3: Add Bridge Schema And CLI

**Files:**
- Modify: `apps/web/src/lib/agent-bridge/schema.ts`
- Modify: `apps/web/src/lib/agent-bridge/__tests__/schema.test.ts`
- Modify: `scripts/codex-bridge.mjs`
- Modify: `scripts/__tests__/codex-bridge.test.mjs`

- [ ] **Step 1: Add failing bridge schema test**

Add this test to `apps/web/src/lib/agent-bridge/__tests__/schema.test.ts`:

```ts
test("accepts the visual context tool", () => {
	const result = BridgeToolNameSchema.safeParse("build_visual_context");
	expect(result.success).toBe(true);
});
```

- [ ] **Step 2: Add failing CLI helper tests**

Update the import list in `scripts/__tests__/codex-bridge.test.mjs`:

```js
buildVisualContextEnvelope,
```

Add tests near the existing `buildVideoContextEnvelope` tests:

```js
test("builds a visual context command envelope with explicit target aspect ratio", () => {
	const envelope = buildVisualContextEnvelope({
		projectId: "project-123",
		mediaId: "media-123",
		targetAspectRatio: "9:16",
	});

	expect(envelope).toEqual({
		version: 1,
		projectId: "project-123",
		source: "codex",
		commands: [
			{
				id: "cmd-1",
				tool: "build_visual_context",
				args: {
					mediaId: "media-123",
					targetAspectRatio: "9:16",
				},
			},
		],
	});
});

test("buildVisualContextEnvelope requires explicit inputs", () => {
	expect(() =>
		buildVisualContextEnvelope({
			projectId: "project-123",
			mediaId: "",
			targetAspectRatio: "9:16",
		}),
	).toThrow("--media-id is required");
	expect(() =>
		buildVisualContextEnvelope({
			projectId: "project-123",
			mediaId: "media-123",
			targetAspectRatio: undefined,
		}),
	).toThrow("--target-aspect-ratio is required");
	expect(() =>
		buildVisualContextEnvelope({
			projectId: "project-123",
			mediaId: "media-123",
			targetAspectRatio: "4:5",
		}),
	).toThrow("--target-aspect-ratio must be one of 9:16, 16:9, 1:1");
});
```

- [ ] **Step 3: Run failing schema and CLI tests**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/schema.test.ts scripts/__tests__/codex-bridge.test.mjs
```

Expected: FAIL because schema and CLI helper do not support `build_visual_context`.

- [ ] **Step 4: Add bridge schema tool**

In `apps/web/src/lib/agent-bridge/schema.ts`, add:

```ts
"build_visual_context",
```

Place it near:

```ts
"transcribe_media",
"build_visual_context",
"build_post_cut_captions",
```

- [ ] **Step 5: Add CLI usage and envelope helper**

In `scripts/codex-bridge.mjs`, add usage text near `build-video-context`:

```js
"  node scripts/codex-bridge.mjs build-visual-context --project-id <id> --media-id <id> --target-aspect-ratio <9:16|16:9|1:1>",
```

Add helper near `buildVideoContextEnvelope`:

```js
export function buildVisualContextEnvelope({
	projectId,
	mediaId,
	targetAspectRatio,
}) {
	if (!mediaId) {
		throw new Error("--media-id is required");
	}
	if (!targetAspectRatio) {
		throw new Error("--target-aspect-ratio is required");
	}
	if (!["9:16", "16:9", "1:1"].includes(targetAspectRatio)) {
		throw new Error("--target-aspect-ratio must be one of 9:16, 16:9, 1:1");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "build_visual_context",
		args: {
			mediaId,
			targetAspectRatio,
		},
	});
}
```

Add CLI branch near `build-video-context`:

```js
} else if (command === "build-visual-context") {
	envelope = buildVisualContextEnvelope({
		projectId: flags.projectId,
		mediaId: flags.mediaId,
		targetAspectRatio: flags.targetAspectRatio,
	});
```

- [ ] **Step 6: Run schema and CLI tests**

Run:

```bash
bun test apps/web/src/lib/agent-bridge/__tests__/schema.test.ts scripts/__tests__/codex-bridge.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/agent-bridge/schema.ts apps/web/src/lib/agent-bridge/__tests__/schema.test.ts scripts/codex-bridge.mjs scripts/__tests__/codex-bridge.test.mjs
git commit -m "feat: add visual context bridge command"
```

---

### Task 4: Update Agent-Facing Docs

**Files:**
- Modify: `docs/codex-driven-editing.md`
- Modify: `skills/codecut-jianying-editor-framework/SKILL.md`
- Modify: `skills/codecut-jianying-editor-framework/references/video-context-contract.md`

- [ ] **Step 1: Update workflow docs**

In `docs/codex-driven-editing.md`, add this command near the context-building commands:

```bash
node scripts/codex-bridge.mjs build-visual-context \
  --project-id <project-id> \
  --media-id <media-id> \
  --target-aspect-ratio 9:16
```

Add this workflow rule:

```md
For tutorial, product-proof, screen-recording, or horizontal-to-vertical jobs, run `build-visual-context` before final EditPlan authoring. Treat returned artifacts as evidence. Do not claim OCR, subject-safe crop, burned-caption detection, or semantic scene recognition unless a later tool returns those facts explicitly.
```

- [ ] **Step 2: Update Codecut skill routing**

In `skills/codecut-jianying-editor-framework/SKILL.md`, update the `Visual And Caption Gates` section with:

```md
For tutorial, product-proof, screen-recording, or horizontal-to-vertical jobs, run `build_visual_context` before final EditPlan authoring. Use it as timeline-wide visual evidence and reframe preflight. It does not perform OCR, subject detection, burned-caption detection, or semantic scene recognition; do not claim those facts from its output.
```

- [ ] **Step 3: Update video context contract**

In `skills/codecut-jianying-editor-framework/references/video-context-contract.md`, update the current MVP boundary paragraph:

```md
Current boundary: local `build_video_context` is implemented for L2 transcript context on one imported audio/video asset. Local `inspect_video_range` is implemented as L3 on-demand evidence for a chosen video source range. Local `build_visual_context` is implemented as L3 timeline-wide visual evidence by producing fixed 60-second range inspections and conservative reframe preflight. Durable OCR, subject detection, burned-caption detection, semantic scene detection, and automatic crop boxes remain future work.
```

Add `build_visual_context` to the implemented list:

```md
- L3 timeline-wide visual evidence from local `build_visual_context`
```

- [ ] **Step 4: Run docs grep checks**

Run:

```bash
rg -n "build-visual-context|build_visual_context|OCR, subject" docs/codex-driven-editing.md skills/codecut-jianying-editor-framework/SKILL.md skills/codecut-jianying-editor-framework/references/video-context-contract.md
```

Expected: output contains the new command and the warning boundary in all three files.

- [ ] **Step 5: Commit**

```bash
git add docs/codex-driven-editing.md skills/codecut-jianying-editor-framework/SKILL.md skills/codecut-jianying-editor-framework/references/video-context-contract.md
git commit -m "docs: require visual context before reframe-sensitive edits"
```

---

### Task 5: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test \
  apps/web/src/lib/codex-executor/__tests__/visual-context.test.ts \
  apps/web/src/lib/codex-executor/__tests__/executor.test.ts \
  apps/web/src/lib/agent-bridge/__tests__/schema.test.ts \
  scripts/__tests__/codex-bridge.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS or only pre-existing unrelated warnings. If warnings occur in touched files, fix them before proceeding.

- [ ] **Step 3: Run docs proof command**

Run:

```bash
rg -n "build-visual-context|build_visual_context|L3 timeline-wide visual evidence" docs/codex-driven-editing.md skills/codecut-jianying-editor-framework/SKILL.md skills/codecut-jianying-editor-framework/references/video-context-contract.md
```

Expected: each touched doc appears in the output.

- [ ] **Step 4: Manual executor smoke with injected project**

After starting the local web service and sourcing `apps/web/.env.local`, run:

```bash
node scripts/codex-bridge.mjs create-project \
  --project-id visual-context-smoke \
  --name "Visual Context Smoke"
```

Import a known local video:

```bash
node scripts/codex-bridge.mjs import-media \
  --project-id visual-context-smoke \
  --file-path /absolute/path/to/source.mp4
```

Run the new command with the returned media id:

```bash
node scripts/codex-bridge.mjs build-visual-context \
  --project-id visual-context-smoke \
  --media-id <media-id> \
  --target-aspect-ratio 9:16
```

Expected: JSON result includes `qualityLevel: "L3_visual_evidence"`, at least one `analysisWindows[].artifact.path`, and `visualPreflight.reframeRisk`.

- [ ] **Step 5: Commit final fixes**

If verification required fixes, commit them:

```bash
git add apps/web/src/lib/codex-executor/visual-context.ts apps/web/src/lib/codex-executor/__tests__/visual-context.test.ts apps/web/src/lib/codex-executor/executor.ts apps/web/src/lib/codex-executor/__tests__/executor.test.ts apps/web/src/lib/agent-bridge/schema.ts apps/web/src/lib/agent-bridge/__tests__/schema.test.ts scripts/codex-bridge.mjs scripts/__tests__/codex-bridge.test.mjs docs/codex-driven-editing.md skills/codecut-jianying-editor-framework/SKILL.md skills/codecut-jianying-editor-framework/references/video-context-contract.md
git commit -m "fix: complete visual context verification"
```

Expected: no staged changes remain after the final commit.

---

## Self-Review

Spec coverage:

- Timeline-wide visual evidence: Task 1 and Task 2.
- No project mutation: Task 2 executor success test.
- Explicit target aspect ratio: Task 2 args schema and Task 3 CLI tests.
- No OCR/subject overclaim: Task 1 output warnings and Task 4 docs.
- CLI and bridge contract: Task 3.
- Agent workflow enforcement: Task 4.

Placeholder scan:

- No placeholder markers or unspecified validation steps are used.
- Each implementation step includes concrete code or exact command text.

Type consistency:

- Tool name is consistently `build_visual_context`.
- CLI command is consistently `build-visual-context`.
- Target aspect property is consistently `targetAspectRatio`.
- Context quality level is consistently `L3_visual_evidence`.
