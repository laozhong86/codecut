export interface ImageGenerationRequest {
	prompt: string;
	aspectRatio?: string;
	referenceImageUrl?: string;
}

export interface ImageGenerationResult {
	url: string;
}

export interface AIImageProvider {
	id: string;
	name: string;
	description: string;
	useProxy?: boolean;
	generateImage(params: {
		request: ImageGenerationRequest;
		apiKey: string;
	}): Promise<ImageGenerationResult[]>;
}

export interface VideoGenerationRequest {
	prompt: string;
	duration?: number;
	aspectRatio?: string;
	resolution?: string;
	referenceImageUrl?: string;
}

export type VideoTaskStatus =
	| "pending"
	| "running"
	| "succeeded"
	| "failed"
	| "cancelled";

export interface VideoTaskResult {
	taskId: string;
	status: VideoTaskStatus;
	videoUrl?: string;
	error?: string;
}

export interface AIVideoProvider {
	id: string;
	name: string;
	description: string;
	useProxy?: boolean;
	submitVideoTask(params: {
		request: VideoGenerationRequest;
		apiKey: string;
	}): Promise<VideoTaskResult>;
	getVideoTask(params: {
		taskId: string;
		apiKey: string;
	}): Promise<VideoTaskResult>;
}

export interface DigitalHumanGenerationRequest {
	imageMediaId: string;
	audioMediaId: string;
	scriptText: string;
	motionPrompt: string;
	width: number;
	height: number;
	fps: number;
}

export type DigitalHumanTaskStatus = VideoTaskStatus;

export interface DigitalHumanTaskResult {
	taskId: string;
	status: DigitalHumanTaskStatus;
	videoUrl?: string;
	error?: string;
}

export interface AIDigitalHumanProvider {
	id: string;
	name: string;
	description: string;
	submitDigitalHumanTask(params: {
		request: DigitalHumanGenerationRequest;
		apiKey: string;
		imageFile: File;
		audioFile: File;
	}): Promise<DigitalHumanTaskResult>;
	getDigitalHumanTask(params: {
		taskId: string;
		apiKey: string;
	}): Promise<DigitalHumanTaskResult>;
	downloadDigitalHumanResult(params: {
		videoUrl: string;
	}): Promise<Blob>;
}

export interface VoiceDesignRequest {
	text: string;
	emotionPrompt: string;
}

export type VoiceDesignTaskStatus = VideoTaskStatus;

export interface VoiceDesignTaskResult {
	taskId: string;
	status: VoiceDesignTaskStatus;
	audioUrl?: string;
	error?: string;
}

export interface AIVoiceDesignProvider {
	id: string;
	name: string;
	description: string;
	submitVoiceDesignTask(params: {
		request: VoiceDesignRequest;
		apiKey: string;
	}): Promise<VoiceDesignTaskResult>;
	getVoiceDesignTask(params: {
		taskId: string;
		apiKey: string;
	}): Promise<VoiceDesignTaskResult>;
	downloadVoiceDesignResult(params: { audioUrl: string }): Promise<Blob>;
}

export interface VoiceCloneRequest {
	text: string;
}

export type VoiceCloneTaskStatus = VideoTaskStatus;

export interface VoiceCloneTaskResult {
	taskId: string;
	status: VoiceCloneTaskStatus;
	audioUrl?: string;
	error?: string;
}

export interface AIVoiceCloneProvider {
	id: string;
	name: string;
	description: string;
	submitVoiceCloneTask(params: {
		request: VoiceCloneRequest;
		apiKey: string;
		referenceAudioFile: File;
	}): Promise<VoiceCloneTaskResult>;
	getVoiceCloneTask(params: {
		taskId: string;
		apiKey: string;
	}): Promise<VoiceCloneTaskResult>;
	downloadVoiceCloneResult(params: { audioUrl: string }): Promise<Blob>;
}
