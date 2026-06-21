# Video Context Chunking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local `build_video_context` executor tool that analyzes one imported audio/video asset, automatically splits long media into fixed 300-second analysis chunks, and returns source-timestamped transcript context for Codex editing decisions.

**Architecture:** Keep Codecut as the deterministic local executor. Add a focused VideoContext builder that plans 300-second chunks, calls a range-aware local transcription runtime for each chunk, offsets segment timestamps back to source-video seconds, and returns warnings for visual/OCR features that are not implemented. The CLI only sends the executor command and prints the returned context.

**Tech Stack:** Bun test, TypeScript, Zod, local Codex executor, existing `ffmpeg` audio extraction, existing Transformers.js transcription runtime, existing `scripts/codex-bridge.mjs` CLI.

---

## Scope

This plan covers:

- Add `build_video_context` to the local executor tool surface.
- Add fixed 300-second analysis chunking.
- Reuse local ASR with range-specific audio extraction.
- Return transcript segments in original source-video seconds.
- Add deterministic asset classification and filler hints.
- Add CLI support for `build-video-context`.
- Update agent-facing docs so the implemented tool surface is accurate.

This plan excludes:

- Cloud video understanding.
- Physical video split assets.
- OCR, contact sheets, scene detection, or keyframe extraction.
- Background job UI or persistence beyond the executor result.
- Timeline mutation or EditPlan changes.
- Configurable chunk length.

## File Structure

- Modify `apps/web/src/lib/codex-executor/transcription.ts`
  - Add range-aware transcription support.
  - Keep the existing full-media transcription path working.

- Create `apps/web/src/lib/codex-executor/video-context.ts`
  - Owns VideoContext types, chunk planning, segment offsetting, asset classification, and the builder.

- Create `apps/web/src/lib/codex-executor/__tests__/video-context.test.ts`
  - Tests pure chunking, timestamp offsetting, and builder behavior with injected transcription.

- Modify `apps/web/src/lib/codex-executor/executor.ts`
  - Add `build_video_context` to the executor tool enum and command schema.
  - Add args validation and command dispatch.

- Modify `apps/web/src/lib/codex-executor/__tests__/executor.test.ts`
  - Tests executor-level success and rejection behavior.

- Modify `scripts/codex-bridge.mjs`
  - Add the `build-video-context` CLI command.

- Modify `scripts/__tests__/codex-bridge.test.mjs`
  - Tests CLI envelope generation.

- Modify `docs/codex-driven-editing.md`
  - Document the new command in the current workflow.

- Modify `skills/codecut-jianying-editor-framework/SKILL.md`
  - Document when Codex should call `build_video_context`.

- Modify `skills/codecut-jianying-editor-framework/references/codecut-agent-tool-contract.md`
  - Add `build_video_context` to the current implemented tool surface after implementation.

- Modify `skills/codecut-jianying-editor-framework/references/video-context-contract.md`
  - Mark L2 transcript context as implemented through the local executor.

---

### Task 1: Add VideoContext Pure Builder

**Files:**
- Create: `apps/web/src/lib/codex-executor/video-context.ts`
- Test: `apps/web/src/lib/codex-executor/__tests__/video-context.test.ts`

- [ ] **Step 1: Write the failing pure VideoContext tests**

