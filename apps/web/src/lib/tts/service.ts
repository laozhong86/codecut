import type { EditorCore } from "@/core";
import { resolveVoicePack, type VoicePack } from "@/constants/tts-constants";
import { buildUploadAudioElement, wouldElementOverlap } from "@/lib/timeline";
import type { SpokenScriptData } from "@/services/storage/types";
import { useGeneratedVoicesStore } from "@/stores/generated-voices-store";
import { buildTtsSpokenScript } from "./spoken-script";

export interface TtsResult {
	duration: number;
	buffer: AudioBuffer;
	blob: Blob;
	provider?: SpokenScriptData["provider"];
	providerTaskId?: string;
}

function base64ToArrayBuffer({ base64 }: { base64: string }): ArrayBuffer {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

async function decodeAudioBlob({ blob }: { blob: Blob }): Promise<AudioBuffer> {
	const arrayBuffer = await blob.arrayBuffer();
	const audioContext = new AudioContext();
	return audioContext.decodeAudioData(arrayBuffer.slice(0));
}

async function generateLegacySpeechFromText({
	text,
}: {
	text: string;
}): Promise<TtsResult> {
	const response = await fetch("/api/tts/generate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ text, voice: "default" }),
	});

	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new Error(error?.error ?? `TTS request failed: ${response.status}`);
	}

	const { audio } = (await response.json()) as { audio: string };
	const arrayBuffer = base64ToArrayBuffer({ base64: audio });
	const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
	const buffer = await decodeAudioBlob({ blob });

	return {
		duration: buffer.duration,
		buffer,
		blob,
	};
}

async function fetchVoiceReferenceAudio({
	voicePack,
}: {
	voicePack: VoicePack;
}): Promise<File> {
	if (
		!voicePack.referenceAudioUrl ||
		!voicePack.referenceAudioFileName ||
		!voicePack.referenceAudioMimeType
	) {
		throw new Error(`TTS voice ${voicePack.id} is missing reference audio.`);
	}

	const response = await fetch(voicePack.referenceAudioUrl);
	if (!response.ok) {
		throw new Error(
			`Failed to load reference audio for ${voicePack.name}: ${response.status}`,
		);
	}
	const referenceAudioBlob = await response.blob();
	if (referenceAudioBlob.size <= 0) {
		throw new Error(`Reference audio for ${voicePack.name} is empty.`);
	}
	return new File([referenceAudioBlob], voicePack.referenceAudioFileName, {
		type: voicePack.referenceAudioMimeType,
	});
}

async function generateRunningHubClonedSpeechFromText({
	text,
	voicePack,
}: {
	text: string;
	voicePack: VoicePack;
}): Promise<TtsResult> {
	const referenceAudioFile = await fetchVoiceReferenceAudio({ voicePack });
	const generatedVoice = await useGeneratedVoicesStore
		.getState()
		.cloneVoiceFromReference({
			text,
			referenceAudioFile,
			name: voicePack.name,
			apiKeySource: "runtime",
		});
	const buffer = await decodeAudioBlob({ blob: generatedVoice.audioBlob });

	return {
		duration: buffer.duration,
		buffer,
		blob: generatedVoice.audioBlob,
		provider: "runninghub-voice-clone",
		providerTaskId: generatedVoice.voice.taskId,
	};
}

async function generateVolcengineClonedSpeechFromText({
	text,
	voiceType,
}: {
	text: string;
	voiceType?: string;
}): Promise<TtsResult> {
	if (!voiceType?.trim()) {
		throw new Error("Volcengine voice_type is required");
	}
	const response = await fetch("/api/tts/generate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			provider: "volcengine-voice-clone",
			voiceType: voiceType.trim(),
			text,
		}),
	});

	if (!response.ok) {
		const error = await response.json().catch(() => null);
		throw new Error(error?.error ?? `TTS request failed: ${response.status}`);
	}

	const { audio, provider, providerTaskId } = (await response.json()) as {
		audio: string;
		provider?: SpokenScriptData["provider"];
		providerTaskId?: string;
	};
	const arrayBuffer = base64ToArrayBuffer({ base64: audio });
	const blob = new Blob([arrayBuffer], { type: "audio/mpeg" });
	const buffer = await decodeAudioBlob({ blob });

	return {
		duration: buffer.duration,
		buffer,
		blob,
		provider,
		providerTaskId,
	};
}

export async function generateSpeechFromText({
	text,
	voice,
	volcengineVoiceType,
}: {
	text: string;
	voice?: string;
	volcengineVoiceType?: string;
}): Promise<TtsResult> {
	const voicePack = resolveVoicePack({ voice });
	if (voicePack.provider === "legacy-tts") {
		return generateLegacySpeechFromText({ text });
	}
	if (voicePack.provider === "runninghub-voice-clone") {
		return generateRunningHubClonedSpeechFromText({ text, voicePack });
	}
	if (voicePack.provider === "volcengine-voice-clone") {
		return generateVolcengineClonedSpeechFromText({
			text,
			voiceType: volcengineVoiceType,
		});
	}
	throw new Error(`Unsupported TTS voice provider: ${voicePack.provider}`);
}

function findAvailableAudioTrack({
	editor,
	startTime,
	endTime,
}: {
	editor: EditorCore;
	startTime: number;
	endTime: number;
}): string {
	const audioTracks = editor.timeline
		.getTracks()
		.filter((t) => t.type === "audio");

	const available = audioTracks.find(
		(track) =>
			!wouldElementOverlap({
				elements: track.elements,
				startTime,
				endTime,
			}),
	);

	if (available) {
		return available.id;
	}

	return editor.timeline.addTrack({ type: "audio" });
}

export async function generateAndInsertSpeech({
	editor,
	text,
	startTime,
	voice,
	volcengineVoiceType,
	captionLines,
	protectedTerms,
}: {
	editor: EditorCore;
	text: string;
	startTime: number;
	voice?: string;
	volcengineVoiceType?: string;
	captionLines?: string[];
	protectedTerms?: string[];
}): Promise<{ duration: number }> {
	const spokenScript = buildTtsSpokenScript({
		text,
		captionLines,
		protectedTerms,
	});
	const result = await generateSpeechFromText({
		text: spokenScript.text,
		voice,
		volcengineVoiceType,
	});
	const assetSpokenScript = buildTtsSpokenScript({
		text: spokenScript.text,
		captionLines: spokenScript.captions,
		protectedTerms: spokenScript.protectedTerms,
		provider: result.provider,
		providerTaskId: result.providerTaskId,
	});

	const name = `TTS: ${spokenScript.text.slice(0, 30)}`;
	const file = new File([result.blob], `${name}.mp3`, {
		type: "audio/mpeg",
	});
	const url = URL.createObjectURL(result.blob);
	const projectId = editor.project.getActive().metadata.id;

	const mediaId = await editor.media.addMediaAsset({
		projectId,
		asset: {
			name,
			type: "audio",
			file,
			url,
			duration: result.duration,
			ephemeral: true,
			spokenScript: assetSpokenScript,
		},
	});

	const audioElement = buildUploadAudioElement({
		mediaId,
		name,
		duration: result.duration,
		startTime,
		buffer: result.buffer,
	});

	const trackId = findAvailableAudioTrack({
		editor,
		startTime,
		endTime: startTime + result.duration,
	});

	editor.timeline.insertElement({
		placement: { mode: "explicit", trackId },
		element: audioElement,
	});

	return { duration: result.duration };
}
