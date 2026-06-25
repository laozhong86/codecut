import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import {
	AudioData,
	AudioDecoder,
	AudioEncoder,
	EncodedAudioChunk,
	EncodedVideoChunk,
	Mp4Demuxer,
	Mp4Muxer,
	VideoEncoder,
	VideoFrame,
} from "@napi-rs/webcodecs";
import {
	AudioSample,
	AudioSampleSource,
	BufferTarget,
	FlacOutputFormat,
	Mp3OutputFormat,
	Output,
	WavOutputFormat,
} from "mediabunny";
import type {
	EditPlanCaption,
	EditPlanCaptionStyle,
} from "@/lib/agent-bridge/edit-plan/schema";
import type { TextElement } from "@/types/timeline";
import {
	rebuildTimelineFromSpeechCleanup,
	type SpeechCleanupPlan,
} from "@/lib/speech-cleanup";
import type { DerivedAsset } from "@/types/project";
import {
	cloneLocalSegmentAsrCapabilities,
	cloneLocalSegmentAsrQuality,
} from "@/lib/transcription/asr-provider-contract";
import {
	createExecutorProject,
	executeCodexExecutorEnvelope,
	getExecutorBrowserBridgeToken,
	getExecutorProjectSnapshot,
	getExecutorProjectState,
	getExecutorStatus,
} from "../executor";

const projectId = "project-1";

function envelope({
	tool,
	args,
}: {
	tool:
		| "get_project_info"
		| "update_project_settings"
		| "list_media_assets"
		| "import_media_file"
		| "set_project_cover"
		| "clear_project_cover"
		| "transcribe_media"
		| "build_video_context"
		| "build_visual_context"
		| "build_video_quality_report"
		| "inspect_timeline"
		| "get_transcript"
		| "inspect_video_range"
		| "build_post_cut_captions"
		| "add_texts"
		| "add_captions"
		| "list_models"
		| "set_keyframes"
		| "search_media"
		| "insert_clips"
		| "move_clips"
		| "remove_clips"
		| "split_clip"
		| "set_clip_properties"
		| "ripple_delete_ranges"
		| "validate_edit_plan"
		| "preview_edit_plan"
		| "apply_edit_plan"
		| "apply_narrated_remix_plan"
		| "create_text_background_effect"
		| "create_human_pip_effect"
		| "generate_digital_human"
		| "generate_runninghub_voice_design"
		| "generate_runninghub_voice_clone"
		| "export_project"
		| "verify_timeline"
		| "get_timeline_state";
	args: Record<string, unknown>;
}) {
	return {
		version: 1,
		projectId,
		source: "codex",
		commands: [{ id: "cmd-1", tool, args }],
	};
}

function resultData<T>(result: unknown): T {
	if (typeof result !== "object" || !result || !("data" in result)) {
		throw new Error("Expected executor result data.");
	}
	return (result as { data: T }).data;
}

function asrContractFields() {
	return {
		capabilities: cloneLocalSegmentAsrCapabilities(),
		quality: cloneLocalSegmentAsrQuality(),
	};
}

function wordAsrContractFields() {
	return {
		capabilities: {
			segments: true,
			words: true,
			timestamps: { segments: true, words: true },
			confidence: false,
		},
		quality: {
			confidence: null,
			warnings: [],
		},
	};
}

function personMask(overrides: Partial<DerivedAsset> = {}): DerivedAsset {
	return {
		id: "mask-1",
		type: "person-mask",
		sourceMediaId: "source-id",
		alphaMediaId: "alpha-id",
		duration: 12,
		width: 1920,
		height: 1080,
		fps: 30,
		confidence: 0.8,
		createdAt: "2026-06-21T00:00:00.000Z",
		...overrides,
	};
}

function installFixtureWebCodecsGlobals() {
	const globals = globalThis as unknown as Record<string, unknown>;
	globals.AudioData ??= AudioData;
	globals.AudioDecoder ??= AudioDecoder;
	globals.AudioEncoder ??= AudioEncoder;
	globals.EncodedAudioChunk ??= EncodedAudioChunk;
	globals.EncodedVideoChunk ??= EncodedVideoChunk;
	globals.VideoEncoder ??= VideoEncoder;
	globals.VideoFrame ??= VideoFrame;
}

async function createFixtureMp4({
	width = 64,
	height = 36,
	fps = 4,
	duration = 1,
}: {
	width?: number;
	height?: number;
	fps?: number;
	duration?: number;
} = {}): Promise<Buffer> {
	const muxer = new Mp4Muxer({ fastStart: true });
	const codec = "avc1.42001E";
	muxer.addVideoTrack({ codec, width, height, framerate: fps });
	const encoder = new VideoEncoder({
		output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
		error: (error) => {
			throw error;
		},
	});
	encoder.configure({
		codec,
		width,
		height,
		bitrate: 200_000,
		framerate: fps,
		avc: { format: "avc" },
	});

	const canvas = createCanvas(width, height);
	const context = canvas.getContext("2d");
	const frameDurationUs = Math.round(1_000_000 / fps);
	const frameCount = Math.ceil(duration * fps);
	for (let i = 0; i < frameCount; i++) {
		context.fillStyle = i % 2 === 0 ? "#dc2626" : "#16a34a";
		context.fillRect(0, 0, width, height);
		context.fillStyle = "#ffffff";
		context.font = "12px sans-serif";
		context.fillText(`f${i}`, 4, 16);
		const frame = new VideoFrame(canvas, {
			timestamp: i * frameDurationUs,
			duration: frameDurationUs,
		});
		encoder.encode(frame, { keyFrame: i === 0 });
		frame.close();
	}

	await encoder.flush();
	encoder.close();
	const data = muxer.finalize();
	muxer.close();
	return Buffer.from(data);
}

async function createFixtureBareAudio({
	format,
	duration = 1,
	sampleRate = 48_000,
}: {
	format: "flac" | "mp3" | "wav";
	duration?: number;
	sampleRate?: number;
}): Promise<Buffer> {
	installFixtureWebCodecsGlobals();
	const channels = 2;
	const frameCount = Math.ceil(duration * sampleRate);
	const samples = new Float32Array(frameCount * channels);
	for (let i = 0; i < frameCount; i += 1) {
		const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
		samples[i * channels] = sample;
		samples[i * channels + 1] = sample;
	}

	const target = new BufferTarget();
	const outputFormat =
		format === "flac"
			? new FlacOutputFormat()
			: format === "mp3"
				? new Mp3OutputFormat()
				: new WavOutputFormat();
	const output = new Output({
		format: outputFormat,
		target,
	});
	const audioSource = new AudioSampleSource({
		codec: format === "flac" ? "flac" : format === "mp3" ? "mp3" : "pcm-f32",
		bitrate: 128_000,
	});
	output.addAudioTrack(audioSource);
	await output.start();

	const audioSample = new AudioSample({
		format: "f32",
		sampleRate,
		numberOfChannels: channels,
		timestamp: 0,
		data: samples.buffer,
	});
	await audioSource.add(audioSample);
	audioSample.close();
	audioSource.close();
	await output.finalize();

	if (!target.buffer) {
		throw new Error(`Fixture ${format} audio did not produce bytes.`);
	}
	return Buffer.from(target.buffer);
}

async function createFixtureAudioMp4({
	duration = 1,
	sampleRate = 48_000,
}: {
	duration?: number;
	sampleRate?: number;
} = {}): Promise<Buffer> {
	const channels = 2;
	const frameCount = Math.ceil(duration * sampleRate);
	const samples = new Float32Array(frameCount * channels);
	for (let i = 0; i < frameCount; i += 1) {
		const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
		samples[i * channels] = sample;
		samples[i * channels + 1] = sample;
	}
	const muxer = new Mp4Muxer({ fastStart: true });
	muxer.addAudioTrack({
		codec: "mp4a.40.2",
		sampleRate,
		numberOfChannels: channels,
	});
	const audioEncoder = new AudioEncoder({
		output: (chunk, metadata) => muxer.addAudioChunk(chunk, metadata),
		error: (error) => {
			throw error;
		},
	});
	audioEncoder.configure({
		codec: "mp4a.40.2",
		sampleRate,
		numberOfChannels: channels,
		bitrate: 128_000,
	});
	const audioData = new AudioData({
		format: "f32",
		sampleRate,
		numberOfFrames: frameCount,
		numberOfChannels: channels,
		timestamp: 0,
		data: samples.buffer,
	});
	audioEncoder.encode(audioData);
	audioData.close();
	await audioEncoder.flush();
	audioEncoder.close();
	const data = muxer.finalize();
	muxer.close();
	return Buffer.from(data);
}

async function readMp4Summary(bytes: Buffer): Promise<{
	duration: number | null;
	videoTrackCount: number;
	audioTrackCount: number;
	decodedAudioFrames: number;
}> {
	let decodedAudioFrames = 0;
	const audioDecoder = new AudioDecoder({
		output: (audioData) => {
			decodedAudioFrames += audioData.numberOfFrames;
			audioData.close();
		},
		error: (error) => {
			throw error;
		},
	});
	const demuxer = new Mp4Demuxer({
		audioOutput: (chunk) => audioDecoder.decode(chunk),
		error: (error) => {
			throw error;
		},
	});
	await demuxer.loadBuffer(bytes);
	const audioTrackCount = demuxer.tracks.filter(
		(track) => track.trackType === "audio",
	).length;
	if (audioTrackCount > 0) {
		const audioConfig = demuxer.audioDecoderConfig;
		if (!audioConfig) {
			throw new Error("MP4 summary expected an audio decoder config.");
		}
		audioDecoder.configure(audioConfig);
		await demuxer.demuxAsync();
		await audioDecoder.flush();
	}
	audioDecoder.close();
	const summary = {
		duration: demuxer.duration,
		videoTrackCount: demuxer.tracks.filter(
			(track) => track.trackType === "video",
		).length,
		audioTrackCount,
		decodedAudioFrames,
	};
	demuxer.close();
	return summary;
}

