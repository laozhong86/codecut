export interface GeneratedVoice {
	id: string;
	name: string;
	text: string;
	emotionPrompt: string;
	provider: string;
	taskId: string;
	audioBlobId: string;
	mimeType: string;
	duration?: number;
	createdAt: string;
}

export interface GeneratedVoicesData {
	voices: GeneratedVoice[];
	lastModified: string;
}

export interface GeneratedVoiceAudioData {
	blob: Blob;
}
