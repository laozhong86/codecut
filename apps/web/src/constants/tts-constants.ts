export interface VoicePack {
	id: string;
	name: string;
	provider: "legacy-tts" | "runninghub-voice-clone";
	referenceAudioUrl?: string;
	referenceAudioFileName?: string;
	referenceAudioMimeType?: string;
}

export const VOICE_PACKS: VoicePack[] = [
	{ id: "default", name: "Default", provider: "legacy-tts" },
	{
		id: "podcast-female",
		name: "播客女",
		provider: "runninghub-voice-clone",
		referenceAudioUrl: "/voices/podcast-female.mp3",
		referenceAudioFileName: "podcast-female.mp3",
		referenceAudioMimeType: "audio/mpeg",
	},
	{
		id: "podcast-male",
		name: "播客男",
		provider: "runninghub-voice-clone",
		referenceAudioUrl: "/voices/podcast-male.mp3",
		referenceAudioFileName: "podcast-male.mp3",
		referenceAudioMimeType: "audio/mpeg",
	},
];

export const DEFAULT_VOICE_PACK = "default";

export function resolveVoicePack({ voice }: { voice?: string }): VoicePack {
	const voiceId = voice ?? DEFAULT_VOICE_PACK;
	const voicePack = VOICE_PACKS.find((candidate) => candidate.id === voiceId);
	if (!voicePack) {
		throw new Error(`Unknown TTS voice: ${voiceId}`);
	}
	return voicePack;
}