Create `apps/web/src/lib/codex-executor/__tests__/video-context.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	buildAnalysisChunks,
	buildVideoContextWithTranscriber,
	guessVideoContextAssetType,
	offsetTranscriptSegments,
	shouldSuggestTrimFillers,
} from "../video-context";

const videoAsset = {
	id: "media-1",
	name: "source.mp4",
	type: "video" as const,
	mimeType: "video/mp4",
	duration: 725,
	width: 1920,
	height: 1080,
	size: 10,
	lastModified: 1,
	path: "/tmp/source.mp4",
};

describe("video context chunking", () => {
	test("builds fixed 300 second chunks for long media", () => {
		expect(buildAnalysisChunks({ durationSeconds: 725 })).toEqual([
			{ index: 1, start: 0, end: 300 },
			{ index: 2, start: 300, end: 600 },
			{ index: 3, start: 600, end: 725 },
		]);
	});

	test("keeps short media as one analysis chunk", () => {
		expect(buildAnalysisChunks({ durationSeconds: 120 })).toEqual([
			{ index: 1, start: 0, end: 120 },
		]);
	});

	test("offsets transcript segments back to source timestamps", () => {
		expect(
			offsetTranscriptSegments({
				offsetSeconds: 300,
				segments: [{ start: 1.25, end: 4.5, text: "second chunk" }],
			}),
		).toEqual([{ start: 301.25, end: 304.5, text: "second chunk" }]);
	});

	test("classifies oral candidates from transcript density", () => {
		expect(
			guessVideoContextAssetType({
				fullText: "这里是一段足够长的口播内容，用于判断这条素材可以作为口播主线。",
				segmentCount: 3,
			}),
		).toBe("oral_candidate");
		expect(
			guessVideoContextAssetType({ fullText: "短", segmentCount: 1 }),
		).toBe("mixed_or_unknown");
	});

	test("suggests filler trimming only after two filler marker classes", () => {
		expect(shouldSuggestTrimFillers("嗯，我们然后看这里")).toBe(true);
		expect(shouldSuggestTrimFillers("然后进入下一步")).toBe(false);
	});

	test("builds merged context with global timestamps and chunk audit trail", async () => {
		const context = await buildVideoContextWithTranscriber({
			mediaAsset: videoAsset,
			language: "auto",
			modelId: "whisper-tiny",
			probeAudio: async () => ({ hasAudio: true }),
			transcribeRange: async ({ range }) => ({
				text: `chunk ${range.start}`,
				language: "zh",
				modelId: "whisper-tiny",
				segments: [{ start: 1, end: 2, text: `text ${range.start}` }],
			}),
		});

		expect(context).toMatchObject({
			version: 1,
			mediaId: "media-1",
			name: "source.mp4",
			qualityLevel: "L2_transcript",
			metadata: {
				durationSeconds: 725,
				width: 1920,
				height: 1080,
				hasAudio: true,
			},
			transcript: {
				language: "zh",
				segments: [
					{ start: 1, end: 2, text: "text 0" },
					{ start: 301, end: 302, text: "text 300" },
					{ start: 601, end: 602, text: "text 600" },
				],
			},
			analysisChunks: [
				{ index: 1, start: 0, end: 300, status: "succeeded", segmentCount: 1 },
				{ index: 2, start: 300, end: 600, status: "succeeded", segmentCount: 1 },
				{ index: 3, start: 600, end: 725, status: "succeeded", segmentCount: 1 },
			],
			warnings: [
				"visual analysis not run",
				"OCR skipped",
				"scene detection not run",
			],
		});
	});

	test("fails fast when a chunk transcription fails", async () => {
		await expect(
			buildVideoContextWithTranscriber({
				mediaAsset: videoAsset,
				language: "auto",
				modelId: "whisper-tiny",
				probeAudio: async () => ({ hasAudio: true }),
				transcribeRange: async ({ range }) => {
					if (range.start === 300) {
						throw new Error("ASR failed");
					}
					return {
						text: "ok",
						language: "zh",
						modelId: "whisper-tiny",
						segments: [],
					};
				},
			}),
		).rejects.toThrow(
			"VideoContext chunk 2 failed for source range 300.00s-600.00s: ASR failed",
		);
	});
});
```

- [ ] **Step 2: Run the failing pure VideoContext tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/video-context.test.ts
```

Expected: FAIL because `apps/web/src/lib/codex-executor/video-context.ts` does not exist.

- [ ] **Step 3: Add the pure VideoContext builder**

Create `apps/web/src/lib/codex-executor/video-context.ts`:

```ts
import type {
	TranscriptionLanguage,
	TranscriptionModelId,
	TranscriptionResult,
	TranscriptionSegment,
} from "@/types/transcription";

export const VIDEO_CONTEXT_CHUNK_SECONDS = 300;