describe("codex executor", () => {
	let stateDir: string;
	let previousStateDir: string | undefined;

	beforeEach(async () => {
		previousStateDir = process.env.CODECUT_EXECUTOR_STATE_DIR;
		stateDir = await mkdtemp(join(tmpdir(), "codecut-executor-"));
		process.env.CODECUT_EXECUTOR_STATE_DIR = stateDir;
	});

	test("rejects project IDs that escape the executor projects directory", async () => {
		await expect(
			createExecutorProject({ projectId: "../escape", name: "Escape" }),
		).rejects.toThrow("projectId must be a safe identifier.");

		expect(
			await Bun.file(join(stateDir, "escape", "project.json")).exists(),
		).toBe(false);
	});

	test("lists imported media through the local executor", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});

		const listResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "list_media_assets", args: {} }),
		});

		expect(listResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "list_media_assets",
			success: true,
			message: "Found 1 media asset(s)",
			data: {
				assets: [
					{
						name: "source.mp4",
						type: "video",
						duration: 120,
						width: 1920,
						height: 1080,
					},
				],
			},
		});
	});

	test("sets and clears an independent project cover without adding timeline frames", async () => {
		await createExecutorProject({ projectId, name: "Project cover cut" });
		const coverImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "cover.png",
					mimeType: "image/png",
					base64: Buffer.from("png").toString("base64"),
					size: 3,
					lastModified: 1,
					width: 1080,
					height: 1920,
				},
			}),
		});
		const videoImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 8,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const coverMediaId = resultData<{ assets: Array<{ id: string }> }>(
			coverImport.results[0],
		).assets[0].id;
		const videoMediaId = resultData<{ assets: Array<{ id: string }> }>(
			videoImport.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: videoMediaId,
						target: { durationSec: 4, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 4,
								timelineStart: 0,
								fit: "cover",
								reason: "Main body clip",
							},
						],
						rationale: "Project cover must stay outside the timeline.",
					},
				},
			}),
		});
		const beforeState = await getExecutorProjectState({ projectId });

		const setResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "set_project_cover",
				args: {
					mediaId: coverMediaId,
					title: "别乱花钱",
					prompt: "竖版 9:16 短视频封面，标题设计是画面核心",
					stylePreset: "viral_chinese_title_cover",
				},
			}),
		});
		const afterSetState = await getExecutorProjectState({ projectId });
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: { format: "v2" },
			}),
		});
		const projectInfoResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_project_info", args: {} }),
		});
		const snapshot = await getExecutorProjectSnapshot({ projectId });

		expect(setResult.results[0]).toMatchObject({
			tool: "set_project_cover",
			success: true,
			data: {
				cover: {
					mediaId: coverMediaId,
					source: "media_asset",
					title: "别乱花钱",
					prompt: "竖版 9:16 短视频封面，标题设计是画面核心",
					stylePreset: "viral_chinese_title_cover",
					width: 1080,
					height: 1920,
				},
			},
		});
		expect(afterSetState.revision).toBe(beforeState.revision + 1);
		expect(afterSetState.tracks).toEqual(beforeState.tracks);
		expect(afterSetState.cover).toMatchObject({
			mediaId: coverMediaId,
			source: "media_asset",
			title: "别乱花钱",
			width: 1080,
			height: 1920,
		});

		const timelineData = resultData<{
			project: { totalDuration: number };
			window: { totalElementCount: number };
			cover?: { mediaId: string; title?: string };
		}>(timelineResult.results[0]);
		expect(timelineData.project.totalDuration).toBe(4);
		expect(timelineData.window.totalElementCount).toBe(1);
		expect(timelineData.cover).toMatchObject({
			mediaId: coverMediaId,
			title: "别乱花钱",
		});
		expect(
			resultData<{ cover?: { mediaId: string } }>(projectInfoResult.results[0])
				.cover,
		).toMatchObject({ mediaId: coverMediaId });
		expect(snapshot.cover).toMatchObject({ mediaId: coverMediaId });

		const clearResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "clear_project_cover", args: {} }),
		});
		const afterClearState = await getExecutorProjectState({ projectId });

		expect(clearResult.results[0]).toMatchObject({
			tool: "clear_project_cover",
			success: true,
			data: { cover: null, revision: afterSetState.revision + 1 },
		});
		expect(afterClearState.cover).toBeUndefined();
		expect(afterClearState.tracks).toEqual(beforeState.tracks);
	});

	test("rejects a project cover that is not a dimensioned image asset without mutating revision", async () => {
		await createExecutorProject({ projectId, name: "Project cover guard" });
		const videoImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 8,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const videoMediaId = resultData<{ assets: Array<{ id: string }> }>(
			videoImport.results[0],
		).assets[0].id;
		const beforeState = await getExecutorProjectState({ projectId });

		const setResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "set_project_cover",
				args: { mediaId: videoMediaId, title: "封面标题" },
			}),
		});
		const afterState = await getExecutorProjectState({ projectId });

		expect(setResult.results[0]).toMatchObject({
			tool: "set_project_cover",
			success: false,
			message: "Project cover media must be an image asset.",
		});
		expect(afterState.revision).toBe(beforeState.revision);
		expect(afterState.cover).toBeUndefined();
	});

	test("rejects imported video without dimensions before saving media", async () => {
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
					duration: 120,
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(importResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "import_media_file",
			success: false,
			message: "Imported video width and height are required.",
		});
		expect(state.mediaAssets).toEqual([]);
	});

	test("summarizes spokenScript metadata in media asset readback", async () => {
		await createExecutorProject({ projectId, name: "Scripted TTS readback" });
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "narration.wav",
					mimeType: "audio/wav",
					base64: Buffer.from("audio").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 8,
					spokenScript: {
						source: "tts",
						text: "A pizza portion costs $2.34. Venmo that ASAP.",
						captions: ["A pizza portion costs $2.34.", "Venmo that ASAP."],
						protectedTerms: ["$2.34", "Venmo that ASAP"],
					},
				},
			}),
		});

		const listResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "list_media_assets", args: {} }),
		});

		const data = resultData<{
			assets: Array<Record<string, unknown>>;
		}>(listResult.results[0]);
		expect(data.assets[0]).toMatchObject({
			name: "narration.wav",
			type: "audio",
			hasSpokenScript: true,
			spokenScriptCaptionLineCount: 2,
			spokenScriptProtectedTermCount: 2,
		});
		expect(data.assets[0]).not.toHaveProperty("spokenScript");
		expect(JSON.stringify(data.assets[0])).not.toContain("$2.34");
	});

	test("summarizes spokenScript metadata in referenced media readback", async () => {
		await createExecutorProject({ projectId, name: "Scripted TTS timeline" });
		const videoImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const audioImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "narration.wav",
					mimeType: "audio/wav",
					base64: Buffer.from("audio").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 8,
					spokenScript: {
						source: "tts",
						text: "A pizza portion costs $2.34. Venmo that ASAP.",
						captions: ["A pizza portion costs $2.34.", "Venmo that ASAP."],
						protectedTerms: ["$2.34", "Venmo that ASAP"],
					},
				},
			}),
		});
		const videoId = resultData<{ assets: Array<{ id: string }> }>(
			videoImport.results[0],
		).assets[0].id;
		const audioId = resultData<{ assets: Array<{ id: string }> }>(
			audioImport.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: videoId,
						target: { durationSec: 8, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 8,
								timelineStart: 0,
								reason: "Reference clip",
							},
						],
						audio: {
							bgm: {
								assetId: audioId,
								volume: 1,
								mode: "loop_to_timeline",
							},
						},
						rationale: "Referenced scripted TTS media readback",
					},
				},
			}),
		});

		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: { format: "v2", includeReferencedMedia: true },
			}),
		});

		const data = resultData<{
			referencedMedia?: Record<string, Record<string, unknown>>;
		}>(timelineResult.results[0]);
		expect(data.referencedMedia?.[audioId]).toMatchObject({
			name: "narration.wav",
			type: "audio",
			hasSpokenScript: true,
			spokenScriptCaptionLineCount: 2,
			spokenScriptProtectedTermCount: 2,
		});
		expect(data.referencedMedia?.[audioId]).not.toHaveProperty("spokenScript");
		expect(JSON.stringify(data.referencedMedia?.[audioId])).not.toContain(
			"$2.34",
		);
	});

	test("lazily adds a browser bridge token to existing executor projects", async () => {
		await createExecutorProject({ projectId, name: "Legacy Codex cut" });
		const state = await getExecutorProjectState({ projectId });
		const { browserBridgeToken: _browserBridgeToken, ...legacyState } = state;
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(legacyState, null, 2)}\n`,
			"utf8",
		);

		const token = await getExecutorBrowserBridgeToken({ projectId });
		const migratedState = await getExecutorProjectState({ projectId });

		expect(token).toEqual(expect.any(String));
		expect(migratedState.browserBridgeToken).toBe(token);
	});

	afterEach(async () => {
		if (previousStateDir === undefined) {
			delete process.env.CODECUT_EXECUTOR_STATE_DIR;
		} else {
			process.env.CODECUT_EXECUTOR_STATE_DIR = previousStateDir;
		}
		await rm(stateDir, { recursive: true, force: true });
	});

	async function seedDraftState({
		tracks,
		mediaAssets = [],
	}: {
		tracks: Array<Record<string, unknown>>;
		mediaAssets?: Array<Record<string, unknown>>;
	}) {
		await createExecutorProject({ projectId, name: "Verifiable edit loop" });
		const now = "2026-06-22T00:00:00.000Z";
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			JSON.stringify(
				{
					version: 1,
					revision: 1,
					project: {
						id: projectId,
						name: "Verifiable edit loop",
						settings: {
							canvasSize: { width: 1080, height: 1920 },
							fps: 30,
							background: { type: "color", color: "#000000" },
						},
						createdAt: now,
						updatedAt: now,
					},
					mediaAssets,
					derivedAssets: [],
					tracks,
				},
				null,
				2,
			),
		);
	}

	async function writeDraftState(state: unknown) {
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);
	}

	function qualityPlan({ videoId }: { videoId: string }) {
		return {
			version: 1,
			projectId,
			sourceMediaId: videoId,
			target: { durationSec: 2, aspectRatio: "9:16" },
			clips: [
				{
					id: "clip-1",
					sourceStart: 0,
					sourceEnd: 1,
					timelineStart: 0,
					fit: "cover",
					reason: "Hook beat.",
				},
				{
					id: "clip-2",
					sourceStart: 1,
					sourceEnd: 2,
					timelineStart: 1,
					fit: "cover",
					reason: "Proof beat.",
				},
			],
			title: {
				text: "OK",
				startTime: 0,
				duration: 1,
			},
			captions: [
				{
					text: "Caption proof",
					startTime: 0,
					duration: 1,
				},
			],
			captionStyle: {
				preset: "short-form-bold",
				position: "lower-safe",
				size: "medium",
			},
			transitions: [
				{
					fromClipId: "clip-1",
					toClipId: "clip-2",
					type: "fade",
					duration: 0.25,
				},
			],
			rationale: "Quality report fixture.",
		};
	}

	async function createAppliedQualityFixture() {
		await createExecutorProject({ projectId, name: "Quality report cut" });
		const fixtureVideo = await createFixtureMp4({
			width: 64,
			height: 36,
			fps: 4,
			duration: 2,
		});
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: fixtureVideo.toString("base64"),
					size: fixtureVideo.byteLength,
					lastModified: 1,
					duration: 2,
					width: 64,
					height: 36,
				},
			}),
		});
		const videoId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		const plan = qualityPlan({ videoId });
		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan,
				},
			}),
		});
		expect(applyResult.results[0]).toMatchObject({ success: true });
		return { plan, videoId };
	}

	test("imports media and exposes project info without a browser-mounted bridge", async () => {
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
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const infoResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_project_info", args: {} }),
		});

		expect(importResult.status).toBe("completed");
		expect(importResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "import_media_file",
			success: true,
			data: {
				assets: [
					{
						name: "source.mp4",
						type: "video",
						duration: 120,
						width: 1920,
						height: 1080,
					},
				],
			},
		});
		expect(infoResult.results[0]).toMatchObject({
			success: true,
			data: {
				name: "Codex cut",
				canvasSize: { width: 1080, height: 1920 },
				mediaAssets: [{ name: "source.mp4", duration: 120 }],
			},
		});
	});

	test("generate_digital_human creates a local video media asset", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importImage = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "portrait.png",
					mimeType: "image/png",
					base64: Buffer.from("image").toString("base64"),
					size: 5,
					lastModified: 1,
					width: 1280,
					height: 720,
				},
			}),
		});
		const importAudio = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "voice.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("audio").toString("base64"),
					size: 5,
					lastModified: 2,
					duration: 3,
				},
			}),
		});
		const imageId = resultData<{ assets: Array<{ id: string }> }>(
			importImage.results[0],
		).assets[0].id;
		const audioId = resultData<{ assets: Array<{ id: string }> }>(
			importAudio.results[0],
		).assets[0].id;

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_digital_human",
				args: {
					imageMediaId: imageId,
					audioMediaId: audioId,
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				},
			}),
			env: { RUNNINGHUB_API_KEY: "rh-key" },
			generateDigitalHuman: async ({
				apiKey,
				imageAsset,
				audioAsset,
				request,
			}) => {
				expect(apiKey).toBe("rh-key");
				expect(imageAsset.id).toBe(imageId);
				expect(audioAsset.id).toBe(audioId);
				expect(request).toMatchObject({
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				});
				return {
					taskId: "task-1",
					videoBytes: Buffer.from("mp4"),
					mimeType: "video/mp4",
					duration: 3,
				};
			},
		});

		expect(result.results[0]).toMatchObject({
			tool: "generate_digital_human",
			success: true,
			message: "Generated digital human video 'digital-human-task-1.mp4'",
			data: {
				taskId: "task-1",
				provider: "runninghub-digital-human",
				duration: 3,
				name: "digital-human-task-1.mp4",
			},
		});
		expect(
			typeof resultData<{ mediaId: string }>(result.results[0]).mediaId,
		).toBe("string");

		const snapshot = await getExecutorProjectSnapshot({ projectId });
		expect(snapshot.mediaAssets).toContainEqual(
			expect.objectContaining({
				name: "digital-human-task-1.mp4",
				type: "video",
				duration: 3,
				size: 3,
			}),
		);
	});

	test("generate_digital_human rejects wrong media types and missing API key", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const importAudio = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "voice.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("audio").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 3,
				},
			}),
		});
		const audioId = resultData<{ assets: Array<{ id: string }> }>(
			importAudio.results[0],
		).assets[0].id;

		const wrongType = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_digital_human",
				args: {
					imageMediaId: audioId,
					audioMediaId: audioId,
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				},
			}),
			env: { RUNNINGHUB_API_KEY: "rh-key" },
			generateDigitalHuman: async () => {
				throw new Error("should not run");
			},
		});

		expect(wrongType.results[0]).toMatchObject({
			success: false,
			message: expect.stringContaining("expected image"),
		});

		const missingKey = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_digital_human",
				args: {
					imageMediaId: "image-1",
					audioMediaId: audioId,
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				},
			}),
			env: {},
			generateDigitalHuman: async () => {
				throw new Error("should not run");
			},
		});

		expect(missingKey.results[0]).toMatchObject({
			success: false,
			message: "RUNNINGHUB_API_KEY is required",
		});
		expect(JSON.stringify(missingKey)).not.toContain("rh-key");
	});

	test("generate_runninghub_voice_design creates a local audio media asset", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const voiceBytes = await createFixtureBareAudio({ format: "wav" });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_runninghub_voice_design",
				args: {
					text: "欢迎来到今天的测试",
					emotionPrompt: "温柔、稳定的中文播客女声",
					protectedTerms: ["今天的测试"],
				},
			}),
			env: { RUNNINGHUB_API_KEY: "rh-key" },
			generateVoiceDesign: async ({ apiKey, request }) => {
				expect(apiKey).toBe("rh-key");
				expect(request).toEqual({
					text: "欢迎来到今天的测试",
					emotionPrompt: "温柔、稳定的中文播客女声",
				});
				return {
					taskId: "voice-task-1",
					audioBytes: voiceBytes,
					mimeType: "audio/wav",
				};
			},
		});

		expect(result.results[0]).toMatchObject({
			tool: "generate_runninghub_voice_design",
			success: true,
			message:
				"Generated RunningHub voice 'runninghub-voice-design-voice-task-1.wav'",
			data: {
				taskId: "voice-task-1",
				provider: "runninghub-voice-design",
				name: "runninghub-voice-design-voice-task-1.wav",
				voiceConsistency: {
					provider: "runninghub-voice-design",
					providerTaskId: "voice-task-1",
					scriptCaptionLineCount: 1,
					protectedTermCount: 1,
				},
			},
		});
		expect(
			typeof resultData<{ mediaId: string }>(result.results[0]).mediaId,
		).toBe("string");
		expect(
			resultData<{ audioPath: string }>(result.results[0]).audioPath,
		).toContain("generated-voice-");

		const snapshot = await getExecutorProjectSnapshot({ projectId });
		expect(snapshot.mediaAssets).toContainEqual(
			expect.objectContaining({
				name: "runninghub-voice-design-voice-task-1.wav",
				type: "audio",
				mimeType: "audio/wav",
			}),
		);
		const state = await getExecutorProjectState({ projectId });
		const asset = state.mediaAssets.find(
			(item) => item.name === "runninghub-voice-design-voice-task-1.wav",
		);
		expect(asset?.size).toBeGreaterThan(0);
		expect(asset?.duration).toBeGreaterThan(0.9);
		expect(asset?.duration).toBeLessThan(1.1);
		expect(asset?.spokenScript).toMatchObject({
			source: "tts",
			text: "欢迎来到今天的测试",
			captions: ["欢迎来到今天的测试"],
			protectedTerms: ["今天的测试"],
			provider: "runninghub-voice-design",
			providerTaskId: "voice-task-1",
		});

		const listResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "list_media_assets", args: {} }),
		});
		const listData = resultData<{
			assets: Array<Record<string, unknown>>;
		}>(listResult.results[0]);
		expect(listData.assets[0]).toMatchObject({
			hasSpokenScript: true,
			spokenScriptProvider: "runninghub-voice-design",
			spokenScriptProviderTaskId: "voice-task-1",
			spokenScriptCaptionLineCount: 1,
			spokenScriptProtectedTermCount: 1,
		});
		expect(JSON.stringify(listData.assets[0])).not.toContain("欢迎来到今天");
	});

	test("generate_runninghub_voice_design normalizes FLAC results to timeline-ready WAV", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const flacBytes = await createFixtureBareAudio({
			format: "flac",
			duration: 1.25,
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_runninghub_voice_design",
				args: {
					text: "欢迎来到今天的测试",
					emotionPrompt: "温柔、稳定的中文播客女声",
				},
			}),
			env: { RUNNINGHUB_API_KEY: "rh-key" },
			generateVoiceDesign: async () => ({
				taskId: "voice-task-flac",
				audioBytes: flacBytes,
				mimeType: "audio/x-flac",
			}),
		});

		expect(result.results[0]).toMatchObject({
			tool: "generate_runninghub_voice_design",
			success: true,
			message:
				"Generated RunningHub voice 'runninghub-voice-design-voice-task-flac.wav'",
			data: {
				taskId: "voice-task-flac",
				provider: "runninghub-voice-design",
				name: "runninghub-voice-design-voice-task-flac.wav",
			},
		});
		const state = await getExecutorProjectState({ projectId });
		const asset = state.mediaAssets.find(
			(item) =>
				item.id === resultData<{ mediaId: string }>(result.results[0]).mediaId,
		);
		expect(asset).toMatchObject({
			name: "runninghub-voice-design-voice-task-flac.wav",
			type: "audio",
			mimeType: "audio/wav",
		});
		expect(asset?.duration).toBeGreaterThan(1.2);
		expect(asset?.duration).toBeLessThan(1.3);
		const savedBytes = await readFile(asset?.path ?? "");
		expect(savedBytes.subarray(0, 4).toString("utf8")).toBe("RIFF");
		expect(savedBytes.subarray(8, 12).toString("utf8")).toBe("WAVE");
	});

	test("generate_runninghub_voice_design rejects invalid WAV results before saving", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_runninghub_voice_design",
				args: {
					text: "欢迎来到今天的测试",
					emotionPrompt: "温柔、稳定的中文播客女声",
				},
			}),
			env: { RUNNINGHUB_API_KEY: "rh-key" },
			generateVoiceDesign: async () => ({
				taskId: "voice-task-invalid-wav",
				audioBytes: Buffer.from("not a wav"),
				mimeType: "audio/wav",
			}),
		});

		expect(result.results[0]).toMatchObject({
			tool: "generate_runninghub_voice_design",
			success: false,
			message: "RunningHub voice WAV result is not a RIFF/WAVE file",
		});
		const state = await getExecutorProjectState({ projectId });
		expect(
			state.mediaAssets.some((item) =>
				item.name.includes("voice-task-invalid-wav"),
			),
		).toBe(false);
	});

	test("generate_runninghub_voice_clone clones from an absolute local audio path", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const tempDir = await mkdtemp(join(tmpdir(), "voice-clone-"));
		const referencePath = join(tempDir, "reference.wav");
		await writeFile(
			referencePath,
			await createFixtureBareAudio({ format: "wav" }),
		);
		const cloneBytes = await createFixtureBareAudio({ format: "wav" });

		try {
			const result = await executeCodexExecutorEnvelope({
				envelope: envelope({
					tool: "generate_runninghub_voice_clone",
					args: {
						audioPath: referencePath,
						text: "欢迎来到今天的测试",
						protectedTerms: ["今天的测试"],
					},
				}),
				env: { RUNNINGHUB_API_KEY: "rh-key" },
				generateVoiceClone: async ({ apiKey, referenceAudioPath, request }) => {
					expect(apiKey).toBe("rh-key");
					expect(referenceAudioPath).toBe(referencePath);
					expect(request).toEqual({
						text: "欢迎来到今天的测试",
					});
					return {
						taskId: "voice-clone-task-1",
						audioBytes: cloneBytes,
						mimeType: "audio/wav",
					};
				},
			});

			expect(result.results[0]).toMatchObject({
				tool: "generate_runninghub_voice_clone",
				success: true,
				message:
					"Generated RunningHub voice 'runninghub-voice-clone-voice-clone-task-1.wav'",
				data: {
					taskId: "voice-clone-task-1",
					provider: "runninghub-voice-clone",
					name: "runninghub-voice-clone-voice-clone-task-1.wav",
					voiceConsistency: {
						provider: "runninghub-voice-clone",
						providerTaskId: "voice-clone-task-1",
						scriptCaptionLineCount: 1,
						protectedTermCount: 1,
					},
				},
			});
			expect(
				typeof resultData<{ mediaId: string }>(result.results[0]).mediaId,
			).toBe("string");
			expect(
				resultData<{ audioPath: string }>(result.results[0]).audioPath,
			).toContain("generated-voice-");
			const state = await getExecutorProjectState({ projectId });
			const asset = state.mediaAssets.find(
				(item) =>
					item.id ===
					resultData<{ mediaId: string }>(result.results[0]).mediaId,
			);
			expect(asset?.spokenScript).toMatchObject({
				provider: "runninghub-voice-clone",
				providerTaskId: "voice-clone-task-1",
				protectedTerms: ["今天的测试"],
			});
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("generate_runninghub_voice_clone rejects missing API key and invalid reference path", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });

		const missingKey = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_runninghub_voice_clone",
				args: {
					audioPath: "/tmp/reference.wav",
					text: "hello",
				},
			}),
			env: {},
			generateVoiceClone: async () => {
				throw new Error("should not run");
			},
		});

		expect(missingKey.results[0]).toMatchObject({
			success: false,
			message: "RUNNINGHUB_API_KEY is required",
		});

		const invalidPath = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "generate_runninghub_voice_clone",
				args: {
					audioPath: "relative.wav",
					text: "hello",
				},
			}),
			env: { RUNNINGHUB_API_KEY: "rh-key" },
			generateVoiceClone: async () => {
				throw new Error("should not run");
			},
		});

		expect(invalidPath.results[0]).toMatchObject({
			success: false,
			message: "audioPath must be an absolute path",
		});
	});

	test("applies an EditPlan and exposes timeline state plus run status", async () => {
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
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 12, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 10,
								sourceEnd: 22,
								timelineStart: 0,
								sourceCrop: { x: 690, y: 0, width: 540, height: 960 },
								reason: "Hook",
							},
						],
						title: { text: "Main claim", startTime: 0, duration: 3 },
						rationale: "Short cut",
					},
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});
		const status = await getExecutorStatus({ projectId });
		const state = await getExecutorProjectState({ projectId });

		expect(applyResult.results[0]).toMatchObject({
			success: true,
			summary: { clipCount: 1, totalDuration: 12, rationale: "Short cut" },
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				revision: state.revision,
				totalDuration: 12,
				tracks: [
					{
						type: "text",
						elements: [
							{
								type: "text",
								content: "Main claim",
								style: {
									fontSize: 15,
									transform: { position: { x: 0, y: 0 }, scale: 1 },
								},
							},
						],
					},
					{
						type: "video",
						elements: [
							{
								type: "video",
								mediaId,
								trimStart: 10,
								trimEnd: 22,
								visual: {
									opacity: 1,
									sourceCrop: { x: 690, y: 0, width: 540, height: 960 },
									transform: { position: { x: 0, y: 0 }, scale: 1 },
								},
							},
						],
					},
				],
			},
		});
		expect(status).toMatchObject({
			projectId,
			status: "succeeded",
			tool: "get_timeline_state",
			message: "Timeline has 2 track(s), total duration: 12.00s",
			revision: state.revision,
		});
		expect(state.revision).toBeGreaterThan(1);
	});

	test("keeps get_timeline_state v1 default and exposes explicit v2 orientation data", async () => {
		await createExecutorProject({ projectId, name: "Timeline v2 proof" });
		const importVideoResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importVideoResult.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "unused.png",
					mimeType: "image/png",
					base64: Buffer.from("image").toString("base64"),
					size: 5,
					lastModified: 2,
					width: 800,
					height: 800,
				},
			}),
		});
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 10, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 4,
								timelineStart: 0,
								reason: "Opening",
							},
							{
								id: "clip-2",
								sourceStart: 10,
								sourceEnd: 16,
								timelineStart: 4,
								reason: "Proof",
							},
						],
						captions: [
							{ text: "Opening claim", startTime: 1, duration: 2 },
							{ text: "Proof point", startTime: 5, duration: 2 },
						],
						captionStyle: {
							preset: "talking-head-pop",
							position: "lower-safe",
							size: "medium",
						},
						rationale: "Timeline v2 proof",
					},
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });

		const v1Result = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});
		const v1Data = resultData<Record<string, unknown>>(v1Result.results[0]);
		expect("schemaVersion" in v1Data).toBe(false);
		expect(v1Result.results[0]).toMatchObject({
			success: true,
			data: {
				revision: state.revision,
				totalDuration: 10,
				derivedAssets: [],
			},
		});
		expect(v1Data.tracks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "text",
					elements: expect.arrayContaining([
						expect.objectContaining({ content: "Opening claim" }),
					]),
				}),
				expect.objectContaining({
					type: "video",
					elements: expect.arrayContaining([
						expect.objectContaining({ mediaId }),
					]),
				}),
			]),
		);
		const v1TextTrack = (
			v1Data.tracks as Array<{
				type?: string;
				elements?: Array<Record<string, unknown>>;
			}>
		).find((track) => track.type === "text");
		expect(v1TextTrack?.elements?.[0]).toMatchObject({
			content: "Opening claim",
			startTime: 1,
			duration: 2,
			style: {
				fontFamily: "CodecutCJK",
				fontSize: 4.8,
				color: "#fff3b0",
				stroke: { color: "#101010", width: 3 },
				backgroundColor: "transparent",
				boxWidth: 44,
				transform: { scale: 1, position: { x: 0, y: 520 }, rotate: 0 },
			},
		});

		const v2Result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: {
					format: "v2",
					startTime: 3,
					endTime: 7,
					includeFrames: true,
					includeReferencedMedia: true,
				},
			}),
		});

		expect(v2Result.results[0]).toMatchObject({
			success: true,
			data: {
				schemaVersion: 2,
				project: {
					id: projectId,
					name: "Timeline v2 proof",
					revision: state.revision,
					settings: {
						fps: 30,
						canvasSize: { width: 1080, height: 1920 },
						background: { type: "color", color: "#000000" },
					},
					totalDuration: 10,
					totalFrames: 300,
				},
				window: {
					startTime: 3,
					endTime: 7,
					startFrame: 90,
					endFrame: 210,
					totalElementCount: 4,
					returnedElementCount: 3,
				},
				summary: {
					trackCount: 2,
					elementCount: 4,
					returnedElementCount: 3,
					transitionCount: 0,
					derivedAssetCount: 0,
					trackTypeCounts: {
						video: 1,
						text: 1,
						audio: 0,
						sticker: 0,
					},
				},
				tracks: [
					{
						type: "text",
						index: 0,
						elementCount: 2,
						returnedElementCount: 1,
						timeRange: { startTime: 1, endTime: 7, duration: 6 },
						elements: [
							{
								type: "text",
								content: "Proof point",
								trackIndex: 0,
								index: 1,
								startTime: 5,
								duration: 2,
								endTime: 7,
								startFrame: 150,
								durationFrames: 60,
								endFrame: 210,
							},
						],
					},
					{
						type: "video",
						index: 1,
						elementCount: 2,
						returnedElementCount: 2,
						timeRange: { startTime: 0, endTime: 10, duration: 10 },
						elements: [
							{
								type: "video",
								mediaId,
								trackIndex: 1,
								index: 0,
								startTime: 0,
								duration: 4,
								endTime: 4,
								startFrame: 0,
								durationFrames: 120,
								endFrame: 120,
								trimStartFrame: 0,
								trimEndFrame: 120,
							},
							{
								type: "video",
								mediaId,
								trackIndex: 1,
								index: 1,
								startTime: 4,
								duration: 6,
								endTime: 10,
								startFrame: 120,
								durationFrames: 180,
								endFrame: 300,
								trimStartFrame: 300,
								trimEndFrame: 480,
							},
						],
					},
				],
				referencedMedia: {
					[mediaId]: {
						id: mediaId,
						name: "source.mp4",
						type: "video",
						mimeType: "video/mp4",
						duration: 120,
						width: 1920,
						height: 1080,
					},
				},
				derivedAssets: [],
			},
		});
		const v2Data = resultData<{
			tracks: Array<{
				type: string;
				elements: Array<Record<string, unknown>>;
			}>;
			referencedMedia?: Record<string, { name: string }>;
		}>(v2Result.results[0]);
		const v2TextTrack = v2Data.tracks.find((track) => track.type === "text");
		expect(v2TextTrack?.elements[0]).toMatchObject({
			content: "Proof point",
			startTime: 5,
			duration: 2,
			style: {
				fontFamily: "CodecutCJK",
				fontSize: 4.8,
				color: "#fff3b0",
				stroke: { color: "#101010", width: 3 },
				backgroundColor: "transparent",
				boxWidth: 44,
				transform: { scale: 1, position: { x: 0, y: 520 }, rotate: 0 },
			},
		});
		expect(
			Object.values(v2Data.referencedMedia ?? {}).map((asset) => asset.name),
		).toEqual(["source.mp4"]);
	});

	test("omits derived frame fields from get_timeline_state v2 unless requested", async () => {
		await createExecutorProject({ projectId, name: "Timeline v2 seconds" });
		const now = "2026-06-22T00:00:00.000Z";
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			JSON.stringify(
				{
					version: 1,
					revision: 2,
					project: {
						id: projectId,
						name: "Timeline v2 seconds",
						settings: {
							canvasSize: { width: 1080, height: 1920 },
							fps: 30,
							background: { type: "color", color: "#000000" },
						},
						createdAt: now,
						updatedAt: now,
					},
					mediaAssets: [],
					derivedAssets: [],
					tracks: [
						{
							id: "text-track-1",
							type: "text",
							name: "Text track",
							hidden: false,
							elements: [
								{
									id: "text-1",
									type: "text",
									name: "Caption",
									content: "Seconds first",
									richSpans: [],
									fontSize: 12,
									fontFamily: "Inter",
									color: "#ffffff",
									backgroundColor: "transparent",
									textAlign: "center",
									fontWeight: "bold",
									fontStyle: "normal",
									textDecoration: "none",
									hidden: false,
									transform: {
										scale: 1,
										position: { x: 0, y: 0 },
										rotate: 0,
									},
									opacity: 1,
									startTime: 1.25,
									duration: 2.5,
									trimStart: 0,
									trimEnd: 0,
								},
							],
						},
					],
				},
				null,
				2,
			),
		);

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: { format: "v2" },
			}),
		});
		const data = resultData<{
			project: Record<string, unknown>;
			window: Record<string, unknown>;
			tracks: Array<{
				elements: Array<Record<string, unknown>>;
			}>;
		}>(result.results[0]);
		const element = data.tracks[0].elements[0];

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				schemaVersion: 2,
				project: {
					totalDuration: 3.75,
				},
				window: {
					startTime: 0,
					endTime: 3.75,
				},
				tracks: [
					{
						elements: [
							{
								startTime: 1.25,
								duration: 2.5,
								endTime: 3.75,
							},
						],
					},
				],
			},
		});
		expect(data.project.totalFrames).toBeUndefined();
		expect(data.window.startFrame).toBeUndefined();
		expect(data.window.endFrame).toBeUndefined();
		expect(element.startFrame).toBeUndefined();
		expect(element.durationFrames).toBeUndefined();
		expect(element.endFrame).toBeUndefined();
		expect(element.trimStartFrame).toBeUndefined();
		expect(element.trimEndFrame).toBeUndefined();
	});

	test("rejects get_timeline_state v2 windows where endTime is before startTime", async () => {
		await createExecutorProject({
			projectId,
			name: "Timeline v2 invalid window",
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: { format: "v2", startTime: 5, endTime: 4 },
			}),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(result.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "get_timeline_state",
			success: false,
			message:
				"get_timeline_state v2 endTime must be greater than or equal to startTime.",
		});
		expect(state.revision).toBe(1);
	});

	test("project info exposes draft revision summary and last executor status", async () => {
		await createExecutorProject({ projectId, name: "Draft truth" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 8, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 8,
								timelineStart: 0,
								reason: "Hook",
							},
						],
						captions: [
							{
								text: "这是字幕",
								startTime: 0.5,
								duration: 2,
							},
						],
						captionStyle: {
							preset: "talking-head-pop",
							position: "lower-safe",
							size: "medium",
						},
						rationale: "Draft truth proof",
					},
				},
			}),
		});
		const infoResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_project_info", args: {} }),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(infoResult.results[0]).toMatchObject({
			success: true,
			data: {
				revision: state.revision,
				draft: {
					version: 1,
					revision: state.revision,
					mediaCount: 1,
					trackCount: 2,
					elementCount: 2,
				},
				tracks: [
					{
						type: "text",
						elementCount: 1,
					},
					{
						type: "video",
						elementCount: 1,
					},
				],
				lastStatus: {
					status: "succeeded",
					tool: "apply_edit_plan",
					revision: state.revision,
				},
			},
		});
	});

	test("validate and preview EditPlan do not mutate project revision", async () => {
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
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		const before = await getExecutorProjectState({ projectId });
		const plan = {
			version: 1,
			projectId,
			sourceMediaId: mediaId,
			target: { durationSec: 12, aspectRatio: "9:16" },
			clips: [
				{
					id: "clip-1",
					sourceStart: 10,
					sourceEnd: 22,
					timelineStart: 0,
					reason: "Hook",
				},
			],
			captions: [{ text: "Main claim", startTime: 0, duration: 2 }],
			captionStyle: {
				preset: "black-bar",
				position: "lower-safe",
				size: "medium",
			},
			rationale: "Short cut",
		};

		const validateResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "validate_edit_plan",
				args: { plan },
			}),
		});
		const previewResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "preview_edit_plan",
				args: { plan },
			}),
		});
		const after = await getExecutorProjectState({ projectId });

		expect(validateResult.results[0]).toMatchObject({
			tool: "validate_edit_plan",
			success: true,
			data: {
				valid: true,
				revision: before.revision,
			},
		});
		expect(previewResult.results[0]).toMatchObject({
			tool: "preview_edit_plan",
			success: true,
			data: {
				summary: {
					clipCount: 1,
					captionCount: 1,
					audioCount: 0,
					transitionCount: 0,
					willReplaceTimeline: true,
				},
				clips: [
					{
						id: "clip-1",
						sourceStart: 10,
						sourceEnd: 22,
						timelineStart: 0,
						duration: 12,
					},
				],
			},
		});
		expect(after.revision).toBe(before.revision);
		expect(after.tracks).toEqual([]);
	});

	test("exports an applied timeline to an explicit local file", async () => {
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
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 12, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 10,
								sourceEnd: 22,
								timelineStart: 0,
								sourceCrop: { x: 690, y: 0, width: 540, height: 960 },
								reason: "Hook",
							},
						],
						rationale: "Short cut",
					},
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const outputFile = join(stateDir, "out.mp4");

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile,
					overwrite: false,
				},
			}),
			exportProject: async ({
				state: exportState,
				format,
				quality,
				includeAudio,
			}) => {
				expect(exportState.project.id).toBe(projectId);
				expect(format).toBe("mp4");
				expect(quality).toBe("high");
				expect(includeAudio).toBe(true);
				expect(exportState.tracks).toMatchObject([
					{
						type: "video",
						elements: [
							{
								type: "video",
								sourceCrop: { x: 690, y: 0, width: 540, height: 960 },
							},
						],
					},
				]);
				return Buffer.from("mp4-bytes");
			},
			probeExportedFile: async ({ outputFile: probedFile, format }) => {
				expect(probedFile).toBe(outputFile);
				expect(format).toBe("mp4");
				return {
					format: "mp4",
					duration: 12,
					width: 1080,
					height: 1920,
					videoTrackCount: 1,
					audioTrackCount: 1,
				};
			},
		});

		expect(await readFile(outputFile, "utf8")).toBe("mp4-bytes");
		expect(result.results[0]).toMatchObject({
			tool: "export_project",
			success: true,
			data: {
				outputFile,
				byteLength: 9,
				format: "mp4",
				includeAudio: true,
				revision: state.revision,
				totalDuration: 12,
				outputProbe: {
					format: "mp4",
					duration: 12,
					width: 1080,
					height: 1920,
					videoTrackCount: 1,
					audioTrackCount: 1,
				},
			},
		});
	});

	test("exports a text timeline through the default node renderer", async () => {
		await createExecutorProject({ projectId, name: "Codex renderer" });
		const now = "2026-06-22T00:00:00.000Z";
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			JSON.stringify(
				{
					version: 1,
					revision: 2,
					project: {
						id: projectId,
						name: "Codex renderer",
						settings: {
							canvasSize: { width: 320, height: 180 },
							fps: 10,
							background: { type: "color", color: "#111827" },
						},
						createdAt: now,
						updatedAt: now,
					},
					mediaAssets: [],
					derivedAssets: [],
					tracks: [
						{
							id: "text-track-1",
							type: "text",
							name: "Text track",
							hidden: false,
							elements: [
								{
									id: "text-1",
									type: "text",
									name: "Title",
									content: "CodeCut Export",
									richSpans: [],
									fontSize: 12,
									fontFamily: "Inter",
									color: "#ffffff",
									backgroundColor: "#2563eb",
									textAlign: "center",
									fontWeight: "bold",
									fontStyle: "normal",
									textDecoration: "none",
									transform: {
										scale: 1,
										position: { x: 0, y: 0 },
										rotate: 0,
									},
									opacity: 1,
									startTime: 0,
									duration: 1,
									trimStart: 0,
									trimEnd: 0,
									boxWidth: 60,
									backgroundBorderRadius: 8,
									backgroundOpacity: 0.8,
									backgroundPaddingX: 8,
									backgroundPaddingY: 4,
								},
							],
						},
					],
				},
				null,
				2,
			),
		);
		const outputFile = join(stateDir, "node-renderer.mp4");

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: false,
					outputFile,
					overwrite: false,
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			tool: "export_project",
			success: true,
			data: {
				outputFile,
				format: "mp4",
				includeAudio: false,
				revision: 2,
				totalDuration: 1,
				outputProbe: {
					format: "mp4",
					width: 320,
					height: 180,
					videoTrackCount: 1,
					audioTrackCount: 0,
				},
			},
		});
		const exportData = resultData<{
			outputProbe: { duration: number };
		}>(result.results[0]);
		expect(exportData.outputProbe.duration).toBeGreaterThan(0);
		const outputBytes = await readFile(outputFile);
		expect(outputBytes.byteLength).toBeGreaterThan(0);
		expect(outputBytes.subarray(4, 8).toString("utf8")).toBe("ftyp");
		const summary = await readMp4Summary(outputBytes);
		expect(summary.videoTrackCount).toBe(1);
		expect(summary.duration).toBeGreaterThan(0);
	});

	test("exports an imported video timeline through the default node renderer", async () => {
		await createExecutorProject({ projectId, name: "Codex video renderer" });
		const videoBytes = await createFixtureMp4();
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "fixture.mp4",
					mimeType: "video/mp4",
					base64: videoBytes.toString("base64"),
					size: videoBytes.byteLength,
					lastModified: 1,
					duration: 1,
					width: 64,
					height: 36,
				},
			}),
		});
		expect(importResult.results[0]).toMatchObject({
			tool: "import_media_file",
			success: true,
		});
		const audioBytes = await createFixtureAudioMp4();
		const importAudioResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "fixture-audio.m4a",
					mimeType: "audio/mp4",
					base64: audioBytes.toString("base64"),
					size: audioBytes.byteLength,
					lastModified: 2,
					duration: 1,
				},
			}),
		});
		expect(importAudioResult.results[0]).toMatchObject({
			tool: "import_media_file",
			success: true,
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		const audioId = resultData<{ assets: Array<{ id: string }> }>(
			importAudioResult.results[0],
		).assets[0].id;
		const state = await getExecutorProjectState({ projectId });
		const now = "2026-06-22T00:00:00.000Z";
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			JSON.stringify(
				{
					...state,
					revision: state.revision + 1,
					project: {
						...state.project,
						settings: {
							canvasSize: { width: 64, height: 36 },
							fps: 4,
							background: { type: "color", color: "#000000" },
						},
						updatedAt: now,
					},
					tracks: [
						{
							id: "video-track-1",
							type: "video",
							name: "Video",
							isMain: true,
							muted: false,
							hidden: false,
							elements: [
								{
									id: "video-1",
									type: "video",
									name: "Fixture",
									mediaId,
									startTime: 0,
									duration: 1,
									trimStart: 0,
									trimEnd: 1,
									transform: {
										scale: 1,
										position: { x: 0, y: 0 },
										rotate: 0,
									},
									sourceCrop: { x: 8, y: 0, width: 48, height: 36 },
									opacity: 1,
									playbackRate: 1,
									reversed: false,
								},
							],
						},
						{
							id: "audio-track-1",
							type: "audio",
							name: "Audio",
							muted: false,
							elements: [
								{
									id: "audio-1",
									type: "audio",
									name: "Fixture audio",
									sourceType: "upload",
									mediaId: audioId,
									startTime: 0,
									duration: 1,
									trimStart: 0,
									trimEnd: 1,
									volume: 0.6,
									muted: false,
									playbackRate: 1,
								},
							],
						},
					],
				},
				null,
				2,
			),
		);
		const outputFile = join(stateDir, "node-video-renderer.mp4");

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile,
					overwrite: false,
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			tool: "export_project",
			success: true,
			data: {
				outputFile,
				format: "mp4",
				includeAudio: true,
				revision: state.revision + 1,
				totalDuration: 1,
			},
		});
		const outputBytes = await readFile(outputFile);
		expect(outputBytes.byteLength).toBeGreaterThan(0);
		expect(outputBytes.subarray(4, 8).toString("utf8")).toBe("ftyp");
		const summary = await readMp4Summary(outputBytes);
		expect(summary.videoTrackCount).toBe(1);
		expect(summary.audioTrackCount).toBe(1);
		expect(summary.decodedAudioFrames).toBeGreaterThan(0);
		expect(summary.duration).toBeGreaterThan(0);
	});

	for (const audioFixture of [
		{
			format: "wav",
			fileName: "fixture-audio.wav",
			mimeType: "audio/wav",
		},
		{
			format: "mp3",
			fileName: "fixture-audio.mp3",
			mimeType: "audio/mpeg",
		},
	] as const) {
		test(`exports a timeline with bare ${audioFixture.format.toUpperCase()} audio through the default node renderer`, async () => {
			await createExecutorProject({
				projectId,
				name: `Codex ${audioFixture.format} audio renderer`,
			});
			const videoBytes = await createFixtureMp4();
			const importResult = await executeCodexExecutorEnvelope({
				envelope: envelope({
					tool: "import_media_file",
					args: {
						fileName: "fixture.mp4",
						mimeType: "video/mp4",
						base64: videoBytes.toString("base64"),
						size: videoBytes.byteLength,
						lastModified: 1,
						duration: 1,
						width: 64,
						height: 36,
					},
				}),
			});
			expect(importResult.results[0]).toMatchObject({
				tool: "import_media_file",
				success: true,
			});
			const audioBytes = await createFixtureBareAudio({
				format: audioFixture.format,
			});
			const importAudioResult = await executeCodexExecutorEnvelope({
				envelope: envelope({
					tool: "import_media_file",
					args: {
						fileName: audioFixture.fileName,
						mimeType: audioFixture.mimeType,
						base64: audioBytes.toString("base64"),
						size: audioBytes.byteLength,
						lastModified: 2,
						duration: 1,
					},
				}),
			});
			expect(importAudioResult.results[0]).toMatchObject({
				tool: "import_media_file",
				success: true,
			});
			const mediaId = resultData<{ assets: Array<{ id: string }> }>(
				importResult.results[0],
			).assets[0].id;
			const audioId = resultData<{ assets: Array<{ id: string }> }>(
				importAudioResult.results[0],
			).assets[0].id;
			const state = await getExecutorProjectState({ projectId });
			const now = "2026-06-22T00:00:00.000Z";
			await writeFile(
				join(stateDir, "projects", projectId, "project.json"),
				JSON.stringify(
					{
						...state,
						revision: state.revision + 1,
						project: {
							...state.project,
							settings: {
								canvasSize: { width: 64, height: 36 },
								fps: 4,
								background: { type: "color", color: "#000000" },
							},
							updatedAt: now,
						},
						tracks: [
							{
								id: "video-track-1",
								type: "video",
								name: "Video",
								isMain: true,
								muted: false,
								hidden: false,
								elements: [
									{
										id: "video-1",
										type: "video",
										name: "Fixture",
										mediaId,
										startTime: 0,
										duration: 1,
										trimStart: 0,
										trimEnd: 1,
										transform: {
											scale: 1,
											position: { x: 0, y: 0 },
											rotate: 0,
										},
										opacity: 1,
										playbackRate: 1,
										reversed: false,
									},
								],
							},
							{
								id: "audio-track-1",
								type: "audio",
								name: "Audio",
								muted: false,
								elements: [
									{
										id: "audio-1",
										type: "audio",
										name: "Fixture audio",
										sourceType: "upload",
										mediaId: audioId,
										startTime: 0,
										duration: 1,
										trimStart: 0,
										trimEnd: 1,
										volume: 0.6,
										muted: false,
										playbackRate: 1,
									},
								],
							},
						],
					},
					null,
					2,
				),
			);
			const outputFile = join(
				stateDir,
				`node-${audioFixture.format}-audio-renderer.mp4`,
			);

			const result = await executeCodexExecutorEnvelope({
				envelope: envelope({
					tool: "export_project",
					args: {
						format: "mp4",
						quality: "high",
						includeAudio: true,
						outputFile,
						overwrite: false,
					},
				}),
			});

			expect(result.results[0]).toMatchObject({
				tool: "export_project",
				success: true,
				data: {
					outputFile,
					format: "mp4",
					includeAudio: true,
					revision: state.revision + 1,
					totalDuration: 1,
				},
			});
			const outputBytes = await readFile(outputFile);
			expect(outputBytes.byteLength).toBeGreaterThan(0);
			expect(outputBytes.subarray(4, 8).toString("utf8")).toBe("ftyp");
			const summary = await readMp4Summary(outputBytes);
			expect(summary.videoTrackCount).toBe(1);
			expect(summary.audioTrackCount).toBe(1);
			expect(summary.decodedAudioFrames).toBeGreaterThan(0);
			expect(summary.duration).toBeGreaterThan(0);
		});
	}

	test("export fails fast for unsafe local export inputs", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const existingOutputFile = join(stateDir, "existing.mp4");
		await writeFile(existingOutputFile, "existing");

		const emptyTimeline = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile: join(stateDir, "empty.mp4"),
					overwrite: false,
				},
			}),
			exportProject: async () => {
				throw new Error("should not run");
			},
		});
		const relativeOutput = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile: "relative.mp4",
					overwrite: false,
				},
			}),
			exportProject: async () => {
				throw new Error("should not run");
			},
		});
		const existingOutput = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "mp4",
					quality: "high",
					includeAudio: true,
					outputFile: existingOutputFile,
					overwrite: false,
				},
			}),
			exportProject: async () => {
				throw new Error("should not run");
			},
		});
		const unsupportedFormat = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "export_project",
				args: {
					format: "gif",
					quality: "high",
					includeAudio: true,
					outputFile: join(stateDir, "out.gif"),
					overwrite: false,
				},
			}),
			exportProject: async () => {
				throw new Error("should not run");
			},
		});

		expect(emptyTimeline.results[0]).toMatchObject({
			success: false,
			message: "Cannot export an empty timeline.",
		});
		expect(relativeOutput.results[0]).toMatchObject({
			success: false,
			message: "--output-file must be an absolute path",
		});
		expect(existingOutput.results[0]).toMatchObject({
			success: false,
			message: "Output file already exists. Set overwrite=true to replace it.",
		});
		expect(unsupportedFormat.results[0]).toMatchObject({
			success: false,
			message: "--format must be mp4 or webm",
		});
	});

	test("verify_timeline returns explicit mismatch fields", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "verify_timeline",
				args: {
					verification: {
						totalDuration: 10,
						trackCount: 1,
						clipCount: 1,
						captionCount: 0,
						audioCount: 0,
						mediaIds: ["media-1"],
					},
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			tool: "verify_timeline",
			success: false,
			data: {
				failures: [
					{ field: "totalDuration", expected: 10, actual: 0 },
					{ field: "trackCount", expected: 1, actual: 0 },
					{ field: "clipCount", expected: 1, actual: 0 },
					{ field: "mediaIds", expected: ["media-1"], actual: [] },
				],
			},
		});
	});

	test("apply_edit_plan fails before mutating when executor media file is empty", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });
		const state = await getExecutorProjectState({ projectId });
		const beforeRevision = state.revision;
		const mediaPath = join(stateDir, "projects", projectId, "media", "empty");
		await mkdir(join(stateDir, "projects", projectId, "media"), {
			recursive: true,
		});
		await writeFile(mediaPath, "");
		state.mediaAssets = [
			{
				id: "empty-video",
				name: "empty.mp4",
				type: "video",
				mimeType: "video/mp4",
				duration: 20,
				width: 1920,
				height: 1080,
				size: 0,
				lastModified: 1,
				path: mediaPath,
			},
		];
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: "empty-video",
						target: { durationSec: 5, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 5,
								timelineStart: 0,
								reason: "Hook",
							},
						],
						rationale: "Short cut",
					},
				},
			}),
		});
		const after = await getExecutorProjectState({ projectId });

		expect(applyResult.results[0]).toMatchObject({
			success: false,
			message: "Executor media asset empty-video is empty.",
		});
		expect(after.tracks).toEqual([]);
		expect(after.revision).toBe(beforeRevision);
	});

	test("readbacks EditPlan video text audio and transitions through timeline state", async () => {
		await createExecutorProject({ projectId, name: "Polished short" });
		const videoImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const bgmImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "bed.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("bgm").toString("base64"),
					size: 3,
					lastModified: 1,
					duration: 3,
				},
			}),
		});
		const sfxImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "hit.wav",
					mimeType: "audio/wav",
					base64: Buffer.from("sfx").toString("base64"),
					size: 3,
					lastModified: 1,
					duration: 1.25,
				},
			}),
		});
		const videoId = resultData<{ assets: Array<{ id: string }> }>(
			videoImport.results[0],
		).assets[0].id;
		const bgmId = resultData<{ assets: Array<{ id: string }> }>(
			bgmImport.results[0],
		).assets[0].id;
		const sfxId = resultData<{ assets: Array<{ id: string }> }>(
			sfxImport.results[0],
		).assets[0].id;

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: videoId,
						target: { durationSec: 10, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 5,
								timelineStart: 0,
								fit: "cover",
								reason: "Hook",
							},
							{
								id: "clip-2",
								sourceStart: 20,
								sourceEnd: 25,
								timelineStart: 5,
								reason: "Proof",
							},
						],
						title: {
							text: "Main claim",
							startTime: 0,
							duration: 3,
							stylePreset: "hook_title",
						},
						captions: [
							{
								text: "资源不等于能力",
								startTime: 0,
								duration: 2,
							},
						],
						captionStyle: {
							preset: "black-bar",
							position: "lower-safe",
							size: "medium",
						},
						audio: {
							bgm: {
								assetId: bgmId,
								volume: 0.35,
								mode: "loop_to_timeline",
							},
							sfx: [{ assetId: sfxId, startTime: 0, volume: 0.8 }],
						},
						transitions: [
							{
								fromClipId: "clip-1",
								toClipId: "clip-2",
								type: "fade",
								duration: 0.5,
							},
						],
						rationale: "Polished state readback",
					},
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(applyResult.results[0]).toMatchObject({
			success: true,
			summary: {
				clipCount: 2,
				textElementCount: 2,
				audioElementCount: 5,
				transitionCount: 1,
			},
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				totalDuration: 10,
				tracks: [
					{
						type: "text",
						elements: [
							{
								type: "text",
								content: "Main claim",
								style: {
									fontWeight: "bold",
									backgroundColor: "#000000",
									backgroundOpacity: 0.72,
								},
							},
							{
								type: "text",
								content: "资源不等于能力",
								style: {
									fontWeight: "bold",
									backgroundColor: "#000000",
									backgroundOpacity: 0.78,
									backgroundPaddingX: 24,
									backgroundPaddingY: 12,
								},
							},
						],
					},
					{
						type: "video",
						elements: [
							{
								type: "video",
								mediaId: videoId,
								trimStart: 0,
								trimEnd: 5,
								visual: {
									transform: {
										position: { x: 0, y: 0 },
										scale: 3.160493827160494,
									},
								},
							},
							{
								type: "video",
								mediaId: videoId,
								trimStart: 20,
								trimEnd: 25,
								visual: {
									transform: { position: { x: 0, y: 0 }, scale: 1 },
								},
							},
						],
						transitions: [
							{
								type: "fade",
								duration: 0.5,
							},
						],
					},
					{
						type: "audio",
						elements: [
							{
								type: "audio",
								mediaId: bgmId,
								startTime: 0,
								duration: 3,
								audio: { mediaId: bgmId, volume: 0.35 },
							},
							{
								type: "audio",
								mediaId: bgmId,
								startTime: 3,
								duration: 3,
								audio: { mediaId: bgmId, volume: 0.35 },
							},
							{
								type: "audio",
								mediaId: bgmId,
								startTime: 6,
								duration: 3,
								audio: { mediaId: bgmId, volume: 0.35 },
							},
							{
								type: "audio",
								mediaId: bgmId,
								startTime: 9,
								duration: 1,
								audio: { mediaId: bgmId, volume: 0.35 },
							},
							{
								type: "audio",
								mediaId: sfxId,
								startTime: 0,
								duration: 1.25,
								audio: { mediaId: sfxId, volume: 0.8 },
							},
						],
					},
				],
			},
		});
	});

	test("transcribes imported media through the local executor runtime", async () => {
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
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const transcribeResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "transcribe_media",
				args: {
					mediaId,
					language: "zh",
					modelId: "whisper-tiny",
				},
			}),
			transcribeMedia: async ({ mediaAsset, language, modelId }) => ({
				text: `transcribed ${mediaAsset.name}`,
				language,
				modelId,
				segments: [{ text: "hello", start: 0, end: 1.2 }],
				...asrContractFields(),
			}),
		});

		expect(transcribeResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "transcribe_media",
			success: true,
			message: "Transcribed 'source.mp4'",
			data: {
				text: "transcribed source.mp4",
				language: "zh",
				duration: 120,
				segments: [{ text: "hello", start: 0, end: 1.2 }],
				...asrContractFields(),
			},
		});
		expect(await getExecutorStatus({ projectId })).toMatchObject({
			status: "succeeded",
			tool: "transcribe_media",
			message: "Transcribed 'source.mp4'",
		});
	});

	test("transcribe_media rejects non-audio media before invoking the runtime", async () => {
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

		const transcribeResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "transcribe_media",
				args: {
					mediaId,
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
			transcribeMedia: async () => {
				throw new Error("transcribeMedia should not run for image media");
			},
		});

		expect(transcribeResult.results[0]).toMatchObject({
			success: false,
			message:
				"Media asset 'cover.png' is type 'image', expected video or audio",
		});
	});

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
				...asrContractFields(),
			}),
		});

		expect(contextResult.results[0]).toMatchObject({
			tool: "build_video_context",
			success: true,
			message: "Built VideoContext for 'source.mp4'",
			data: {
				qualityLevel: "L2_transcript",
				metadata: { durationSeconds: 725, hasAudio: true },
				assetTypeGuess: "oral_candidate",
				editingHints: {
					suggestTrimFillers: false,
					hasTalkingHeadSignal: true,
					canBeBroll: false,
				},
				transcript: {
					segments: [
						{ start: 1, end: 2, text: "hello" },
						{ start: 301, end: 302, text: "hello" },
						{ start: 601, end: 602, text: "hello" },
					],
				},
			},
		});
		const data = resultData<{
			assetType?: unknown;
			assetTypeGuess?: unknown;
			suggestTrimFillers?: unknown;
			editingHints?: unknown;
		}>(contextResult.results[0]);
		expect(data.assetType).toBeUndefined();
		expect(data.suggestTrimFillers).toBeUndefined();
		expect(data.assetTypeGuess).toBe("oral_candidate");
		expect(data.editingHints).toEqual({
			suggestTrimFillers: false,
			hasTalkingHeadSignal: true,
			canBeBroll: false,
		});
	});

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
			message:
				"Media asset 'cover.png' is type 'image', expected video or audio",
		});
	});

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
					frames: [{ timeSeconds: startSeconds }, { timeSeconds: endSeconds }],
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
		const [result] = visualResult.results;
		expect("message" in result ? String(result.message) : "").toContain(
			"targetAspectRatio",
		);
	});

	test("inspects a video range through the local executor without mutating project state", async () => {
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
					duration: 120,
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

		const inspectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "inspect_video_range",
				args: {
					mediaId,
					startSeconds: 12.5,
					endSeconds: 18,
					frameCount: 4,
				},
			}),
			inspectVideoRange: async ({
				mediaAsset,
				startSeconds,
				endSeconds,
				frameCount,
				outputDirectory,
			}) => {
				inspectedRanges.push({ startSeconds, endSeconds });
				expect(mediaAsset.id).toBe(mediaId);
				expect(frameCount).toBe(4);
				expect(outputDirectory.split(/[\\/]+/).slice(-3)).toEqual([
					"projects",
					projectId,
					"inspect",
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
						path: "/tmp/source-range.png",
						mimeType: "image/png",
						width: 1280,
						height: 360,
					},
					frames: [
						{ timeSeconds: 12.5 },
						{ timeSeconds: 14.333 },
						{ timeSeconds: 16.167 },
						{ timeSeconds: 18 },
					],
					audio: {
						hasAudio: true,
						waveformSamples: [0.1, 0.5, 0.2],
						silenceRanges: [
							{
								startSeconds: 15,
								endSeconds: 16,
								durationSeconds: 1,
							},
						],
					},
					warnings: [],
				};
			},
		});

		expect(inspectedRanges).toEqual([{ startSeconds: 12.5, endSeconds: 18 }]);
		expect(inspectResult.results[0]).toMatchObject({
			tool: "inspect_video_range",
			success: true,
			message: "Inspected video range for 'source.mp4'",
			data: {
				artifact: {
					kind: "video_range_contact_sheet",
					path: "/tmp/source-range.png",
					mimeType: "image/png",
				},
				frames: [
					{ timeSeconds: 12.5 },
					{ timeSeconds: 14.333 },
					{ timeSeconds: 16.167 },
					{ timeSeconds: 18 },
				],
				audio: {
					hasAudio: true,
					waveformSamples: [0.1, 0.5, 0.2],
				},
				warnings: [],
			},
		});
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("inspect_video_range rejects missing media before invoking inspector", async () => {
		await createExecutorProject({ projectId, name: "Codex cut" });

		const inspectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "inspect_video_range",
				args: {
					mediaId: "missing-media",
					startSeconds: 1,
					endSeconds: 2,
				},
			}),
			inspectVideoRange: async () => {
				throw new Error("inspectVideoRange should not run for missing media");
			},
		});

		expect(inspectResult.results[0]).toMatchObject({
			tool: "inspect_video_range",
			success: false,
			message: "Media asset 'missing-media' not found",
		});
		expect(await getExecutorStatus({ projectId })).toMatchObject({
			status: "failed",
			tool: "inspect_video_range",
			message: "Media asset 'missing-media' not found",
		});
	});

	test("inspect_video_range rejects image media before invoking inspector", async () => {
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

		const inspectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "inspect_video_range",
				args: {
					mediaId,
					startSeconds: 1,
					endSeconds: 2,
				},
			}),
			inspectVideoRange: async () => {
				throw new Error("inspectVideoRange should not run for image media");
			},
		});

		expect(inspectResult.results[0]).toMatchObject({
			tool: "inspect_video_range",
			success: false,
			message: "Media asset 'cover.png' is type 'image', expected video",
		});
	});

	test("builds post-cut captions by transcribing edited video clip audio ranges", async () => {
		await createExecutorProject({ projectId, name: "Captioned short" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 10, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 10,
								sourceEnd: 15,
								timelineStart: 0,
								reason: "Hook",
							},
							{
								id: "clip-2",
								sourceStart: 30,
								sourceEnd: 35,
								timelineStart: 5,
								reason: "Proof",
							},
						],
						rationale: "Caption timing proof",
					},
				},
			}),
		});
		const ranges: Array<{ start: number; end: number }> = [];

		const captionsResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_post_cut_captions",
				args: {
					language: "zh",
					modelId: "whisper-base",
				},
			}),
			transcribeMediaRange: async ({ range, language, modelId }) => {
				ranges.push(range);
				if (range.start === 10) {
					return {
						text: "first caption",
						language,
						modelId,
						segments: [
							{ text: "第一句", start: 1, end: 2.25 },
							{ text: "截断句", start: 4.8, end: 5.4 },
							{ text: "越界句", start: 5.1, end: 5.4 },
						],
						...asrContractFields(),
					};
				}
				return {
					text: "second caption",
					language,
					modelId,
					segments: [{ text: "第二句", start: 0.5, end: 1.75 }],
					...asrContractFields(),
				};
			},
		});

		expect(ranges).toEqual([
			{ start: 10, end: 15 },
			{ start: 30, end: 35 },
		]);
		expect(captionsResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "build_post_cut_captions",
			success: true,
			message: "Built 3 post-cut caption(s) from 2 video clip(s).",
			data: {
				source: "edited_video_clip_audio",
				language: "zh",
				modelId: "whisper-base",
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
					size: "medium",
				},
				captions: [
					{ text: "第一句", startTime: 1, duration: 1.25 },
					{ text: "截断句", startTime: 4.8, duration: 0.2 },
					{ text: "第二句", startTime: 5.5, duration: 1.25 },
				],
				captionQuality: {
					ok: false,
					issueCount: 1,
					issues: [
						{
							code: "caption_too_short",
							path: "captions[1].duration",
						},
					],
				},
				trace: [
					{
						mediaId,
						timelineStart: 0,
						sourceStart: 10,
						sourceEnd: 15,
						captionCount: 2,
					},
					{
						mediaId,
						timelineStart: 5,
						sourceStart: 30,
						sourceEnd: 35,
						captionCount: 1,
					},
				],
			},
		});
	});

	test("splits long post-cut ASR segments into readable caption entries", async () => {
		await createExecutorProject({ projectId, name: "Long interview caption" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "interview.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 60,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 12, aspectRatio: "16:9" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 0,
								sourceEnd: 12,
								timelineStart: 0,
								reason: "Keep the strongest answer.",
							},
						],
						rationale: "Post-cut caption chunking proof.",
					},
				},
			}),
		});

		const captionsResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_post_cut_captions",
				args: {
					language: "en",
					modelId: "whisper-base",
				},
			}),
			transcribeMediaRange: async ({ language, modelId }) => ({
				text: "long segment",
				language,
				modelId,
				segments: [
					{
						text: "The companies that survive this transition are the ones that redesign the workflow around the person doing the actual work, not around the software demo.",
						start: 0,
						end: 12,
					},
				],
				...asrContractFields(),
			}),
		});
		const captions = resultData<{
			captions: EditPlanCaption[];
			trace: Array<{ captionCount: number }>;
			captionQuality: { ok: boolean; issueCount: number };
		}>(captionsResult.results[0]);

		expect(captions.captions.length).toBeGreaterThan(1);
		expect(captions.captionQuality).toMatchObject({
			ok: true,
			issueCount: 0,
		});
		expect(captions.trace[0].captionCount).toBe(captions.captions.length);
		expect(captions.captions.at(0)?.startTime).toBe(0);
		const finalCaption = captions.captions.at(-1);
		expect(
			finalCaption ? finalCaption.startTime + finalCaption.duration : null,
		).toBe(12);
		for (const caption of captions.captions) {
			expect(caption.text.length).toBeLessThanOrEqual(52);
			expect(caption.duration).toBeLessThanOrEqual(4);
		}
	});

	test("builds post-cut captions from scripted TTS text instead of ASR text", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "tts-1",
					name: "proof-reveal-generated-tts.mp3",
					type: "audio",
					mimeType: "audio/mpeg",
					duration: 10,
					size: 5,
					lastModified: 1,
					path: "/tmp/proof-reveal-generated-tts.mp3",
					spokenScript: {
						source: "tts",
						text: "These texts already sound like a song. A pizza portion costs $2.34. The reveal is the last line. Venmo that ASAP.",
						captions: [
							"These texts already sound like a song.",
							"A pizza portion costs $2.34.",
							"The reveal is the last line.",
							"Venmo that ASAP.",
						],
						protectedTerms: ["$2.34", "Venmo", "ASAP"],
					},
				},
			],
			tracks: [
				{
					id: "audio-track-1",
					type: "audio",
					name: "Narration",
					muted: false,
					elements: [
						{
							id: "tts-clip-1",
							type: "audio",
							name: "Narration",
							mediaId: "tts-1",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 10,
							sourceType: "upload",
							volume: 1,
							muted: false,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_post_cut_captions",
				args: {
					language: "en",
					modelId: "whisper-small",
				},
			}),
			transcribeMediaRange: async ({ mediaAsset, range }) => {
				expect(mediaAsset.id).toBe("tts-1");
				expect(range).toEqual({ start: 0, end: 10 });
				return {
					text: "These texts already sound like a song. A pizza portion costs $2.30. The review is the last line. The AMO that ASAP.",
					language: "en",
					modelId: "whisper-small",
					segments: [
						{
							text: "These texts already sound like a song.",
							start: 0,
							end: 2,
						},
						{ text: "A pizza portion costs $2.30.", start: 2, end: 5 },
						{ text: "The review is the last line.", start: 5, end: 7 },
						{ text: "The AMO that ASAP.", start: 7, end: 9 },
					],
					...asrContractFields(),
				};
			},
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				source: "scripted_tts_audio",
				captionStyle: {
					preset: "talking-head-pop",
					position: "lower-safe",
					size: "medium",
				},
				voiceConsistency: {
					provider: "imported-tts",
					alignmentMethod: "scripted_captions_to_asr_segments",
					scriptCaptionLineCount: 4,
					protectedTermCount: 3,
				},
				captions: [
					{ text: "These texts already sound like a song", startTime: 0 },
					{ text: "A pizza portion costs $2.34", startTime: 2 },
					{ text: "The reveal is the last line", startTime: 5 },
					{ text: "Venmo that ASAP", startTime: 7 },
				],
			},
		});
	});

	test("keeps scripted Chinese captions when accented ASR text is wrong", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "sichuan-tts-1",
					name: "chengdu-property-tts.mp3",
					type: "audio",
					mimeType: "audio/mpeg",
					duration: 8,
					size: 5,
					lastModified: 1,
					path: "/tmp/chengdu-property-tts.mp3",
					spokenScript: {
						source: "tts",
						text: "天府新区双华麓港，套三双卫，总价一百八十六万。",
						captions: ["天府新区双华麓港", "套三双卫", "总价一百八十六万"],
						protectedTerms: ["双华麓港", "套三双卫", "一百八十六万"],
						provider: "runninghub-voice-design",
						providerTaskId: "voice-task-cn-1",
					},
				},
			],
			tracks: [
				{
					id: "audio-track-1",
					type: "audio",
					name: "Narration",
					muted: false,
					elements: [
						{
							id: "sichuan-clip-1",
							type: "audio",
							name: "Narration",
							mediaId: "sichuan-tts-1",
							startTime: 0,
							duration: 8,
							trimStart: 0,
							trimEnd: 8,
							sourceType: "upload",
							volume: 1,
							muted: false,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_post_cut_captions",
				args: {
					language: "zh",
					modelId: "whisper-small",
					captionStyle: {
						preset: "property-clean-yellow",
						position: "lower-safe",
						size: "medium",
					},
				},
			}),
			transcribeMediaRange: async () => ({
				text: "天府新区双滑鹿港，套三双为，总价一百八十六嘛。",
				language: "zh",
				modelId: "whisper-small",
				segments: [
					{ text: "天府新区双滑鹿港", start: 0, end: 2.4 },
					{ text: "套三双为", start: 2.4, end: 4.2 },
					{ text: "总价一百八十六嘛", start: 4.2, end: 7.2 },
				],
				...asrContractFields(),
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				source: "scripted_tts_audio",
				captionStyle: {
					preset: "property-clean-yellow",
					position: "lower-safe",
					size: "medium",
				},
				voiceConsistency: {
					provider: "runninghub-voice-design",
					providerTaskId: "voice-task-cn-1",
					alignmentMethod: "scripted_captions_to_asr_segments",
					scriptCaptionLineCount: 3,
					protectedTermCount: 3,
				},
				captions: [
					{ text: "天府新区双华麓港", startTime: 0 },
					{ text: "套三双卫", startTime: 2.4 },
					{ text: "总价一百八十六万", startTime: 4.2 },
				],
			},
		});
		expect(JSON.stringify(result.results[0])).not.toContain("双滑鹿港");
		expect(JSON.stringify(result.results[0])).not.toContain("套三双为");
	});

	test("aligns scripted TTS captions when ASR timing segment count differs", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "tts-1",
					name: "proof-reveal-generated-tts.mp3",
					type: "audio",
					mimeType: "audio/mpeg",
					duration: 10,
					size: 5,
					lastModified: 1,
					path: "/tmp/proof-reveal-generated-tts.mp3",
					spokenScript: {
						source: "tts",
						text: "These texts already sound like a song. A pizza portion costs $2.34. The reveal is the last line. Venmo that ASAP.",
						captions: [
							"These texts already sound like a song.",
							"A pizza portion costs $2.34.",
							"The reveal is the last line.",
							"Venmo that ASAP.",
						],
						protectedTerms: ["$2.34", "Venmo", "ASAP"],
					},
				},
			],
			tracks: [
				{
					id: "audio-track-1",
					type: "audio",
					name: "Narration",
					muted: false,
					elements: [
						{
							id: "tts-clip-1",
							type: "audio",
							name: "Narration",
							mediaId: "tts-1",
							startTime: 0,
							duration: 10,
							trimStart: 0,
							trimEnd: 10,
							sourceType: "upload",
							volume: 1,
							muted: false,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_post_cut_captions",
				args: {
					language: "en",
					modelId: "whisper-small",
				},
			}),
			transcribeMediaRange: async () => ({
				text: "These texts already sound like a song. A pizza portion costs $2.30. The review is the last line. The AMO that ASAP.",
				language: "en",
				modelId: "whisper-small",
				segments: [
					{
						text: "These texts already sound like a song. A pizza portion costs $2.30.",
						start: 0,
						end: 6,
					},
					{
						text: "The review is the last line. The AMO that ASAP.",
						start: 6,
						end: 10,
					},
				],
				...asrContractFields(),
			}),
		});

		expect(result.results[0]).toMatchObject({ success: true });
		const data = resultData<{ source: string; captions: EditPlanCaption[] }>(
			result.results[0],
		);
		const captionText = data.captions.map((caption) => caption.text).join(" ");

		expect(data.source).toBe("scripted_tts_audio");
		expect(captionText).toContain("$2.34");
		expect(captionText).toContain("Venmo that ASAP");
		expect(captionText).toContain("The reveal is the last line");
		expect(captionText).not.toContain("$2.30");
		expect(captionText).not.toContain("The review is the last line");
		expect(captionText).not.toContain("The AMO that ASAP");
	});

	test("applies clip-only SpeechCleanup then rebuilds post-cut captions into the final EditPlan", async () => {
		await createExecutorProject({ projectId, name: "Speech cleanup captions" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 36,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;
		const speechCleanupPlan: SpeechCleanupPlan = {
			version: 2,
			projectId,
			sourceMediaId: mediaId,
			target: { durationSec: 5, aspectRatio: "9:16" },
			decisions: [
				{
					id: "drop-1",
					action: "drop",
					text: "开头准备",
					sourceStart: 0,
					sourceEnd: 10,
					reason: "Remove setup before the hook.",
					dropReason: "pause",
					risk: "low",
				},
				{
					id: "keep-1",
					action: "keep",
					text: "第一句",
					sourceStart: 10,
					sourceEnd: 13,
					reason: "Hook sentence.",
				},
				{
					id: "drop-2",
					action: "drop",
					text: "重复解释",
					sourceStart: 13,
					sourceEnd: 30,
					reason: "Remove repeated explanation.",
					dropReason: "repeat",
					risk: "low",
				},
				{
					id: "keep-2",
					action: "keep",
					text: "第二句",
					sourceStart: 30,
					sourceEnd: 32,
					reason: "Proof sentence.",
				},
				{
					id: "drop-3",
					action: "drop",
					text: "结尾停顿",
					sourceStart: 32,
					sourceEnd: 36,
					reason: "Remove trailing pause.",
					dropReason: "pause",
					risk: "low",
				},
			],
			rationale: "Remove setup and repeated explanation before captions.",
		};
		const clipOnlyResult = rebuildTimelineFromSpeechCleanup({
			plan: speechCleanupPlan,
			sourceDuration: 36,
			captionMode: "clip-only",
		});
		expect(clipOnlyResult.editPlan.captions).toBeUndefined();

		const clipApplyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: clipOnlyResult.editPlan,
				},
			}),
		});
		const ranges: Array<{ start: number; end: number }> = [];
		const captionsResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_post_cut_captions",
				args: {
					language: "zh",
					modelId: "whisper-base",
				},
			}),
			transcribeMediaRange: async ({ range, language, modelId }) => {
				ranges.push(range);
				if (range.start === 10) {
					return {
						text: "first clip",
						language,
						modelId,
						segments: [{ text: "第一句", start: 0.25, end: 1.25 }],
						...asrContractFields(),
					};
				}
				return {
					text: "second clip",
					language,
					modelId,
					segments: [{ text: "第二句", start: 0.5, end: 1.5 }],
					...asrContractFields(),
				};
			},
		});
		const postCutCaptions = resultData<{
			captions: EditPlanCaption[];
			captionStyle: EditPlanCaptionStyle;
		}>(captionsResult.results[0]);
		const finalApplyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						...clipOnlyResult.editPlan,
						captions: postCutCaptions.captions,
						captionStyle: postCutCaptions.captionStyle,
						rationale: "Final post-cut captioned SpeechCleanup edit.",
					},
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(clipApplyResult.results[0]).toMatchObject({
			success: true,
			summary: { clipCount: 2, textElementCount: 0 },
		});
		expect(ranges).toEqual([
			{ start: 10, end: 13 },
			{ start: 30, end: 32 },
		]);
		expect(captionsResult.results[0]).toMatchObject({
			success: true,
			message: "Built 2 post-cut caption(s) from 2 video clip(s).",
		});
		expect(finalApplyResult.results[0]).toMatchObject({
			success: true,
			summary: { clipCount: 2, textElementCount: 2 },
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				totalDuration: 5,
				tracks: [
					{
						type: "text",
						elements: [
							{ type: "text", content: "第一句", startTime: 0.25 },
							{ type: "text", content: "第二句", startTime: 3.5 },
						],
					},
					{
						type: "video",
						elements: [
							{ type: "video", mediaId, trimStart: 10, trimEnd: 13 },
							{ type: "video", mediaId, trimStart: 30, trimEnd: 32 },
						],
					},
				],
			},
		});
	});

	test("applies vertical project settings before applying and verifying an EditPlan", async () => {
		await createExecutorProject({ projectId, name: "Vertical cut" });
		const importResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 120,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const mediaId = resultData<{ assets: Array<{ id: string }> }>(
			importResult.results[0],
		).assets[0].id;

		const updateResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "update_project_settings",
				args: { width: 1080, height: 1920, fps: 30 },
			}),
		});
		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						sourceMediaId: mediaId,
						target: { durationSec: 12, aspectRatio: "9:16" },
						clips: [
							{
								id: "clip-1",
								sourceStart: 10,
								sourceEnd: 22,
								timelineStart: 0,
								reason: "Hook",
							},
						],
						rationale: "Vertical short cut",
					},
				},
			}),
		});
		const infoResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_project_info", args: {} }),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(updateResult.results[0]).toMatchObject({
			success: true,
			message: "Project settings updated: canvasSize, fps",
		});
		expect(applyResult.results[0]).toMatchObject({
			success: true,
			summary: { clipCount: 1, totalDuration: 12 },
		});
		expect(infoResult.results[0]).toMatchObject({
			success: true,
			data: {
				canvasSize: { width: 1080, height: 1920 },
				fps: 30,
			},
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				totalDuration: 12,
				tracks: [
					{
						type: "video",
						elements: [{ type: "video", mediaId }],
					},
				],
			},
		});
	});

	test("applies a narrated remix plan through the local executor", async () => {
		await createExecutorProject({ projectId, name: "Narrated remix" });
		const videoImports = [];
		for (const [index, duration] of [12, 12, 12].entries()) {
			videoImports.push(
				await executeCodexExecutorEnvelope({
					envelope: envelope({
						tool: "import_media_file",
						args: {
							fileName: `broll-${index + 1}.mp4`,
							mimeType: "video/mp4",
							base64: Buffer.from(`video-${index + 1}`).toString("base64"),
							size: 7,
							lastModified: 1,
							duration,
							width: 1920,
							height: 1080,
						},
					}),
				}),
			);
		}
		const narrationImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "narration.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("narration").toString("base64"),
					size: 9,
					lastModified: 1,
					duration: 30,
				},
			}),
		});
		const videoIds = videoImports.map(
			(result) =>
				resultData<{ assets: Array<{ id: string }> }>(result.results[0])
					.assets[0].id,
		);
		const narrationId = resultData<{ assets: Array<{ id: string }> }>(
			narrationImport.results[0],
		).assets[0].id;

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_narrated_remix_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						target: { durationSec: 30, aspectRatio: "9:16" },
						visualBeats: [
							{
								id: "beat-1",
								mediaId: videoIds[0],
								sourceStart: 0,
								sourceEnd: 10,
								timelineStart: 0,
								muted: true,
								reason: "Opening b-roll",
							},
							{
								id: "beat-2",
								mediaId: videoIds[1],
								sourceStart: 1,
								sourceEnd: 11,
								timelineStart: 10,
								muted: true,
								reason: "Middle b-roll",
							},
							{
								id: "beat-3",
								mediaId: videoIds[2],
								sourceStart: 2,
								sourceEnd: 12,
								timelineStart: 20,
								muted: true,
								reason: "Closing b-roll",
							},
						],
						narration: { mediaId: narrationId, sourceStart: 0 },
						captions: [
							{ text: "Opening line", startTime: 0, duration: 3 },
							{ text: "Closing line", startTime: 24, duration: 4 },
						],
						captionStyle: {
							preset: "talking-head-pop",
							position: "lower-safe",
							size: "medium",
						},
						captionSource: {
							type: "post-cut-audio",
							tool: "build-post-cut-captions",
							source: "edited_timeline_audio",
							trace: [
								{
									mediaId: narrationId,
									timelineStart: 0,
									sourceStart: 0,
									sourceEnd: 30,
									captionCount: 2,
								},
							],
						},
						rationale: "Narration-led B-roll remix",
					},
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(applyResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "apply_narrated_remix_plan",
			success: true,
			message: "Applied NarratedRemixPlan with 3 visual beat(s).",
			data: {
				visualBeatCount: 3,
				audioElementCount: 1,
				captionCount: 2,
				totalDuration: 30,
			},
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				totalDuration: 30,
			},
		});
		const timeline = resultData<{
			tracks: Array<{
				type: string;
				elements: Array<{
					type: string;
					mediaId?: string;
					content?: string;
					visual?: { muted?: boolean };
					audio?: { sourceType?: string; volume?: number; muted?: boolean };
				}>;
			}>;
		}>(timelineResult.results[0]);
		expect(timeline.tracks).toHaveLength(3);
		expect(timeline.tracks[0]).toMatchObject({
			type: "video",
			elements: [
				{ type: "video", mediaId: videoIds[0], visual: { muted: true } },
				{ type: "video", mediaId: videoIds[1], visual: { muted: true } },
				{ type: "video", mediaId: videoIds[2], visual: { muted: true } },
			],
		});
		expect(timeline.tracks[1]).toMatchObject({
			type: "audio",
			elements: [
				{
					type: "audio",
					mediaId: narrationId,
					audio: { sourceType: "upload", volume: 1, muted: false },
				},
			],
		});
		expect(timeline.tracks[2]).toMatchObject({
			type: "text",
			elements: [
				{ type: "text", content: "Opening line" },
				{ type: "text", content: "Closing line" },
			],
		});
	});

	test("keeps image card text editable through timeline readback", async () => {
		await createExecutorProject({ projectId, name: "Narrated image cards" });
		const videoImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "opening.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("video").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 10,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const imageImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "property-card.jpg",
					mimeType: "image/jpeg",
					base64: Buffer.from("image").toString("base64"),
					size: 5,
					lastModified: 1,
					width: 1080,
					height: 1920,
				},
			}),
		});
		const narrationImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "narration.mp3",
					mimeType: "audio/mpeg",
					base64: Buffer.from("narration").toString("base64"),
					size: 9,
					lastModified: 1,
					duration: 30,
				},
			}),
		});
		const videoId = resultData<{ assets: Array<{ id: string }> }>(
			videoImport.results[0],
		).assets[0].id;
		const imageId = resultData<{ assets: Array<{ id: string }> }>(
			imageImport.results[0],
		).assets[0].id;
		const narrationId = resultData<{ assets: Array<{ id: string }> }>(
			narrationImport.results[0],
		).assets[0].id;

		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_narrated_remix_plan",
				args: {
					replaceExisting: true,
					plan: {
						version: 1,
						projectId,
						target: { durationSec: 30, aspectRatio: "9:16" },
						visualBeats: [
							{
								id: "opening-video",
								mediaId: videoId,
								sourceStart: 0,
								sourceEnd: 10,
								timelineStart: 0,
								muted: true,
								reason: "Opening b-roll",
							},
							{
								mediaType: "image",
								id: "property-card",
								mediaId: imageId,
								timelineStart: 10,
								duration: 20,
								fit: "cover",
								cardText: {
									title: "天府新区双华麓港",
									info: "117.55㎡ 套三双卫 总价186万",
									bottomText: "地铁口商圈边",
								},
								reason: "Editable property qualification card",
							},
						],
						narration: { mediaId: narrationId, sourceStart: 0 },
						captions: [
							{ text: "Voiceover caption", startTime: 24, duration: 3 },
						],
						captionStyle: {
							preset: "talking-head-pop",
							position: "lower-safe",
							size: "medium",
						},
						captionSource: {
							type: "post-cut-audio",
							tool: "build-post-cut-captions",
							source: "edited_timeline_audio",
							trace: [
								{
									mediaId: narrationId,
									timelineStart: 0,
									sourceStart: 0,
									sourceEnd: 30,
									captionCount: 1,
								},
							],
						},
						rationale: "Narration-led image card remix",
					},
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: { format: "v2", includeReferencedMedia: true },
			}),
		});

		expect(applyResult.results[0]).toMatchObject({
			success: true,
			data: {
				visualBeatCount: 2,
				imageBeatCount: 1,
				cardTextElementCount: 3,
				captionCount: 1,
			},
		});
		const timeline = resultData<{
			referencedMedia?: Record<string, unknown>;
			tracks: Array<{
				type: string;
				name: string;
				elements: Array<{
					id: string;
					type: string;
					name: string;
					mediaId?: string;
					content?: string;
					visual?: {
						transform?: unknown;
					};
					startTime: number;
					duration: number;
				}>;
			}>;
		}>(timelineResult.results[0]);
		const visualTrack = timeline.tracks.find((track) => track.type === "video");
		const cardTextTrack = timeline.tracks.find(
			(track) => track.name === "Card Text",
		);
		const captionTrack = timeline.tracks.find(
			(track) => track.name === "Captions",
		);
		expect(visualTrack?.elements).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: "image", mediaId: imageId }),
			]),
		);
		expect(cardTextTrack?.elements.map((element) => element.content)).toEqual([
			"天府新区双华麓港",
			"117.55㎡ 套三双卫 总价186万",
			"地铁口商圈边",
		]);
		expect(
			cardTextTrack?.elements.every(
				(element) => element.startTime === 10 && element.duration === 20,
			),
		).toBe(true);
		expect(captionTrack?.elements.map((element) => element.content)).toEqual([
			"Voiceover caption",
		]);
		const referencedMediaKeys = Object.keys(
			timeline.referencedMedia ?? {},
		).sort();
		expect(referencedMediaKeys).toHaveLength(3);
		const imageElement = visualTrack?.elements.find(
			(element) => element.type === "image",
		);
		expect(imageElement).toMatchObject({
			type: "image",
			mediaId: imageId,
			startTime: 10,
			duration: 20,
			visual: {
				transform: {
					position: { x: 0, y: 0 },
					rotate: 0,
				},
			},
		});

		const infoElementId = cardTextTrack?.elements.find(
			(element) => element.name === "Card info",
		)?.id;
		expect(infoElementId).toBeString();
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "set_clip_properties",
				args: {
					elementIds: [infoElementId],
					properties: { content: "117.55㎡ 套三双卫 总价183万" },
				},
			}),
		});
		const updatedTimelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: { format: "v2", includeReferencedMedia: true },
			}),
		});
		const updatedTimeline = resultData<{
			referencedMedia?: Record<string, unknown>;
			tracks: Array<{
				type: string;
				name: string;
				elements: Array<{
					id: string;
					type: string;
					mediaId?: string;
					content?: string;
					startTime: number;
					duration: number;
					visual?: {
						transform?: unknown;
					};
				}>;
			}>;
		}>(updatedTimelineResult.results[0]);
		const updatedVisualTrack = updatedTimeline.tracks.find(
			(track) => track.type === "video",
		);
		const updatedCardTextTrack = updatedTimeline.tracks.find(
			(track) => track.name === "Card Text",
		);
		expect(
			updatedCardTextTrack?.elements.map((element) => element.content),
		).toEqual(
			expect.arrayContaining([
				"天府新区双华麓港",
				"117.55㎡ 套三双卫 总价183万",
				"地铁口商圈边",
			]),
		);
		expect(Object.keys(updatedTimeline.referencedMedia ?? {}).sort()).toEqual(
			referencedMediaKeys,
		);
		const updatedImageElement = updatedVisualTrack?.elements.find(
			(element) => element.type === "image",
		);
		expect(updatedImageElement).toMatchObject({
			id: imageElement?.id,
			mediaId: imageElement?.mediaId,
			startTime: imageElement?.startTime,
			duration: imageElement?.duration,
			visual: {
				transform: imageElement?.visual?.transform,
			},
		});
	});

	test("creates a text-background masked effect from local executor state", async () => {
		await createExecutorProject({ projectId, name: "Masked cut" });
		const sourceImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "source.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("source").toString("base64"),
					size: 6,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const alphaImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "alpha.webm",
					mimeType: "video/webm",
					base64: Buffer.from("alpha").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const sourceId = resultData<{ assets: Array<{ id: string }> }>(
			sourceImport.results[0],
		).assets[0].id;
		const alphaId = resultData<{ assets: Array<{ id: string }> }>(
			alphaImport.results[0],
		).assets[0].id;
		const state = await getExecutorProjectState({ projectId });
		state.derivedAssets = [
			personMask({ sourceMediaId: sourceId, alphaMediaId: alphaId }),
		];
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const effectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "create_text_background_effect",
				args: {
					sourceMediaId: sourceId,
					derivedAssetId: "mask-1",
					content: "Behind person",
					startTime: 1,
					duration: 4,
					replaceExisting: true,
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});
		const snapshot = await getExecutorProjectSnapshot({ projectId });

		expect(effectResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "create_text_background_effect",
			success: true,
			message: "Created text-background effect with 3 track(s).",
			data: {
				effect: "text-background",
				trackCount: 3,
				elementCount: 3,
				totalDuration: 5,
			},
		});
		expect(timelineResult.results[0]).toMatchObject({
			success: true,
			data: {
				derivedAssets: [{ id: "mask-1", alphaMediaId: alphaId }],
			},
		});
		const timeline = resultData<{
			tracks: Array<{
				type: string;
				elements: Array<{
					type: string;
					mediaId?: string;
					visual?: { mask?: { type: string; derivedAssetId: string } };
				}>;
			}>;
		}>(timelineResult.results[0]);
		expect(timeline.tracks[0]).toMatchObject({
			type: "video",
			elements: [
				{
					type: "video",
					mediaId: sourceId,
					visual: {
						mask: { type: "person-mask", derivedAssetId: "mask-1" },
					},
				},
			],
		});
		expect(snapshot.derivedAssets).toEqual([
			personMask({ sourceMediaId: sourceId, alphaMediaId: alphaId }),
		]);
	});

	test("creates a human-pip masked effect from local executor state", async () => {
		await createExecutorProject({ projectId, name: "Human PIP cut" });
		const foregroundImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "talking-head.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("front").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const alphaImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "alpha.webm",
					mimeType: "video/webm",
					base64: Buffer.from("alpha").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const backgroundImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "background.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("background").toString("base64"),
					size: 10,
					lastModified: 1,
					duration: 12,
					width: 1080,
					height: 1920,
				},
			}),
		});
		const foregroundId = resultData<{ assets: Array<{ id: string }> }>(
			foregroundImport.results[0],
		).assets[0].id;
		const alphaId = resultData<{ assets: Array<{ id: string }> }>(
			alphaImport.results[0],
		).assets[0].id;
		const backgroundId = resultData<{ assets: Array<{ id: string }> }>(
			backgroundImport.results[0],
		).assets[0].id;
		const state = await getExecutorProjectState({ projectId });
		state.derivedAssets = [
			personMask({ sourceMediaId: foregroundId, alphaMediaId: alphaId }),
		];
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const effectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "create_human_pip_effect",
				args: {
					foregroundMediaId: foregroundId,
					backgroundMediaId: backgroundId,
					derivedAssetId: "mask-1",
					placement: "right_down",
					scale: 0.35,
					startTime: 1,
					duration: 4,
					replaceExisting: true,
				},
			}),
		});
		const timelineResult = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "get_timeline_state", args: {} }),
		});

		expect(effectResult.results[0]).toMatchObject({
			commandId: "cmd-1",
			tool: "create_human_pip_effect",
			success: true,
			message: "Created human-pip effect with 2 track(s).",
			data: {
				effect: "human-pip",
				trackCount: 2,
				elementCount: 2,
				totalDuration: 5,
			},
		});
		const timeline = resultData<{
			tracks: Array<{
				type: string;
				elements: Array<{
					type: string;
					mediaId?: string;
					visual?: { mask?: { type: string; derivedAssetId: string } };
				}>;
			}>;
		}>(timelineResult.results[0]);
		expect(timeline.tracks[0]).toMatchObject({
			type: "video",
			elements: [
				{
					type: "video",
					mediaId: foregroundId,
					visual: {
						mask: { type: "person-mask", derivedAssetId: "mask-1" },
					},
				},
			],
		});
		expect(timeline.tracks[1]).toMatchObject({
			type: "video",
			elements: [
				{
					type: "video",
					mediaId: backgroundId,
				},
			],
		});
	});

	test("create_human_pip_effect rejects unsupported placement before mutating executor timeline", async () => {
		await createExecutorProject({ projectId, name: "Human PIP cut" });
		const foregroundImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "talking-head.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("front").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const alphaImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "alpha.webm",
					mimeType: "video/webm",
					base64: Buffer.from("alpha").toString("base64"),
					size: 5,
					lastModified: 1,
					duration: 12,
					width: 1920,
					height: 1080,
				},
			}),
		});
		const backgroundImport = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "import_media_file",
				args: {
					fileName: "background.mp4",
					mimeType: "video/mp4",
					base64: Buffer.from("background").toString("base64"),
					size: 10,
					lastModified: 1,
					duration: 12,
					width: 1080,
					height: 1920,
				},
			}),
		});
		const foregroundId = resultData<{ assets: Array<{ id: string }> }>(
			foregroundImport.results[0],
		).assets[0].id;
		const alphaId = resultData<{ assets: Array<{ id: string }> }>(
			alphaImport.results[0],
		).assets[0].id;
		const backgroundId = resultData<{ assets: Array<{ id: string }> }>(
			backgroundImport.results[0],
		).assets[0].id;
		const state = await getExecutorProjectState({ projectId });
		state.derivedAssets = [
			personMask({ sourceMediaId: foregroundId, alphaMediaId: alphaId }),
		];
		await writeFile(
			join(stateDir, "projects", projectId, "project.json"),
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);

		const effectResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "create_human_pip_effect",
				args: {
					foregroundMediaId: foregroundId,
					backgroundMediaId: backgroundId,
					derivedAssetId: "mask-1",
					placement: "bottom_right",
					scale: 0.35,
					startTime: 1,
					duration: 4,
					replaceExisting: true,
				},
			}),
		});
		const after = await getExecutorProjectState({ projectId });

		expect(effectResult.results[0]).toMatchObject({
			success: false,
			message:
				"placement must be one of right_down, right_up, left_down, left_up, center.",
		});
		expect(after.tracks).toEqual([]);
	});

	test("inspect_timeline renders composited timeline frames without mutating project state", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "text-track-1",
					type: "text",
					name: "Captions",
					hidden: false,
					elements: [
						{
							id: "caption-1",
							type: "text",
							name: "Caption",
							content: "Rendered proof",
							richSpans: [],
							fontSize: 96,
							fontFamily: "Inter",
							color: "#ffffff",
							backgroundColor: "transparent",
							textAlign: "center",
							fontWeight: "bold",
							fontStyle: "normal",
							textDecoration: "none",
							hidden: false,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
							startTime: 0,
							duration: 2,
							trimStart: 0,
							trimEnd: 0,
						},
					],
				},
			],
		});
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "inspect_timeline",
				args: { startTime: 0, endTime: 2, frameCount: 2 },
			}),
		});
		const after = await getExecutorProjectState({ projectId });
		const data = resultData<{
			artifact: { path: string; kind: string; mimeType: string };
			frames: Array<{ timeSeconds: number }>;
			revision: number;
		}>(result.results[0]);

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Inspected timeline at 2 frame(s).",
			data: {
				revision: 1,
				canvasSize: { width: 1080, height: 1920 },
				artifact: {
					kind: "timeline_contact_sheet",
					mimeType: "image/png",
				},
				frames: [{ timeSeconds: 0 }, { timeSeconds: 2 }],
			},
		});
		expect(data.artifact.path.replaceAll("\\", "/")).toContain(
			"/timeline-inspect/",
		);
		expect((await readFile(data.artifact.path)).byteLength).toBeGreaterThan(0);
		expect(after).toEqual(before);
	});

	test("build_video_quality_report returns validation failure without rendering a contact sheet", async () => {
		await createExecutorProject({ projectId, name: "Quality report cut" });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan: {
						...qualityPlan({ videoId: "missing-video" }),
						sourceMediaId: "missing-video",
					},
					inspection: { startTime: 0, endTime: 1, frameCount: 2 },
				},
			}),
		});
		const data = resultData<{
			status: string;
			artifacts: unknown[];
			checks: Array<{ id: string; status: string; evidence?: unknown }>;
		}>(result.results[0]);

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: fail",
			data: {
				schemaVersion: 2,
				status: "fail",
				artifacts: [],
				checks: [
					{
						id: "editPlan.validation",
						category: "edit_plan",
						status: "fail",
						severity: "critical",
						message:
							"EditPlan sourceMediaId was not found in the project media library.",
					},
				],
			},
		});
		expect(data.artifacts).toHaveLength(0);
		expect(data.checks[0]?.evidence).toMatchObject({
			path: "sourceMediaId",
		});
	});

	test("build_video_quality_report passes applied title captions transitions and does not mutate", async () => {
		const { plan } = await createAppliedQualityFixture();
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan,
					inspection: { startTime: 0, endTime: 2, frameCount: 2 },
				},
			}),
		});
		const after = await getExecutorProjectState({ projectId });
		const data = resultData<{
			status: string;
			artifacts: Array<{ path: string; kind: string }>;
			checks: Array<{ id: string; status: string }>;
			limitations: Array<{ id: string; status: string }>;
		}>(result.results[0]);

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: pass",
			data: {
				schemaVersion: 2,
				status: "pass",
				revision: before.revision,
				checks: expect.arrayContaining([
					expect.objectContaining({
						id: "editPlan.validation",
						status: "pass",
					}),
					expect.objectContaining({
						id: "timeline.titleReadback",
						status: "pass",
					}),
					expect.objectContaining({
						id: "timeline.captionReadback",
						status: "pass",
					}),
					expect.objectContaining({
						id: "timeline.transitionReadback",
						status: "pass",
					}),
					expect.objectContaining({
						id: "layout.textBounds",
						status: "pass",
					}),
					expect.objectContaining({
						id: "captionQuality.contract",
						category: "caption_quality",
						status: "pass",
					}),
					expect.objectContaining({
						id: "voiceConsistency.scriptedTts",
						category: "voice_consistency",
						status: "pass",
					}),
				]),
				limitations: expect.arrayContaining([
					expect.objectContaining({
						id: "face_detection",
						status: "not_available",
					}),
					expect.objectContaining({
						id: "burned_caption_detection",
						status: "not_available",
					}),
				]),
			},
		});
		expect(data.artifacts[0]).toMatchObject({
			kind: "timeline_contact_sheet",
		});
		expect(data.artifacts[0]?.path.replaceAll("\\", "/")).toContain(
			"/timeline-inspect/",
		);
		expect(
			(await readFile(data.artifacts[0]?.path ?? "")).byteLength,
		).toBeGreaterThan(0);
		expect(after).toEqual(before);
	});

	test("build_video_quality_report includes explicit title quality and exported file checks", async () => {
		const { plan } = await createAppliedQualityFixture();
		const state = await getExecutorProjectState({ projectId });
		const title = "Churn?";
		for (const track of state.tracks) {
			if (track.type === "text") {
				for (const element of track.elements) {
					if (element.type === "text" && element.content === plan.title.text) {
						element.content = title;
					}
				}
			}
		}
		await writeDraftState(state);
		const outputFile = join(stateDir, "quality-export.mp4");
		await writeFile(outputFile, "mp4-bytes");

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan: {
						...plan,
						title: {
							...plan.title,
							text: title,
						},
					},
					inspection: { startTime: 0, endTime: 2, frameCount: 1 },
					titleRubric: {
						platform: "youtube",
						primaryKeyword: "churn",
					},
					exportedFile: {
						outputFile,
						format: "mp4",
						includeAudio: true,
					},
				},
			}),
			probeExportedFile: async ({
				outputFile: probedFile,
				format,
				expectedWidth,
				expectedHeight,
			}) => {
				expect(probedFile).toBe(outputFile);
				expect(format).toBe("mp4");
				expect(expectedWidth).toBe(1080);
				expect(expectedHeight).toBe(1920);
				return {
					format: "mp4",
					duration: 2,
					width: 1080,
					height: 1920,
					videoTrackCount: 1,
					audioTrackCount: 1,
				};
			},
		});
		const data = resultData<{
			status: string;
			checks: Array<{
				id: string;
				category: string;
				status: string;
				evidence?: Record<string, unknown>;
			}>;
		}>(result.results[0]);
		const checks = new Map(data.checks.map((check) => [check.id, check]));

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: pass",
		});
		expect(data.status).toBe("pass");
		expect(checks.get("titleQuality.planningRubric")).toMatchObject({
			category: "title_quality",
			status: "pass",
		});
		expect(checks.get("finalReview.outputProbe")).toMatchObject({
			category: "export_probe",
			status: "pass",
			evidence: {
				outputFile,
				format: "mp4",
				duration: 2,
				width: 1080,
				height: 1920,
				videoTrackCount: 1,
				audioTrackCount: 1,
			},
		});
		expect(checks.get("finalReview.audioPresence")).toMatchObject({
			category: "audio_spotcheck",
			status: "pass",
			evidence: {
				includeAudio: true,
				audioTrackCount: 1,
			},
		});
	});

	test("build_video_quality_report warns for weak explicit title rubric", async () => {
		const { plan } = await createAppliedQualityFixture();

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan,
					inspection: { startTime: 0, endTime: 1, frameCount: 1 },
					titleRubric: {
						platform: "youtube",
						primaryKeyword: "customer retention",
					},
				},
			}),
		});
		const data = resultData<{
			status: string;
			checks: Array<{
				id: string;
				category: string;
				status: string;
				evidence?: {
					issues?: Array<{ code: string }>;
				};
			}>;
		}>(result.results[0]);
		const titleCheck = data.checks.find(
			(check) => check.id === "titleQuality.planningRubric",
		);

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: warning",
		});
		expect(data.status).toBe("warning");
		expect(titleCheck).toMatchObject({
			category: "title_quality",
			status: "warning",
		});
		expect(titleCheck?.evidence?.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "title_missing_keyword" }),
				expect.objectContaining({ code: "title_weak_hook" }),
				expect.objectContaining({ code: "title_generic" }),
			]),
		);
	});

	test("build_video_quality_report fails when scripted TTS captions are not represented", async () => {
		const { plan } = await createAppliedQualityFixture();
		const state = await getExecutorProjectState({ projectId });
		const audioPath = join(stateDir, "quality-voice.wav");
		const audioBytes = await createFixtureBareAudio({
			format: "wav",
			duration: 2,
		});
		await writeFile(audioPath, audioBytes);
		await writeDraftState({
			...state,
			mediaAssets: [
				...state.mediaAssets,
				{
					id: "tts-quality-1",
					name: "quality-voice.wav",
					type: "audio",
					mimeType: "audio/wav",
					duration: 2,
					size: audioBytes.byteLength,
					lastModified: 1,
					path: audioPath,
					spokenScript: {
						source: "tts",
						text: "Caption proof Missing script line",
						captions: ["Caption proof", "Missing script line"],
						provider: "runninghub-voice-design",
						providerTaskId: "voice-task-quality",
					},
				},
			],
			tracks: [
				...state.tracks,
				{
					id: "audio-track-quality",
					type: "audio",
					name: "Narration",
					muted: false,
					elements: [
						{
							id: "tts-quality-element",
							type: "audio",
							name: "Narration",
							sourceType: "upload",
							mediaId: "tts-quality-1",
							startTime: 0,
							duration: 2,
							trimStart: 0,
							trimEnd: 2,
							volume: 1,
							muted: false,
							playbackRate: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan,
					inspection: { startTime: 0, endTime: 1, frameCount: 1 },
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: fail",
			data: {
				schemaVersion: 2,
				status: "fail",
				checks: expect.arrayContaining([
					expect.objectContaining({
						id: "voiceConsistency.scriptedTts",
						category: "voice_consistency",
						status: "fail",
						evidence: {
							mismatches: [
								{
									mediaId: "tts-quality-1",
									provider: "runninghub-voice-design",
									scriptCaptionLineCount: 2,
									protectedTermCount: 0,
									missingScriptCaptionLineCount: 1,
									missingProtectedTermCount: 0,
								},
							],
						},
					}),
				]),
			},
		});
		expect(JSON.stringify(result.results[0])).not.toContain(
			"Missing script line",
		);
	});

	test("build_video_quality_report returns validation failure for unreadable captions", async () => {
		const { plan } = await createAppliedQualityFixture();
		const badCaptionPlan = {
			...plan,
			captions: [
				{
					text: "你在平台上认识的资源是冲着平台来的但是离开以后就没有了",
					startTime: 0,
					duration: 1,
				},
			],
			captionStyle: {
				preset: "talking-head-pop",
				position: "lower-safe",
				size: "medium",
			},
		};

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan: badCaptionPlan,
					inspection: { startTime: 0, endTime: 1, frameCount: 2 },
				},
			}),
		});
		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: fail",
			data: {
				status: "fail",
				artifacts: [],
				checks: expect.arrayContaining([
					expect.objectContaining({
						id: "editPlan.validation",
						status: "fail",
						message:
							"Caption text cannot fit the selected preset within the line limits.",
						evidence: { path: "captions[0].text" },
					}),
				]),
			},
		});
	});

	test("build_video_quality_report fails for oversized caption visual footprint", async () => {
		const { plan } = await createAppliedQualityFixture();
		const state = await getExecutorProjectState({ projectId });
		let captionElement: TextElement | undefined;
		for (const track of state.tracks) {
			if (track.type !== "text") continue;
			captionElement = track.elements.find(
				(element) => element.content === "Caption proof",
			);
			if (captionElement) break;
		}
		if (!captionElement) {
			throw new Error("Expected caption text element.");
		}
		captionElement.fontSize = 12;
		captionElement.stroke = { color: "#000000", width: 5 };
		await writeDraftState(state);

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan,
					inspection: { startTime: 0, endTime: 1, frameCount: 1 },
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: fail",
			data: {
				status: "fail",
			},
		});
		const report = resultData<{
			checks: Array<{
				id: string;
				category?: string;
				status?: string;
				severity?: string;
				evidence?: {
					offendingCaptions?: Array<{
						id: string;
						content: string;
						fontPx: number;
						strokePx: number;
						heightRatio: number;
					}>;
				};
			}>;
		}>(result.results[0]);
		const visualCheck = report.checks.find(
			(check) => check.id === "captionStyle.visualFootprint",
		);
		expect(visualCheck).toMatchObject({
			category: "layout",
			status: "fail",
			severity: "critical",
		});
		const offendingCaption = visualCheck?.evidence?.offendingCaptions?.[0];
		expect(offendingCaption).toMatchObject({
			id: captionElement.id,
			content: "Caption proof",
			strokePx: 10,
		});
		expect(offendingCaption?.fontPx).toBeGreaterThan(250);
		expect(offendingCaption?.heightRatio).toBeGreaterThan(0.16);
	});

	test("build_video_quality_report passes property-clean-yellow medium captions", async () => {
		const { plan } = await createAppliedQualityFixture();
		const propertyPlan = {
			...plan,
			captionStyle: {
				preset: "property-clean-yellow",
				position: "lower-safe",
				size: "medium",
			},
		};
		const applyResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "apply_edit_plan",
				args: {
					replaceExisting: true,
					plan: propertyPlan,
				},
			}),
		});
		expect(applyResult.results[0]).toMatchObject({ success: true });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan: propertyPlan,
					inspection: { startTime: 0, endTime: 1, frameCount: 1 },
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				status: "pass",
			},
		});
		const report = resultData<{
			checks: Array<{
				id: string;
				status?: string;
				evidence?: {
					captions?: Array<{
						content: string;
						fontPx: number;
						strokePx: number;
					}>;
				};
			}>;
		}>(result.results[0]);
		const visualCheck = report.checks.find(
			(check) => check.id === "captionStyle.visualFootprint",
		);
		expect(visualCheck?.status).toBe("pass");
		expect(visualCheck?.evidence?.captions?.[0]).toMatchObject({
			content: "Caption proof",
			fontPx: 102.4,
			strokePx: 4,
		});
	});

	test("build_video_quality_report fails when caption readback is missing", async () => {
		const { plan } = await createAppliedQualityFixture();
		const state = await getExecutorProjectState({ projectId });
		for (const track of state.tracks) {
			if (track.type === "text") {
				track.elements = track.elements.filter(
					(element) =>
						element.type !== "text" || element.content !== "Caption proof",
				);
			}
		}
		await writeDraftState(state);

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan,
					inspection: { startTime: 0, endTime: 2, frameCount: 2 },
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: fail",
			data: {
				status: "fail",
				checks: expect.arrayContaining([
					expect.objectContaining({
						id: "timeline.captionReadback",
						status: "fail",
						message:
							"1 EditPlan caption(s) were not found in timeline readback.",
					}),
				]),
			},
		});
	});

	test("build_video_quality_report fails when caption text renders outside the canvas", async () => {
		const { plan } = await createAppliedQualityFixture();
		const state = await getExecutorProjectState({ projectId });
		for (const track of state.tracks) {
			if (track.type === "text") {
				for (const element of track.elements) {
					if (element.type === "text" && element.content === "Caption proof") {
						element.transform.position.x = 5000;
					}
				}
			}
		}
		await writeDraftState(state);

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan,
					inspection: { startTime: 0, endTime: 2, frameCount: 2 },
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: fail",
			data: {
				status: "fail",
				checks: expect.arrayContaining([
					expect.objectContaining({
						id: "layout.textBounds",
						status: "fail",
						message: "1 plan text element(s) render outside the canvas.",
					}),
				]),
			},
		});
	});

	test("build_video_quality_report fails when transition readback is missing", async () => {
		const { plan } = await createAppliedQualityFixture();
		const state = await getExecutorProjectState({ projectId });
		for (const track of state.tracks) {
			if (track.type === "video") {
				track.transitions = [];
			}
		}
		await writeDraftState(state);

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "build_video_quality_report",
				args: {
					plan,
					inspection: { startTime: 0, endTime: 2, frameCount: 2 },
				},
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			message: "Built VideoQualityReport: fail",
			data: {
				status: "fail",
				checks: expect.arrayContaining([
					expect.objectContaining({
						id: "timeline.transitionReadback",
						status: "fail",
						message:
							"1 EditPlan transition(s) were not found in timeline readback.",
					}),
				]),
			},
		});
	});

	test("get_transcript maps edited clip source segments back onto the timeline", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "media-1",
					name: "talk.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 30,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/talk.mp4",
				},
			],
			tracks: [
				{
					id: "video-track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Talk",
							mediaId: "media-1",
							startTime: 10,
							duration: 5,
							trimStart: 20,
							trimEnd: 25,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});
		const before = await getExecutorProjectState({ projectId });
		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_transcript",
				args: {
					granularity: "segment",
					language: "auto",
					modelId: "whisper-tiny",
					includeFrames: true,
				},
			}),
			transcribeMediaRange: async ({ range }) => {
				expect(range).toEqual({ start: 20, end: 25 });
				return {
					text: "hello",
					segments: [{ text: "hello", start: 1, end: 2 }],
					language: "auto",
					modelId: "whisper-tiny",
					...asrContractFields(),
				};
			},
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				revision: 1,
				segmentFormat: [
					"text",
					"startTime",
					"endTime",
					"sourceStart",
					"sourceEnd",
				],
				frameFormat: [
					"startFrame",
					"endFrame",
					"sourceStartFrame",
					"sourceEndFrame",
				],
				clips: [
					{
						clipId: "clip-1",
						trackId: "video-track-1",
						mediaId: "media-1",
						segments: [["hello", 11, 12, 21, 22]],
						segmentFrames: [[330, 360, 630, 660]],
					},
				],
			},
		});
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("get_transcript clamps returned segments to the edited clip range", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "media-1",
					name: "talk.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 30,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/talk.mp4",
				},
			],
			tracks: [
				{
					id: "video-track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Talk",
							mediaId: "media-1",
							startTime: 10,
							duration: 5,
							trimStart: 20,
							trimEnd: 25,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_transcript",
				args: {
					granularity: "segment",
					language: "auto",
					modelId: "whisper-tiny",
					includeFrames: true,
				},
			}),
			transcribeMediaRange: async ({ range }) => {
				expect(range).toEqual({ start: 20, end: 25 });
				return {
					text: "long",
					segments: [{ text: "long", start: 0, end: 10 }],
					language: "auto",
					modelId: "whisper-tiny",
					...asrContractFields(),
				};
			},
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				clips: [
					{
						clipId: "clip-1",
						segments: [["long", 10, 15, 20, 25]],
						segmentFrames: [[300, 450, 600, 750]],
					},
				],
			},
		});
	});

	test("get_transcript requires explicit transcript granularity", async () => {
		await seedDraftState({ tracks: [] });
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_transcript",
				args: {
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
		});

		expect(result.results[0]).toMatchObject({ success: false });
		expect(
			String((result.results[0] as { message?: unknown }).message),
		).toContain("granularity");
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("get_transcript maps word timestamps through trim playbackRate and timeline position", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "media-1",
					name: "talk.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 30,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/talk.mp4",
				},
			],
			tracks: [
				{
					id: "video-track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Talk",
							mediaId: "media-1",
							startTime: 10,
							duration: 4,
							trimStart: 20,
							trimEnd: 28,
							playbackRate: 2,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_transcript",
				args: {
					granularity: "word",
					language: "auto",
					modelId: "whisper-tiny",
					includeFrames: true,
				},
			}),
			transcribeMediaRange: async ({ range }) => {
				expect(range).toEqual({ start: 20, end: 28 });
				return {
					text: "hello again",
					segments: [{ text: "hello again", start: 1, end: 3 }],
					words: [
						{ text: "hello", start: 1, end: 1.5 },
						{ text: "again", start: 2, end: 3 },
					],
					language: "auto",
					modelId: "whisper-tiny",
					...wordAsrContractFields(),
				};
			},
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				revision: 1,
				wordFormat: [
					"text",
					"startTime",
					"endTime",
					"sourceStart",
					"sourceEnd",
				],
				frameFormat: [
					"startFrame",
					"endFrame",
					"sourceStartFrame",
					"sourceEndFrame",
				],
				clips: [
					{
						clipId: "clip-1",
						trackId: "video-track-1",
						mediaId: "media-1",
						words: [
							["hello", 10.5, 10.75, 21, 21.5],
							["again", 11, 11.5, 22, 23],
						],
						wordFrames: [
							[315, 323, 630, 645],
							[330, 345, 660, 690],
						],
					},
				],
			},
		});
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("get_transcript word mode fails fast when ASR returns no word timestamps", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "media-1",
					name: "talk.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 30,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/talk.mp4",
				},
			],
			tracks: [
				{
					id: "video-track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Talk",
							mediaId: "media-1",
							startTime: 0,
							duration: 5,
							trimStart: 0,
							trimEnd: 5,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_transcript",
				args: {
					granularity: "word",
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
			transcribeMediaRange: async () => ({
				text: "hello",
				segments: [{ text: "hello", start: 1, end: 2 }],
				language: "auto",
				modelId: "whisper-tiny",
				...asrContractFields(),
			}),
		});

		expect(result.results[0]).toMatchObject({ success: false });
		expect(
			String((result.results[0] as { message?: unknown }).message),
		).toContain("word timestamps");
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("insert_clips ripples later elements on the target track", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "media-1",
					name: "source.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 10,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/source.mp4",
				},
			],
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "existing-1",
							type: "video",
							name: "Existing",
							mediaId: "media-1",
							startTime: 2,
							duration: 2,
							trimStart: 2,
							trimEnd: 4,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "insert_clips",
				args: {
					trackId: "track-1",
					atTime: 1,
					clips: [
						{
							mediaId: "media-1",
							duration: 1.5,
							trimStart: 0.5,
							trimEnd: 2,
						},
					],
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const inserted = state.tracks[0].elements.find(
			(element) => element.id !== "existing-1",
		);

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				createdElementIds: [expect.any(String)],
				changedElementIds: ["existing-1"],
				removedElementIds: [],
				revision: 2,
				totalDuration: 5.5,
			},
		});
		expect(inserted).toMatchObject({
			type: "video",
			mediaId: "media-1",
			startTime: 1,
			duration: 1.5,
			trimStart: 0.5,
			trimEnd: 2,
		});
		expect(
			state.tracks[0].elements.find((e) => e.id === "existing-1"),
		).toMatchObject({ startTime: 3.5 });
		expect(state.revision).toBe(2);
	});

	test("move_clips moves an element by id to another compatible track", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Source",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "image",
							name: "Still",
							mediaId: "media-1",
							startTime: 0,
							duration: 2,
							trimStart: 0,
							trimEnd: 0,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
				{
					id: "track-2",
					type: "video",
					name: "Destination",
					isMain: false,
					muted: false,
					hidden: false,
					elements: [],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "move_clips",
				args: {
					moves: [{ elementId: "clip-1", toTrackId: "track-2", startTime: 4 }],
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(result.results[0]).toMatchObject({
			success: true,
			data: { changedElementIds: ["clip-1"], revision: 2, totalDuration: 6 },
		});
		expect(state.tracks[0].elements).toEqual([]);
		expect(state.tracks[1].elements[0]).toMatchObject({
			id: "clip-1",
			startTime: 4,
		});
	});

	test("remove_clips deletes only requested elements without ripple", async () => {
		const textBase = {
			type: "text",
			name: "Text",
			richSpans: [],
			fontSize: 24,
			fontFamily: "Inter",
			color: "#ffffff",
			backgroundColor: "transparent",
			textAlign: "center",
			fontWeight: "normal",
			fontStyle: "normal",
			textDecoration: "none",
			transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
			opacity: 1,
			trimStart: 0,
			trimEnd: 0,
		};
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "text",
					name: "Captions",
					hidden: false,
					elements: [
						{
							...textBase,
							id: "text-1",
							content: "remove",
							startTime: 0,
							duration: 1,
						},
						{
							...textBase,
							id: "text-2",
							content: "keep",
							startTime: 3,
							duration: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "remove_clips",
				args: { elementIds: ["text-1"] },
			}),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				removedElementIds: ["text-1"],
				changedElementIds: [],
				createdElementIds: [],
				revision: 2,
				totalDuration: 4,
			},
		});
		expect(state.tracks[0].elements).toEqual([
			expect.objectContaining({ id: "text-2", startTime: 3 }),
		]);
	});

	test("split_clip keeps source trim continuity across left and right clips", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip",
							mediaId: "media-1",
							startTime: 2,
							duration: 6,
							trimStart: 10,
							trimEnd: 16,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "split_clip",
				args: { elementId: "clip-1", atTime: 5 },
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const [left, right] = state.tracks[0].elements;

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				createdElementIds: [expect.any(String)],
				changedElementIds: ["clip-1"],
				revision: 2,
			},
		});
		expect(left).toMatchObject({
			id: "clip-1",
			startTime: 2,
			duration: 3,
			trimStart: 10,
			trimEnd: 13,
		});
		expect(right).toMatchObject({
			startTime: 5,
			duration: 3,
			trimStart: 13,
			trimEnd: 16,
		});
	});

	test("split_clip preserves linear keyframe continuity at the cut", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip",
							mediaId: "media-1",
							startTime: 2,
							duration: 6,
							trimStart: 10,
							trimEnd: 16,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
							keyframes: {
								opacity: [
									{ time: 0, value: 1, interpolation: "linear" },
									{ time: 6, value: 0, interpolation: "linear" },
								],
								"transform.position": [
									{
										time: 0,
										value: { x: 0, y: 0 },
										interpolation: "linear",
									},
									{
										time: 6,
										value: { x: 60, y: 30 },
										interpolation: "linear",
									},
								],
							},
						},
					],
				},
			],
		});

		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "split_clip",
				args: { elementId: "clip-1", atTime: 5 },
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const [left, right] = state.tracks[0].elements;

		expect(left.keyframes?.opacity).toEqual([
			{ time: 0, value: 1, interpolation: "linear" },
			{ time: 3, value: 0.5, interpolation: "linear" },
		]);
		expect(right.keyframes?.opacity).toEqual([
			{ time: 0, value: 0.5, interpolation: "linear" },
			{ time: 3, value: 0, interpolation: "linear" },
		]);
		expect(left.keyframes?.["transform.position"]).toEqual([
			{ time: 0, value: { x: 0, y: 0 }, interpolation: "linear" },
			{ time: 3, value: { x: 30, y: 15 }, interpolation: "linear" },
		]);
		expect(right.keyframes?.["transform.position"]).toEqual([
			{ time: 0, value: { x: 30, y: 15 }, interpolation: "linear" },
			{ time: 3, value: { x: 60, y: 30 }, interpolation: "linear" },
		]);
	});

	test("split_clip preserves hold keyframe value at the cut", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip",
							mediaId: "media-1",
							startTime: 0,
							duration: 6,
							trimStart: 0,
							trimEnd: 6,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
							keyframes: {
								opacity: [
									{ time: 0, value: 1, interpolation: "hold" },
									{ time: 4, value: 0.2, interpolation: "hold" },
								],
							},
						},
					],
				},
			],
		});

		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "split_clip",
				args: { elementId: "clip-1", atTime: 3 },
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const [left, right] = state.tracks[0].elements;

		expect(left.keyframes?.opacity).toEqual([
			{ time: 0, value: 1, interpolation: "hold" },
			{ time: 3, value: 1, interpolation: "hold" },
		]);
		expect(right.keyframes?.opacity).toEqual([
			{ time: 0, value: 1, interpolation: "hold" },
			{ time: 1, value: 0.2, interpolation: "hold" },
		]);
	});

	test("set_clip_properties updates only whitelisted element properties", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip",
							mediaId: "media-1",
							startTime: 0,
							duration: 5,
							trimStart: 0,
							trimEnd: 5,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "set_clip_properties",
				args: {
					elementIds: ["clip-1"],
					properties: {
						duration: 3,
						trimStart: 1,
						trimEnd: 4,
						opacity: 0.4,
						playbackRate: 1.25,
						transform: {
							scale: 1.2,
							position: { x: 12, y: -8 },
							rotate: 5,
						},
					},
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				changedElementIds: ["clip-1"],
				revision: 2,
				totalDuration: 3,
			},
		});
		expect(state.tracks[0].elements[0]).toMatchObject({
			duration: 3,
			trimStart: 1,
			trimEnd: 4,
			opacity: 0.4,
			playbackRate: 1.25,
			transform: {
				scale: 1.2,
				position: { x: 12, y: -8 },
				rotate: 5,
			},
		});

		const beforeInvalid = await getExecutorProjectState({ projectId });
		const invalid = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "set_clip_properties",
				args: {
					elementIds: ["clip-1"],
					properties: { unsupported: true },
				},
			}),
		});

		expect(invalid.results[0]).toMatchObject({ success: false });
		expect(
			String((invalid.results[0] as { message?: unknown }).message),
		).toContain("unsupported");
		expect(await getExecutorProjectState({ projectId })).toEqual(beforeInvalid);
	});

	test("ripple_delete_ranges rejects ranges without an explicit scope", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip 1",
							mediaId: "media-1",
							startTime: 0,
							duration: 4,
							trimStart: 0,
							trimEnd: 4,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "ripple_delete_ranges",
				args: { ranges: [[1, 3]] },
			}),
		});

		expect(result.results[0]).toMatchObject({ success: false });
		expect(
			String((result.results[0] as { message?: unknown }).message),
		).toContain("scope");
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("ripple_delete_ranges cuts timeline-scoped ranges and shifts all tracks", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip 1",
							mediaId: "media-1",
							startTime: 0,
							duration: 4,
							trimStart: 0,
							trimEnd: 4,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
						{
							id: "clip-2",
							type: "video",
							name: "Clip 2",
							mediaId: "media-1",
							startTime: 5,
							duration: 2,
							trimStart: 5,
							trimEnd: 7,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "ripple_delete_ranges",
				args: { scope: { type: "timeline" }, ranges: [[1, 3]] },
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const elements = state.tracks[0].elements;

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				removedRanges: [[1, 3]],
				createdElementIds: [expect.any(String)],
				changedElementIds: ["clip-1", "clip-2"],
				revision: 2,
				totalDuration: 5,
			},
		});
		expect(elements[0]).toMatchObject({
			id: "clip-1",
			startTime: 0,
			duration: 1,
			trimStart: 0,
			trimEnd: 1,
		});
		expect(elements[1]).toMatchObject({
			startTime: 1,
			duration: 1,
			trimStart: 3,
			trimEnd: 4,
		});
		expect(elements[2]).toMatchObject({
			id: "clip-2",
			startTime: 3,
		});
	});

	test("ripple_delete_ranges track scope cuts and shifts only the target track", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Target Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip 1",
							mediaId: "media-1",
							startTime: 0,
							duration: 4,
							trimStart: 0,
							trimEnd: 4,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
						{
							id: "clip-2",
							type: "video",
							name: "Clip 2",
							mediaId: "media-1",
							startTime: 5,
							duration: 2,
							trimStart: 5,
							trimEnd: 7,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
				{
					id: "track-2",
					type: "video",
					name: "Untouched Track",
					isMain: false,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "broll-1",
							type: "video",
							name: "B-roll",
							mediaId: "media-1",
							startTime: 5,
							duration: 2,
							trimStart: 5,
							trimEnd: 7,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "ripple_delete_ranges",
				args: {
					scope: { type: "track", trackId: "track-1" },
					ranges: [[1, 3]],
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				changedElementIds: ["clip-1", "clip-2"],
				revision: 2,
				totalDuration: 7,
			},
		});
		expect(state.tracks[0].elements).toEqual([
			expect.objectContaining({
				id: "clip-1",
				startTime: 0,
				duration: 1,
				trimStart: 0,
				trimEnd: 1,
			}),
			expect.objectContaining({
				startTime: 1,
				duration: 1,
				trimStart: 3,
				trimEnd: 4,
			}),
			expect.objectContaining({
				id: "clip-2",
				startTime: 3,
			}),
		]);
		expect(state.tracks[1].elements).toEqual([
			expect.objectContaining({ id: "broll-1", startTime: 5 }),
		]);
	});

	test("ripple_delete_ranges element scope cuts only the target element", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip 1",
							mediaId: "media-1",
							startTime: 0,
							duration: 4,
							trimStart: 0,
							trimEnd: 4,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
						{
							id: "clip-2",
							type: "video",
							name: "Clip 2",
							mediaId: "media-1",
							startTime: 5,
							duration: 2,
							trimStart: 5,
							trimEnd: 7,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "ripple_delete_ranges",
				args: {
					scope: { type: "element", elementId: "clip-1" },
					ranges: [[1, 3]],
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				changedElementIds: ["clip-1"],
				revision: 2,
				totalDuration: 7,
			},
		});
		expect(state.tracks[0].elements).toEqual([
			expect.objectContaining({
				id: "clip-1",
				startTime: 0,
				duration: 1,
				trimStart: 0,
				trimEnd: 1,
			}),
			expect.objectContaining({
				startTime: 1,
				duration: 1,
				trimStart: 3,
				trimEnd: 4,
			}),
			expect.objectContaining({
				id: "clip-2",
				startTime: 5,
				duration: 2,
			}),
		]);
	});

	test("ripple_delete_ranges rebases keyframes for retained segments", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Clip",
							mediaId: "media-1",
							startTime: 0,
							duration: 6,
							trimStart: 0,
							trimEnd: 6,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
							keyframes: {
								opacity: [
									{ time: 0, value: 1, interpolation: "linear" },
									{ time: 6, value: 0, interpolation: "linear" },
								],
							},
						},
					],
				},
			],
		});

		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "ripple_delete_ranges",
				args: {
					scope: { type: "element", elementId: "clip-1" },
					ranges: [[2, 4]],
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const [left, right] = state.tracks[0].elements;

		expect(left.keyframes?.opacity).toEqual([
			{ time: 0, value: 1, interpolation: "linear" },
			{ time: 2, value: 0.667, interpolation: "linear" },
		]);
		expect(right.keyframes?.opacity).toEqual([
			{ time: 0, value: 0.333, interpolation: "linear" },
			{ time: 2, value: 0, interpolation: "linear" },
		]);
	});

	test("add_texts creates a top text track and returns created ids", async () => {
		await seedDraftState({ tracks: [] });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "add_texts",
				args: {
					entries: [
						{
							startTime: 0.5,
							duration: 2,
							content: "Hook line",
							name: "Hook",
							fontSize: 8,
							fontFamily: "Inter",
							color: "#ffe45c",
							textAlign: "center",
							fontWeight: "bold",
							transform: {
								scale: 1,
								position: { x: 12, y: -320 },
								rotate: 0,
							},
							boxWidth: 52,
							stroke: { color: "#000000", width: 3 },
						},
					],
				},
			}),
		});
		const state = await getExecutorProjectState({ projectId });
		const createdId = resultData<{
			createdTrackId: string;
			createdElementIds: string[];
			revision: number;
		}>(result.results[0]).createdElementIds[0];

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				createdTrackId: expect.any(String),
				createdElementIds: [expect.any(String)],
				changedElementIds: [],
				removedElementIds: [],
				revision: 2,
				totalDuration: 2.5,
			},
		});
		expect(state.tracks[0]).toMatchObject({
			type: "text",
			elements: [
				{
					id: createdId,
					type: "text",
					name: "Hook",
					content: "Hook line",
					startTime: 0.5,
					duration: 2,
					fontSize: 8,
					fontFamily: "Inter",
					color: "#ffe45c",
					fontWeight: "bold",
					transform: {
						scale: 1,
						position: { x: 12, y: -320 },
						rotate: 0,
					},
					boxWidth: 52,
					stroke: { color: "#000000", width: 3 },
				},
			],
		});
		expect(state.revision).toBe(2);
	});

	test("add_texts fails fast for incompatible tracks without mutating revision", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "audio-track-1",
					type: "audio",
					name: "Audio",
					muted: false,
					elements: [],
				},
			],
		});
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "add_texts",
				args: {
					trackId: "audio-track-1",
					entries: [{ startTime: 0, duration: 1, content: "Nope" }],
				},
			}),
		});

		expect(result.results[0]).toMatchObject({ success: false });
		expect(
			String((result.results[0] as { message?: unknown }).message),
		).toContain("text elements cannot be placed on audio tracks");
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("add_captions writes segment-level captions from edited clip audio", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "media-1",
					name: "talk.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 30,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/talk.mp4",
				},
			],
			tracks: [
				{
					id: "video-track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Talk",
							mediaId: "media-1",
							startTime: 10,
							duration: 5,
							trimStart: 20,
							trimEnd: 25,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "add_captions",
				args: {
					language: "auto",
					modelId: "whisper-tiny",
					captionStyle: {
						preset: "talking-head-pop",
						position: "lower-safe",
						size: "medium",
					},
				},
			}),
			transcribeMediaRange: async ({ range }) => {
				expect(range).toEqual({ start: 20, end: 25 });
				return {
					text: "hello world",
					segments: [{ text: "hello world", start: 1, end: 2 }],
					language: "auto",
					modelId: "whisper-tiny",
					...asrContractFields(),
				};
			},
		});
		const state = await getExecutorProjectState({ projectId });
		const textTrack = state.tracks.find((track) => track.type === "text");

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				source: "edited_video_clip_audio",
				captionCount: 1,
				createdTrackId: expect.any(String),
				createdElementIds: [expect.any(String)],
				revision: 2,
			},
		});
		expect(textTrack?.elements[0]).toMatchObject({
			type: "text",
			content: "hello world",
			startTime: 11,
			duration: 1,
			fontFamily: "CodecutCJK",
			fontSize: 4.8,
			fontWeight: "bold",
			color: "#fff3b0",
			transform: { scale: 1, position: { x: 0, y: 520 }, rotate: 0 },
		});
	});

	test("add_captions rejects unreadable generated captions before mutating", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "media-1",
					name: "talk.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 30,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/talk.mp4",
				},
			],
			tracks: [
				{
					id: "video-track-1",
					type: "video",
					name: "Main Track",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [
						{
							id: "clip-1",
							type: "video",
							name: "Talk",
							mediaId: "media-1",
							startTime: 0,
							duration: 5,
							trimStart: 0,
							trimEnd: 5,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
						},
					],
				},
			],
		});
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "add_captions",
				args: {
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
			transcribeMediaRange: async () => ({
				text: "too fast",
				segments: [{ text: "too fast", start: 1, end: 1.2 }],
				language: "auto",
				modelId: "whisper-tiny",
				...asrContractFields(),
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: false,
			message: "Generated captions failed caption quality validation.",
			data: {
				captionQuality: {
					ok: false,
					issues: [
						expect.objectContaining({
							code: "caption_too_short",
							path: "captions[0].duration",
						}),
					],
				},
			},
		});
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("add_captions writes segment-level captions from edited audio clips", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "audio-1",
					name: "voice.wav",
					type: "audio",
					mimeType: "audio/wav",
					duration: 12,
					size: 5,
					lastModified: 1,
					path: "/tmp/voice.wav",
				},
			],
			tracks: [
				{
					id: "audio-track-1",
					type: "audio",
					name: "Voice",
					muted: false,
					elements: [
						{
							id: "audio-clip-1",
							type: "audio",
							name: "Voice",
							mediaId: "audio-1",
							startTime: 3,
							duration: 4,
							trimStart: 2,
							trimEnd: 6,
							sourceType: "upload",
							volume: 1,
							muted: false,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "add_captions",
				args: {
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
			transcribeMediaRange: async ({ mediaAsset, range }) => {
				expect(mediaAsset.id).toBe("audio-1");
				expect(range).toEqual({ start: 2, end: 6 });
				return {
					text: "searchable transcript",
					segments: [{ text: "searchable transcript", start: 0.5, end: 2.5 }],
					language: "auto",
					modelId: "whisper-tiny",
					...asrContractFields(),
				};
			},
		});
		const state = await getExecutorProjectState({ projectId });
		const textTrack = state.tracks.find((track) => track.type === "text");

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				source: "edited_timeline_audio",
				captionCount: 1,
				revision: 2,
			},
		});
		expect(textTrack?.elements[0]).toMatchObject({
			type: "text",
			content: "searchable transcript",
			startTime: 3.5,
			duration: 2,
		});
	});

	test("list_models returns current callable model contracts without mutating state", async () => {
		await seedDraftState({ tracks: [] });
		const before = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({ tool: "list_models", args: {} }),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				models: expect.arrayContaining([
					expect.objectContaining({
						type: "transcription",
						id: "whisper-base",
					}),
					expect.objectContaining({
						type: "digital_human",
						id: "runninghub-digital-human",
					}),
					expect.objectContaining({
						type: "voice",
						id: "runninghub-voice-design",
						inputs: ["text", "emotionPrompt"],
					}),
					expect.objectContaining({
						type: "voice",
						id: "runninghub-voice-clone",
						inputs: ["audioPath", "text"],
					}),
				]),
				defaults: { transcription: "whisper-base" },
			},
		});
		expect(await getExecutorProjectState({ projectId })).toEqual(before);
	});

	test("set_keyframes writes visual keyframes and exposes them in timeline state v2", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "text-track-1",
					type: "text",
					name: "Text",
					hidden: false,
					elements: [
						{
							id: "text-1",
							type: "text",
							name: "Title",
							content: "Animated",
							richSpans: [],
							fontSize: 12,
							fontFamily: "Inter",
							color: "#ffffff",
							backgroundColor: "transparent",
							textAlign: "center",
							fontWeight: "bold",
							fontStyle: "normal",
							textDecoration: "none",
							hidden: false,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
							startTime: 0,
							duration: 4,
							trimStart: 0,
							trimEnd: 0,
						},
					],
				},
			],
		});

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "set_keyframes",
				args: {
					elementId: "text-1",
					property: "opacity",
					keyframes: [
						{ time: 2, value: 0.2, interpolation: "hold" },
						{ time: 0, value: 1, interpolation: "linear" },
						{ time: 2, value: 0.4, interpolation: "linear" },
					],
				},
			}),
		});
		const readback = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: { format: "v2" },
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: { changedElementIds: ["text-1"], revision: 2 },
		});
		expect(readback.results[0]).toMatchObject({
			success: true,
			data: {
				tracks: [
					{
						elements: [
							{
								id: "text-1",
								keyframes: {
									opacity: [
										{ time: 0, value: 1, interpolation: "linear" },
										{ time: 2, value: 0.4, interpolation: "linear" },
									],
								},
							},
						],
					},
				],
			},
		});
	});

	test("set_keyframes accepts the full interpolation contract for non-text visual readback", async () => {
		await seedDraftState({
			tracks: [
				{
					id: "sticker-track-1",
					type: "sticker",
					name: "Stickers",
					hidden: false,
					elements: [
						{
							id: "sticker-1",
							type: "sticker",
							name: "Badge",
							iconName: "solar:star-bold",
							color: "#ffffff",
							hidden: false,
							transform: { scale: 1, position: { x: 0, y: 0 }, rotate: 0 },
							opacity: 1,
							startTime: 0,
							duration: 4,
							trimStart: 0,
							trimEnd: 0,
						},
					],
				},
			],
		});

		const scaleResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "set_keyframes",
				args: {
					elementId: "sticker-1",
					property: "transform.scale",
					keyframes: [
						{ time: 0, value: 1, interpolation: "ease-in-out" },
						{ time: 2, value: 1.5, interpolation: "ease-out" },
					],
				},
			}),
		});
		const positionResult = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "set_keyframes",
				args: {
					elementId: "sticker-1",
					property: "transform.position",
					keyframes: [
						{
							time: 0,
							value: { x: 0, y: 0 },
							interpolation: "ease-in",
						},
						{
							time: 2,
							value: { x: 120, y: 80 },
							interpolation: "ease-out",
						},
					],
				},
			}),
		});
		const readback = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "get_timeline_state",
				args: { format: "v2" },
			}),
		});

		expect(scaleResult.results[0]).toMatchObject({ success: true });
		expect(positionResult.results[0]).toMatchObject({ success: true });
		expect(readback.results[0]).toMatchObject({
			success: true,
			data: {
				tracks: [
					{
						elements: [
							{
								id: "sticker-1",
								keyframes: {
									"transform.scale": [
										{ time: 0, value: 1, interpolation: "ease-in-out" },
										{ time: 2, value: 1.5, interpolation: "ease-out" },
									],
									"transform.position": [
										{
											time: 0,
											value: { x: 0, y: 0 },
											interpolation: "ease-in",
										},
										{
											time: 2,
											value: { x: 120, y: 80 },
											interpolation: "ease-out",
										},
									],
								},
								motion: {
									keyframes: {
										"transform.scale": [
											{ time: 0, value: 1, interpolation: "ease-in-out" },
											{ time: 2, value: 1.5, interpolation: "ease-out" },
										],
										"transform.position": [
											{
												time: 0,
												value: { x: 0, y: 0 },
												interpolation: "ease-in",
											},
											{
												time: 2,
												value: { x: 120, y: 80 },
												interpolation: "ease-out",
											},
										],
									},
								},
							},
						],
					},
				],
			},
		});
	});

	test("search_media finds metadata and cached spoken transcript hits", async () => {
		await seedDraftState({
			mediaAssets: [
				{
					id: "media-1",
					name: "launch demo.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 30,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/launch.mp4",
				},
				{
					id: "media-2",
					name: "silent broll.mp4",
					type: "video",
					mimeType: "video/mp4",
					duration: 20,
					width: 1920,
					height: 1080,
					size: 5,
					lastModified: 1,
					path: "/tmp/broll.mp4",
				},
			],
			tracks: [],
		});
		await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "transcribe_media",
				args: {
					mediaId: "media-1",
					language: "auto",
					modelId: "whisper-tiny",
				},
			}),
			transcribeMedia: async () => ({
				text: "launch offer starts now",
				segments: [{ text: "launch offer starts now", start: 3, end: 5 }],
				language: "auto",
				modelId: "whisper-tiny",
				...asrContractFields(),
			}),
		});
		const beforeSearch = await getExecutorProjectState({ projectId });

		const result = await executeCodexExecutorEnvelope({
			envelope: envelope({
				tool: "search_media",
				args: { query: "launch", scope: "both", limit: 5 },
			}),
		});

		expect(result.results[0]).toMatchObject({
			success: true,
			data: {
				query: "launch",
				metadata: [
					expect.objectContaining({
						mediaId: "media-1",
						name: "launch demo.mp4",
					}),
				],
				spoken: [
					{
						mediaId: "media-1",
						name: "launch demo.mp4",
						startSeconds: 3,
						endSeconds: 5,
						text: "launch offer starts now",
						score: expect.any(Number),
					},
				],
				unindexedMediaIds: ["media-2"],
			},
		});
		expect(await getExecutorProjectState({ projectId })).toEqual(beforeSearch);
	});
});