export interface ExecutorVideoContextMediaAsset {
	id: string;
	name: string;
	type: "image" | "video" | "audio";
	mimeType: string;
	duration?: number;
	width?: number;
	height?: number;
	size: number;
	lastModified: number;
	path: string;
}

export interface AnalysisChunk {
	index: number;
	start: number;
	end: number;
}

export interface CompletedAnalysisChunk extends AnalysisChunk {
	status: "succeeded";
	segmentCount: number;
}

export type VideoContextAssetTypeGuess =
	| "oral_candidate"
	| "mixed_or_unknown";

export interface VideoContext {
	version: 1;
	mediaId: string;
	name: string;
	qualityLevel: "L2_transcript";
	metadata: {
		durationSeconds: number;
		width?: number;
		height?: number;
		hasAudio: boolean;
	};
	transcript: {
		language: string;
		fullText: string;
		segments: TranscriptionSegment[];
	};
	analysisChunks: CompletedAnalysisChunk[];
	assetTypeGuess: VideoContextAssetTypeGuess;
	editingHints: {
		suggestTrimFillers: boolean;
		hasTalkingHeadSignal: boolean;
		canBeBroll: false;
	};
	warnings: string[];
}

export type ProbeAudio = ({
	mediaAsset,
}: {
	mediaAsset: ExecutorVideoContextMediaAsset;
}) => Promise<{ hasAudio: boolean }>;

export type TranscribeRange = ({
	mediaAsset,
	language,
	modelId,
	range,
}: {
	mediaAsset: ExecutorVideoContextMediaAsset;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
	range: { start: number; end: number };
}) => Promise<TranscriptionResult & { modelId?: string }>;

export function buildAnalysisChunks({
	durationSeconds,
}: {
	durationSeconds: number;
}): AnalysisChunk[] {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new Error("VideoContext media duration must be positive.");
	}

	const chunks: AnalysisChunk[] = [];
	let start = 0;
	while (start < durationSeconds) {
		const end = Math.min(start + VIDEO_CONTEXT_CHUNK_SECONDS, durationSeconds);
		chunks.push({ index: chunks.length + 1, start, end });
		start = end;
	}
	return chunks;
}

export function offsetTranscriptSegments({
	segments,
	offsetSeconds,
}: {
	segments: TranscriptionSegment[];
	offsetSeconds: number;
}): TranscriptionSegment[] {
	return segments.map((segment) => ({
		...segment,
		start: Number((segment.start + offsetSeconds).toFixed(3)),
		end: Number((segment.end + offsetSeconds).toFixed(3)),
	}));
}

export function guessVideoContextAssetType({
	fullText,
	segmentCount,
}: {
	fullText: string;
	segmentCount: number;
}): VideoContextAssetTypeGuess {
	if (segmentCount >= 3 && fullText.trim().length >= 20) {
		return "oral_candidate";
	}
	return "mixed_or_unknown";
}

export function shouldSuggestTrimFillers(text: string): boolean {
	const markers = ["嗯", "啊", "呃", "额", "然后", "就是"];
	let hitCount = 0;
	for (const marker of markers) {
		if (text.includes(marker)) hitCount += 1;
	}
	return hitCount >= 2;
}

function assertAnalyzableMedia(asset: ExecutorVideoContextMediaAsset): number {
	if (asset.type !== "video" && asset.type !== "audio") {
		throw new Error(
			`Media asset '${asset.name}' is type '${asset.type}', expected video or audio`,
		);
	}
	if (!asset.duration || asset.duration <= 0) {
		throw new Error("VideoContext media duration must be positive.");
	}
	return asset.duration;
}

export async function buildVideoContextWithTranscriber({
	mediaAsset,
	language,
	modelId,
	probeAudio,
	transcribeRange,
}: {
	mediaAsset: ExecutorVideoContextMediaAsset;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
	probeAudio: ProbeAudio;
	transcribeRange: TranscribeRange;
}): Promise<VideoContext> {
	const durationSeconds = assertAnalyzableMedia(mediaAsset);
	const audioProbe = await probeAudio({ mediaAsset });
	if (!audioProbe.hasAudio) {
		throw new Error(
			`Media asset '${mediaAsset.name}' has no audio track; visual-only VideoContext is not implemented.`,
		);
	}

	const chunks = buildAnalysisChunks({ durationSeconds });
	const fullTextParts: string[] = [];
	const mergedSegments: TranscriptionSegment[] = [];
	const completedChunks: CompletedAnalysisChunk[] = [];
	let detectedLanguage: string = language;

	for (const chunk of chunks) {
		try {
			const result = await transcribeRange({
				mediaAsset,
				language,
				modelId,
				range: { start: chunk.start, end: chunk.end },
			});
			const globalSegments = offsetTranscriptSegments({
				segments: result.segments,
				offsetSeconds: chunk.start,
			});
			fullTextParts.push(result.text);
			mergedSegments.push(...globalSegments);
			detectedLanguage = result.language;
			completedChunks.push({
				...chunk,
				status: "succeeded",
				segmentCount: globalSegments.length,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			throw new Error(
				`VideoContext chunk ${chunk.index} failed for source range ${chunk.start.toFixed(2)}s-${chunk.end.toFixed(2)}s: ${message}`,
			);
		}
	}

	const fullText = fullTextParts.join(" ").trim();
	const assetTypeGuess = guessVideoContextAssetType({
		fullText,
		segmentCount: mergedSegments.length,
	});

	return {
		version: 1,
		mediaId: mediaAsset.id,
		name: mediaAsset.name,
		qualityLevel: "L2_transcript",
		metadata: {
			durationSeconds,
			width: mediaAsset.width,
			height: mediaAsset.height,
			hasAudio: true,
		},
		transcript: {
			language: detectedLanguage,
			fullText,
			segments: mergedSegments,
		},
		analysisChunks: completedChunks,
		assetTypeGuess,
		editingHints: {
			suggestTrimFillers: shouldSuggestTrimFillers(fullText),
			hasTalkingHeadSignal: assetTypeGuess === "oral_candidate",
			canBeBroll: false,
		},
		warnings: [
			"visual analysis not run",
			"OCR skipped",
			"scene detection not run",
		],
	};
}
```

- [ ] **Step 4: Run the pure VideoContext tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/video-context.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/codex-executor/video-context.ts apps/web/src/lib/codex-executor/__tests__/video-context.test.ts
git commit -m "feat: add local video context chunk builder"
```

---

### Task 2: Add Range-Aware Local Transcription

**Files:**
- Modify: `apps/web/src/lib/codex-executor/transcription.ts`

- [ ] **Step 1: Write the failing integration test against VideoContext runtime injection**

Extend `apps/web/src/lib/codex-executor/__tests__/video-context.test.ts`:

```ts
import { transcribeMediaRangeWithNodeRuntime } from "../transcription";

test("exports a range-aware transcription runtime", () => {
	expect(typeof transcribeMediaRangeWithNodeRuntime).toBe("function");
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/video-context.test.ts
```

Expected: FAIL because `transcribeMediaRangeWithNodeRuntime` is not exported.

- [ ] **Step 3: Add range support to transcription runtime**

Modify `apps/web/src/lib/codex-executor/transcription.ts`:

```ts
export interface ExecutorTranscriptionRange {
	start: number;
	end: number;
}

export type ExecutorTranscribeMediaRange = ({
	mediaAsset,
	language,
	modelId,
	range,
}: Parameters<ExecutorTranscribeMedia>[0] & {
	range: ExecutorTranscriptionRange;
}) => ReturnType<ExecutorTranscribeMedia>;

function ffmpegAudioArgs({
	filePath,
	range,
}: {
	filePath: string;
	range?: ExecutorTranscriptionRange;
}): string[] {
	const args = ["-v", "error"];
	if (range) {
		const duration = range.end - range.start;
		if (!Number.isFinite(duration) || duration <= 0) {
			throw new Error("Transcription range duration must be positive.");
		}
		args.push("-ss", String(range.start), "-t", String(duration));
	}
	args.push(
		"-i",
		filePath,
		"-vn",
		"-ac",
		"1",
		"-ar",
		String(SAMPLE_RATE),
		"-f",
		"f32le",
		"pipe:1",
	);
	return args;
}
```

Add an `ffprobe`-based audio probe used by the VideoContext builder:

```ts
async function readProcessStdout({
	child,
}: {
	child: ReturnType<typeof spawn>;
}): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let stderr = "";
		child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", reject);
		child.on("close", (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `ffprobe exited with code ${code}`));
				return;
			}
			resolve(Buffer.concat(chunks).toString("utf8"));
		});
	});
}

export async function probeMediaAudioWithFfprobe({
	mediaAsset,
}: {
	mediaAsset: ExecutorTranscriptionMedia;
}): Promise<{ hasAudio: boolean }> {
	const ffprobe = spawn("ffprobe", [
		"-v",
		"error",
		"-select_streams",
		"a:0",
		"-show_entries",
		"stream=codec_type",
		"-of",
		"csv=p=0",
		mediaAsset.path,
	]);
	const stdout = await readProcessStdout({ child: ffprobe });
	return { hasAudio: stdout.trim().length > 0 };
}
```

If the helper needs process-output plumbing, keep it local to
`transcription.ts` and fail fast on `ffprobe` execution errors. Do not infer
audio availability from MIME type.

Then update `extractAudioSamples` to accept `range?: ExecutorTranscriptionRange` and spawn:

```ts
const ffmpeg = spawn(
	"ffmpeg",
	ffmpegAudioArgs({ filePath, range }),
);
```

Add the range-aware exported runtime:

```ts
export const transcribeMediaRangeWithNodeRuntime: ExecutorTranscribeMedia & ((
	params: Parameters<ExecutorTranscribeMedia>[0] & {
		range: ExecutorTranscriptionRange;
	}
) => ReturnType<ExecutorTranscribeMedia>) = async ({
	mediaAsset,
	language,
	modelId,
	range,
}) => {
	return transcribeMediaWithNodeRuntime({
		mediaAsset,
		language,
		modelId,
		range,
	} as Parameters<ExecutorTranscribeMedia>[0] & {
		range: ExecutorTranscriptionRange;
	});
};
```

If TypeScript rejects the overloaded type, replace it with a direct named function that calls the shared internal implementation:

```ts
export async function transcribeMediaRangeWithNodeRuntime({
	mediaAsset,
	language,
	modelId,
	range,
}: Parameters<ExecutorTranscribeMedia>[0] & {
	range: ExecutorTranscriptionRange;
}) {
	return runTranscriptionWithNodeRuntime({
		mediaAsset,
		language,
		modelId,
		range,
	});
}
```

Keep `transcribeMediaWithNodeRuntime` as the full-media call:

```ts
export const transcribeMediaWithNodeRuntime: ExecutorTranscribeMedia = async ({
	mediaAsset,
	language,
	modelId,
}) => {
	return runTranscriptionWithNodeRuntime({
		mediaAsset,
		language,
		modelId,
	});
};
```

- [ ] **Step 4: Run the VideoContext tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/video-context.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/codex-executor/transcription.ts apps/web/src/lib/codex-executor/__tests__/video-context.test.ts
git commit -m "feat: add range-aware local transcription"
```

---

### Task 3: Wire `build_video_context` Into The Executor

**Files:**
- Modify: `apps/web/src/lib/codex-executor/executor.ts`
- Modify: `apps/web/src/lib/codex-executor/__tests__/executor.test.ts`

- [ ] **Step 1: Write failing executor tests**

Extend the local `tool` union in `apps/web/src/lib/codex-executor/__tests__/executor.test.ts` to include `"build_video_context"`.

Add this test:

```ts
test("builds VideoContext through the local executor", async () => {
	await createExecutorProject({ projectId, name: "Codex cut" });
	const importResult = await executeCodexExecutorEnvelope({
		envelope: envelope({
			tool: "import_media_file",
			args: {
				fileName: "source.mp4",
				mimeType: "video/mp4",
				base64: Buffer.from("video").toString("base64"),
				size: 5,
				lastModified: 1,
				duration: 725,
				width: 1920,
				height: 1080,
			},
		}),
	});
	const mediaId = resultData<{ assets: Array<{ id: string }> }>(
		importResult.results[0],
	).assets[0].id;

	const contextResult = await executeCodexExecutorEnvelope({
		envelope: envelope({
			tool: "build_video_context",
			args: {
				mediaId,
				language: "auto",
				modelId: "whisper-tiny",
			},
		}),
		probeAudio: async () => ({ hasAudio: true }),
		transcribeMediaRange: async ({ range }) => ({
			text: `chunk ${range.start}`,
			language: "zh",
			modelId: "whisper-tiny",
			segments: [{ text: "hello", start: 1, end: 2 }],
		}),
	});

	expect(contextResult.results[0]).toMatchObject({
		tool: "build_video_context",
		success: true,
		message: "Built VideoContext for 'source.mp4'",
		data: {
			qualityLevel: "L2_transcript",
			metadata: { durationSeconds: 725, hasAudio: true },
			transcript: {
				segments: [
					{ start: 1, end: 2, text: "hello" },
					{ start: 301, end: 302, text: "hello" },
					{ start: 601, end: 602, text: "hello" },
				],
			},
		},
	});
});
```

Add this rejection test:

```ts
test("build_video_context rejects image media without invoking transcription", async () => {
	await createExecutorProject({ projectId, name: "Codex cut" });
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

	const contextResult = await executeCodexExecutorEnvelope({
		envelope: envelope({
			tool: "build_video_context",
			args: {
				mediaId,
				language: "auto",
				modelId: "whisper-tiny",
			},
		}),
		probeAudio: async () => {
			throw new Error("probeAudio should not run for image media");
		},
		transcribeMediaRange: async () => {
			throw new Error("transcribeMediaRange should not run for image media");
		},
	});

	expect(contextResult.results[0]).toMatchObject({
		success: false,
		message: "Media asset 'cover.png' is type 'image', expected video or audio",
	});
});
```

- [ ] **Step 2: Run the failing executor tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/executor.test.ts
```

Expected: FAIL because `build_video_context` is not part of the executor schema.

- [ ] **Step 3: Update executor types and dependencies**

Modify `apps/web/src/lib/codex-executor/executor.ts`:

```ts
import {
	type ProbeAudio,
	buildVideoContextWithTranscriber,
} from "@/lib/codex-executor/video-context";
import {
	type ExecutorTranscribeMediaRange,
	probeMediaAudioWithFfprobe,
	transcribeMediaRangeWithNodeRuntime,
} from "@/lib/codex-executor/transcription";
```

Add `"build_video_context"` to `ExecutorToolName`, `commandSchema`, and tests' `tool` union.

Add args schema:

```ts
const buildVideoContextArgsSchema = z
	.object({
		mediaId: z.string().min(1),
		language: z.unknown(),
		modelId: z.unknown(),
	})
	.strict();
```

Add command runner:

```ts
async function runBuildVideoContext({
	state,
	args,
	probeAudio,
	transcribeMediaRange,
}: {
	state: ExecutorProjectState;
	args: Record<string, unknown>;
	probeAudio: ProbeAudio;
	transcribeMediaRange: ExecutorTranscribeMediaRange;
}) {
	const parsed = buildVideoContextArgsSchema.parse(args);
	const language = parseExecutorTranscriptionLanguage(parsed.language);
	const modelId = parseExecutorTranscriptionModelId(parsed.modelId);
	const mediaAsset = state.mediaAssets.find(
		(asset) => asset.id === parsed.mediaId,
	);

	if (!mediaAsset) {
		return { success: false, message: `Media asset '${parsed.mediaId}' not found` };
	}

	const context = await buildVideoContextWithTranscriber({
		mediaAsset,
		language,
		modelId,
		probeAudio,
		transcribeRange: transcribeMediaRange,
	});

	return {
		success: true,
		message: `Built VideoContext for '${mediaAsset.name}'`,
		data: context,
	};
}
```

Thread `probeAudio` and `transcribeMediaRange` through `executeCommand` and `executeCodexExecutorEnvelope` with defaults:

```ts
export async function executeCodexExecutorEnvelope({
	envelope,
	transcribeMedia = transcribeMediaWithNodeRuntime,
	probeAudio = probeMediaAudioWithFfprobe,
	transcribeMediaRange = transcribeMediaRangeWithNodeRuntime,
}: {
	envelope: unknown;
	transcribeMedia?: ExecutorTranscribeMedia;
	probeAudio?: ProbeAudio;
	transcribeMediaRange?: ExecutorTranscribeMediaRange;
}) {
	// existing implementation
}
```

- [ ] **Step 4: Run executor tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/executor.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/codex-executor/executor.ts apps/web/src/lib/codex-executor/__tests__/executor.test.ts
git commit -m "feat: expose build video context executor tool"
```

---

### Task 4: Add CLI Command

**Files:**
- Modify: `scripts/codex-bridge.mjs`
- Modify: `scripts/__tests__/codex-bridge.test.mjs`

- [ ] **Step 1: Write the failing CLI tests**

Open `scripts/__tests__/codex-bridge.test.mjs` and add:

```js
import {
	buildVideoContextEnvelope,
} from "../codex-bridge.mjs";

test("buildVideoContextEnvelope creates a build_video_context command", () => {
	expect(
		buildVideoContextEnvelope({
			projectId: "project-1",
			mediaId: "media-1",
			language: "auto",
			modelId: "whisper-tiny",
		}),
	).toEqual({
		version: 1,
		projectId: "project-1",
		source: "codex",
		commands: [
			{
				id: "cmd-1",
				tool: "build_video_context",
				args: {
					mediaId: "media-1",
					language: "auto",
					modelId: "whisper-tiny",
				},
			},
		],
	});
});
```

- [ ] **Step 2: Run the failing CLI tests**

Run:

```bash
bun test scripts/__tests__/codex-bridge.test.mjs
```

Expected: FAIL because `buildVideoContextEnvelope` does not exist.

- [ ] **Step 3: Add CLI envelope builder and command branch**

Modify `scripts/codex-bridge.mjs` usage:

```js
"  node scripts/codex-bridge.mjs build-video-context --project-id <id> --media-id <id> --language <auto|code> --model-id <model>",
```

Add:

```js
export function buildVideoContextEnvelope({
	projectId,
	mediaId,
	language,
	modelId,
}) {
	if (!mediaId) {
		throw new Error("--media-id is required");
	}
	if (!language) {
		throw new Error("--language is required");
	}
	if (!modelId) {
		throw new Error("--model-id is required");
	}

	return buildCommandEnvelope({
		projectId,
		tool: "build_video_context",
		args: {
			mediaId,
			language,
			modelId,
		},
	});
}
```

Add the command branch in `runCli`:

```js
} else if (command === "build-video-context") {
	envelope = buildVideoContextEnvelope({
		projectId: flags.projectId,
		mediaId: flags.mediaId,
		language: flags.language,
		modelId: flags.modelId,
	});
```

- [ ] **Step 4: Run CLI tests**

Run:

```bash
bun test scripts/__tests__/codex-bridge.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/codex-bridge.mjs scripts/__tests__/codex-bridge.test.mjs
git commit -m "feat: add build video context cli command"
```

---

### Task 5: Update Documentation And Skill Contract

**Files:**
- Modify: `docs/codex-driven-editing.md`
- Modify: `skills/codecut-jianying-editor-framework/SKILL.md`
- Modify: `skills/codecut-jianying-editor-framework/references/codecut-agent-tool-contract.md`
- Modify: `skills/codecut-jianying-editor-framework/references/video-context-contract.md`

- [ ] **Step 1: Update executable workflow docs**

Modify `docs/codex-driven-editing.md` to insert `build_video_context` after `transcribe_media` in the context-building portion:

```md
8. Codex calls `build_video_context` for transcript-first planning when a long source video needs structured context.
9. Codex uses its own context to choose clips and write an EditPlan JSON file.
```

Add CLI command:

```bash
node scripts/codex-bridge.mjs build-video-context \
  --project-id <id> \
  --media-id <id> \
  --language auto \
  --model-id whisper-tiny
```

- [ ] **Step 2: Update Codecut skill routing**

Modify `skills/codecut-jianying-editor-framework/SKILL.md` so the Default Workflow includes:

```md
9. Use `node scripts/codex-bridge.mjs build-video-context --project-id <id> --media-id <id> --language auto --model-id <model>` when long-video or transcript-first planning needs merged source-timestamped context. This analyzes videos longer than 300 seconds in fixed 5-minute chunks without creating temporary media assets.
```

Renumber the later EditPlan steps.

- [ ] **Step 3: Update agent tool contract**

Modify `skills/codecut-jianying-editor-framework/references/codecut-agent-tool-contract.md` current implemented tool table:

```md
| `build_video_context` | Build local L2 transcript context for one imported audio/video asset; media longer than 300 seconds is analyzed in fixed 5-minute chunks and returned with source-video timestamps. |
```

Add to the current one path:

```text
get_project_info -> optional update_project_settings -> list_media_assets -> optional import_media_file -> transcribe_media -> build_video_context -> Codex writes EditPlan -> apply_edit_plan -> get_timeline_state
```

- [ ] **Step 4: Update VideoContext contract**

Modify `skills/codecut-jianying-editor-framework/references/video-context-contract.md` missing/current capability list:

```md
Implemented for MVP:

- L2 transcript context through local `build_video_context`
- fixed 300-second analysis chunking for long media
- source-video timestamp normalization across chunks
- deterministic transcript-based `oral_candidate` and filler hints
```

Keep scene detection, keyframes, OCR, and audio events in the missing/future list.

- [ ] **Step 5: Run documentation checks**

Run:

```bash
rg -n "build_video_context|build-video-context|300-second|5-minute" docs/codex-driven-editing.md skills/codecut-jianying-editor-framework
```

Expected: each modified document contains the new tool name and fixed chunking rule.

- [ ] **Step 6: Commit**

```bash
git add docs/codex-driven-editing.md skills/codecut-jianying-editor-framework/SKILL.md skills/codecut-jianying-editor-framework/references/codecut-agent-tool-contract.md skills/codecut-jianying-editor-framework/references/video-context-contract.md
git commit -m "docs: document local video context chunking"
```

---

### Task 6: Final Focused Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
bun test apps/web/src/lib/codex-executor/__tests__/video-context.test.ts apps/web/src/lib/codex-executor/__tests__/executor.test.ts scripts/__tests__/codex-bridge.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run focused lint on touched TypeScript**

Run:

```bash
bunx biome check apps/web/src/lib/codex-executor/transcription.ts apps/web/src/lib/codex-executor/video-context.ts apps/web/src/lib/codex-executor/__tests__/video-context.test.ts apps/web/src/lib/codex-executor/executor.ts apps/web/src/lib/codex-executor/__tests__/executor.test.ts
```

Expected: PASS.

- [ ] **Step 3: Check CLI help contains the new command**

Run:

```bash
node scripts/codex-bridge.mjs --help
```

Expected: output includes `build-video-context`.

- [ ] **Step 4: Confirm no unrelated files were changed by this implementation**

Run:

```bash
git diff --stat
```

Expected: changed files are limited to the files listed in this plan, plus any pre-existing dirty files that were already present before implementation.

- [ ] **Step 5: Commit final verification notes if documentation changed**

If verification changes only docs, commit them:

```bash
git add docs/codex-driven-editing.md skills/codecut-jianying-editor-framework/SKILL.md skills/codecut-jianying-editor-framework/references/codecut-agent-tool-contract.md skills/codecut-jianying-editor-framework/references/video-context-contract.md
git commit -m "docs: finalize video context verification notes"
```

If no files changed, do not create an empty commit.

## Plan Self-Review

- Spec coverage: the plan covers fixed 300-second chunking, source timestamp normalization, executor tool wiring, CLI usage, and documentation sync.
- Unresolved-marker scan: clear; no open-ended implementation gaps are present.
- Type consistency: the plan consistently uses `build_video_context` for the executor tool and `build-video-context` for the CLI command.
- Scope check: visual analysis, OCR, contact sheets, background jobs, and timeline mutation remain out of scope.
