"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { transcriptionService } from "@/services/transcription/service";
import { buildCaptionChunks } from "@/lib/transcription/caption";
import {
	TRANSCRIPTION_MODELS,
	TRANSCRIPTION_LANGUAGES,
	DEFAULT_TRANSCRIPTION_MODEL,
	DEFAULT_WORDS_PER_CAPTION,
} from "@/constants/transcription-constants";
import type {
	TranscriptionResult,
	TranscriptionProgress,
	TranscriptionModelId,
	TranscriptionLanguage,
	TranscriptionChunk,
	CaptionChunk,
} from "@/types/transcription";

type TranslateFn = (
	key: string,
	options?: Record<string, unknown>,
) => string;

function encodeFloat32ToWav({
	samples,
	sampleRate,
}: {
	samples: Float32Array;
	sampleRate: number;
}): Blob {
	const numChannels = 1;
	const bitsPerSample = 16;
	const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
	const blockAlign = (numChannels * bitsPerSample) / 8;
	const dataSize = samples.length * blockAlign;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	const writeString = ({ offset, str }: { offset: number; str: string }) => {
		for (let i = 0; i < str.length; i++) {
			view.setUint8(offset + i, str.charCodeAt(i));
		}
	};

	writeString({ offset: 0, str: "RIFF" });
	view.setUint32(4, 36 + dataSize, true);
	writeString({ offset: 8, str: "WAVE" });
	writeString({ offset: 12, str: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, byteRate, true);
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitsPerSample, true);
	writeString({ offset: 36, str: "data" });
	view.setUint32(40, dataSize, true);

	for (let i = 0; i < samples.length; i++) {
		const clamped = Math.max(-1, Math.min(1, samples[i]));
		const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
		view.setInt16(44 + i * 2, int16, true);
	}

	return new Blob([buffer], { type: "audio/wav" });
}

function formatTimestamp({ seconds }: { seconds: number }): string {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = Math.floor(seconds % 60);
	const ms = Math.round((seconds % 1) * 1000);

	return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function getStatusLabel({
	status,
	t,
}: {
	status: TranscriptionProgress["status"];
	t: TranslateFn;
}): string {
	const labels: Record<TranscriptionProgress["status"], string> = {
		idle: t("Idle"),
		"loading-model": t("Loading Model"),
		transcribing: t("Transcribing"),
		complete: t("Complete"),
		error: t("Error"),
	};
	return labels[status];
}

function getStatusVariant({
	status,
}: {
	status: TranscriptionProgress["status"];
}): "default" | "secondary" | "destructive" | "outline" {
	const variants: Record<
		TranscriptionProgress["status"],
		"default" | "secondary" | "destructive" | "outline"
	> = {
		idle: "outline",
		"loading-model": "secondary",
		transcribing: "default",
		complete: "default",
		error: "destructive",
	};
	return variants[status];
}

function formatRecordingDuration({ seconds }: { seconds: number }): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

interface PreprocessedAudio {
	samples: Float32Array;
	sampleRate: number;
}

export function TranscriptionPlayground() {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordedChunksRef = useRef<Blob[]>([]);
	const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const preprocessedAudioRef = useRef<HTMLAudioElement>(null);
	const activeSegmentRef = useRef<HTMLTableRowElement>(null);
	const activeCaptionRef = useRef<HTMLTableRowElement>(null);

	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [modelId, setModelId] = useState<TranscriptionModelId>(
		DEFAULT_TRANSCRIPTION_MODEL,
	);
	const [language, setLanguage] = useState<TranscriptionLanguage>("auto");
	const [wordsPerChunk, setWordsPerChunk] = useState(DEFAULT_WORDS_PER_CAPTION);

	const [progress, setProgress] = useState<TranscriptionProgress>({
		status: "idle",
		progress: 0,
	});
	const [result, setResult] = useState<TranscriptionResult | null>(null);
	const [captionChunks, setCaptionChunks] = useState<CaptionChunk[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [elapsedMs, setElapsedMs] = useState<number | null>(null);

	const [streamingChunks, setStreamingChunks] = useState<TranscriptionChunk[]>(
		[],
	);
	const [streamingTps, setStreamingTps] = useState<number>(0);

	const [isRecording, setIsRecording] = useState(false);
	const [isRequestingMic, setIsRequestingMic] = useState(false);
	const [recordingDuration, setRecordingDuration] = useState(0);
	const [micError, setMicError] = useState<string | null>(null);

	const [preprocessedAudio, setPreprocessedAudio] =
		useState<PreprocessedAudio | null>(null);
	const [isPreprocessing, setIsPreprocessing] = useState(false);
	const [currentPlayTime, setCurrentPlayTime] = useState(0);

	const audioUrl = useMemo(() => {
		if (!selectedFile) return null;
		return URL.createObjectURL(selectedFile);
	}, [selectedFile]);

	const preprocessedUrl = useMemo(() => {
		if (!preprocessedAudio) return null;
		const wavBlob = encodeFloat32ToWav({
			samples: preprocessedAudio.samples,
			sampleRate: preprocessedAudio.sampleRate,
		});
		return URL.createObjectURL(wavBlob);
	}, [preprocessedAudio]);

	const modelLabels = useMemo(
		() => ({
			"whisper-tiny": {
				name: t("Tiny"),
				description: t("Fastest, lower accuracy (120MB)"),
			},
			"whisper-base": {
				name: t("Base"),
				description: t("Fast with decent accuracy (206MB)"),
			},
			"whisper-small": {
				name: t("Small"),
				description: t("Good balance of speed and accuracy (586MB)"),
			},
			"whisper-large-v3-turbo": {
				name: t("Large v3 Turbo"),
				description: t("Best accuracy, requires WebGPU (1604MB)"),
			},
			"distil-small.en": {
				name: t("Distil Small (English)"),
				description: t("Optimized for English only (538MB)"),
			},
		}),
		[t],
	);

	useEffect(() => {
		return () => {
			if (audioUrl) {
				URL.revokeObjectURL(audioUrl);
			}
		};
	}, [audioUrl]);

	useEffect(() => {
		return () => {
			if (preprocessedUrl) {
				URL.revokeObjectURL(preprocessedUrl);
			}
		};
	}, [preprocessedUrl]);

	useEffect(() => {
		return () => {
			if (mediaRecorderRef.current?.state === "recording") {
				mediaRecorderRef.current.stop();
			}
			if (recordingTimerRef.current) {
				clearInterval(recordingTimerRef.current);
			}
		};
	}, []);

	const clearResults = useCallback(() => {
		setResult(null);
		setCaptionChunks([]);
		setError(null);
		setElapsedMs(null);
		setStreamingChunks([]);
		setStreamingTps(0);
		setProgress({ status: "idle", progress: 0 });
		setPreprocessedAudio(null);
		setCurrentPlayTime(0);
	}, []);

	const handleFileChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;
			setSelectedFile(file);
			clearResults();
		},
		[clearResults],
	);

	const handleStartRecording = useCallback(async () => {
		if (!navigator.mediaDevices?.getUserMedia) {
			setMicError(
				t(
					"Microphone API not available. Ensure you are using HTTPS or localhost.",
				),
			);
			return;
		}

		setMicError(null);
		setIsRequestingMic(true);

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
			});

			setIsRequestingMic(false);
			recordedChunksRef.current = [];
			setRecordingDuration(0);

			const mediaRecorder = new MediaRecorder(stream);
			mediaRecorderRef.current = mediaRecorder;

			mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					recordedChunksRef.current.push(event.data);
				}
			};

			mediaRecorder.onstop = () => {
				for (const track of stream.getTracks()) {
					track.stop();
				}
				if (recordingTimerRef.current) {
					clearInterval(recordingTimerRef.current);
					recordingTimerRef.current = null;
				}

				const blob = new Blob(recordedChunksRef.current, {
					type: "audio/webm",
				});
				const file = new File([blob], "recording.webm", {
					type: "audio/webm",
				});
				setSelectedFile(file);
				clearResults();
				setIsRecording(false);
			};

			mediaRecorder.start(100);
			setIsRecording(true);

			const startedAt = Date.now();
			recordingTimerRef.current = setInterval(() => {
				setRecordingDuration(Math.floor((Date.now() - startedAt) / 1000));
			}, 500);
		} catch (caughtError) {
			setIsRequestingMic(false);
			const rawMessage =
				caughtError instanceof Error
					? caughtError.message
					: t("Failed to access microphone");

			const isPermissionDenied =
				rawMessage.includes("Permission denied") ||
				rawMessage.includes("NotAllowedError") ||
				(caughtError instanceof DOMException &&
					caughtError.name === "NotAllowedError");

			const message = isPermissionDenied
				? t(
						"Microphone permission denied. Click the lock/site-settings icon in the address bar, allow microphone access, then reload the page.",
					)
				: rawMessage;

			setMicError(message);
		}
	}, [clearResults, t]);

	const handleStopRecording = useCallback(() => {
		if (mediaRecorderRef.current?.state === "recording") {
			mediaRecorderRef.current.stop();
		}
	}, []);

	const handlePreprocess = useCallback(async () => {
		if (!selectedFile) return;

		setIsPreprocessing(true);
		setError(null);

		try {
			const blob = new Blob([selectedFile], { type: selectedFile.type });
			const { samples, sampleRate } = await decodeAudioToFloat32({
				audioBlob: blob,
				targetSampleRate: 16000,
			});
			setPreprocessedAudio({ samples, sampleRate });
		} catch (caughtError) {
			const message =
				caughtError instanceof Error
					? caughtError.message
					: t("Failed to preprocess audio");
			setError(message);
		} finally {
			setIsPreprocessing(false);
		}
	}, [selectedFile, t]);

	const handleTranscribe = useCallback(async () => {
		if (!selectedFile) return;

		setError(null);
		setResult(null);
		setCaptionChunks([]);
		setElapsedMs(null);
		setStreamingChunks([]);
		setStreamingTps(0);

		const startTime = performance.now();

		try {
			setProgress({ status: "loading-model", progress: 0 });

			let samples: Float32Array;
			if (preprocessedAudio) {
				samples = preprocessedAudio.samples;
			} else {
				const blob = new Blob([selectedFile], { type: selectedFile.type });
				const decoded = await decodeAudioToFloat32({
					audioBlob: blob,
					targetSampleRate: 16000,
				});
				samples = decoded.samples;
				setPreprocessedAudio({
					samples: decoded.samples,
					sampleRate: decoded.sampleRate,
				});
			}

			// copy before passing to worker — postMessage transfers the buffer
			const samplesCopy = new Float32Array(samples);

			const transcriptionResult = await transcriptionService.transcribe({
				audioData: samplesCopy,
				language,
				modelId,
				onProgress: setProgress,
				onStreamingUpdate: ({ chunks, tps }) => {
					setStreamingChunks(chunks);
					setStreamingTps(tps);
				},
			});

			const elapsed = performance.now() - startTime;
			setElapsedMs(elapsed);
			setResult(transcriptionResult);
			setProgress({ status: "complete", progress: 100 });

			const chunks = buildCaptionChunks({
				segments: transcriptionResult.segments,
				wordsPerChunk,
			});
			setCaptionChunks(chunks);
		} catch (caughtError) {
			const elapsed = performance.now() - startTime;
			setElapsedMs(elapsed);
			const message =
				caughtError instanceof Error
					? caughtError.message
					: t("Unknown error occurred");
			setError(message);
			setProgress({ status: "error", progress: 0 });
		}
	}, [selectedFile, modelId, language, wordsPerChunk, preprocessedAudio, t]);

	const handleCancel = useCallback(() => {
		transcriptionService.cancel();
	}, []);

	const handleRegenerateCaptions = useCallback(() => {
		if (!result) return;
		const chunks = buildCaptionChunks({
			segments: result.segments,
			wordsPerChunk,
		});
		setCaptionChunks(chunks);
	}, [result, wordsPerChunk]);

	const isProcessing =
		progress.status === "loading-model" || progress.status === "transcribing";

	const streamingText = streamingChunks
		.map((chunk) => chunk.text)
		.join("")
		.trim();

	const seekAndPlay = useCallback(({ time }: { time: number }) => {
		const audio = preprocessedAudioRef.current;
		if (!audio) return;
		audio.currentTime = time;
		audio.play().catch(() => {});
	}, []);

	const handleTimeUpdate = useCallback(() => {
		const audio = preprocessedAudioRef.current;
		if (audio) {
			setCurrentPlayTime(audio.currentTime);
		}
	}, []);

	const activeSegmentIndex = useMemo(() => {
		if (!result) return -1;
		return result.segments.findIndex(
			(segment) =>
				currentPlayTime >= segment.start && currentPlayTime < segment.end,
		);
	}, [result, currentPlayTime]);

	const activeCaptionIndex = useMemo(() => {
		if (captionChunks.length === 0) return -1;
		return captionChunks.findIndex(
			(chunk) =>
				currentPlayTime >= chunk.startTime &&
				currentPlayTime < chunk.startTime + chunk.duration,
		);
	}, [captionChunks, currentPlayTime]);

	const prevSegmentIndexRef = useRef(-1);
	if (activeSegmentIndex !== prevSegmentIndexRef.current) {
		prevSegmentIndexRef.current = activeSegmentIndex;
		activeSegmentRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
		});
	}

	const prevCaptionIndexRef = useRef(-1);
	if (activeCaptionIndex !== prevCaptionIndexRef.current) {
		prevCaptionIndexRef.current = activeCaptionIndex;
		activeCaptionRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<Card>
				<CardHeader>
					<CardTitle>{t("Transcription Debugger")}</CardTitle>
					<CardDescription>
						{t(
							"Upload an audio/video file, configure the model, and inspect transcription results with full segment detail. Uses WebGPU acceleration with streaming output.",
						)}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
						<div className="flex flex-col gap-2">
							<Label htmlFor="audio-file">{t("Audio / Video File")}</Label>
							<Input
								id="audio-file"
								ref={fileInputRef}
								type="file"
								accept="audio/*,video/*"
								onChange={handleFileChange}
								disabled={isProcessing || isRecording}
							/>
							<div className="flex flex-col gap-1.5">
								<div className="flex items-center gap-2">
									{isRecording ? (
										<Button
											type="button"
											variant="destructive"
											size="sm"
											onClick={handleStopRecording}
										>
											<span className="mr-1.5 inline-block size-2 animate-pulse rounded-full bg-white" />
											{t("Stop {{duration}}", {
												duration: formatRecordingDuration({
													seconds: recordingDuration,
												}),
											})}
										</Button>
									) : (
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleStartRecording}
											disabled={isProcessing || isRequestingMic}
										>
											{isRequestingMic
												? t("Requesting mic...")
												: t("Record Mic")}
										</Button>
									)}
								</div>
								{micError && (
									<p className="text-destructive text-xs">{micError}</p>
								)}
							</div>
							{selectedFile && !isRecording && (
								<p className="text-muted-foreground text-xs">
									{t("{{name}} ({{size}} MB)", {
										name: selectedFile.name,
										size: (selectedFile.size / 1024 / 1024).toFixed(2),
									})}
								</p>
							)}
						</div>

						<div className="flex flex-col gap-2">
							<Label>{t("Model")}</Label>
							<Select
								value={modelId}
								onValueChange={(value) =>
									setModelId(value as TranscriptionModelId)
								}
								disabled={isProcessing}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TRANSCRIPTION_MODELS.map((model) => (
										<SelectItem key={model.id} value={model.id}>
											{modelLabels[model.id].name} —{" "}
											{modelLabels[model.id].description}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-2">
							<Label>{t("Language")}</Label>
							<Select
								value={language}
								onValueChange={(value) =>
									setLanguage(value as TranscriptionLanguage)
								}
								disabled={isProcessing}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">{t("Auto Detect")}</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((lang) => (
										<SelectItem key={lang.code} value={lang.code}>
											{lang.name} ({lang.code})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-2">
							<Label htmlFor="words-per-chunk">
								{t("Words per Caption")}
							</Label>
							<Input
								id="words-per-chunk"
								type="number"
								min={1}
								max={20}
								value={wordsPerChunk}
								onChange={(event) =>
									setWordsPerChunk(
										Math.max(1, Number.parseInt(event.target.value, 10) || 1),
									)
								}
								disabled={isProcessing}
							/>
						</div>
					</div>

					{selectedFile && !isRecording && (
						<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
							<div className="flex flex-col gap-2">
								<Label className="text-muted-foreground text-xs font-medium">
									{t("Original Audio")}
								</Label>
								{audioUrl && (
									<audio controls src={audioUrl} className="h-10 w-full">
										<track kind="captions" />
									</audio>
								)}
							</div>
							<div className="flex flex-col gap-2">
								<div className="flex items-center gap-2">
									<Label className="text-muted-foreground text-xs font-medium">
										{t("Preprocessed (16kHz mono)")}
									</Label>
									{preprocessedAudio && (
										<Badge variant="outline" className="text-xs">
											{t(
												"{{sampleRate}}Hz · {{duration}}s · {{sampleCount}} samples",
												{
													sampleRate: preprocessedAudio.sampleRate,
													duration: (
														preprocessedAudio.samples.length /
														preprocessedAudio.sampleRate
													).toFixed(2),
													sampleCount:
														preprocessedAudio.samples.length.toLocaleString(),
												},
											)}
										</Badge>
									)}
								</div>
								{preprocessedUrl ? (
									<audio
										ref={preprocessedAudioRef}
										controls
										src={preprocessedUrl}
										className="h-10 w-full"
										onTimeUpdate={handleTimeUpdate}
									>
										<track kind="captions" />
									</audio>
								) : (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="w-fit"
										onClick={handlePreprocess}
										disabled={isPreprocessing || isProcessing}
									>
										{isPreprocessing
											? t("Preprocessing...")
											: t("Preprocess Audio")}
									</Button>
								)}
							</div>
						</div>
					)}

					<div className="mt-4 flex items-center gap-3">
						<Button
							type="button"
							onClick={handleTranscribe}
							disabled={!selectedFile || isProcessing || isRecording}
						>
							{isProcessing ? t("Transcribing...") : t("Start Transcription")}
						</Button>

						{isProcessing && (
							<Button type="button" variant="outline" onClick={handleCancel}>
								{t("Cancel")}
							</Button>
						)}
					</div>
				</CardContent>
			</Card>

			{progress.status !== "idle" && (
				<Card>
					<CardContent className="pt-6">
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Badge
										variant={getStatusVariant({ status: progress.status })}
									>
										{getStatusLabel({ status: progress.status, t })}
									</Badge>
									{progress.message && (
										<span className="text-muted-foreground text-sm">
											{progress.message}
										</span>
									)}
									{streamingTps > 0 && (
										<Badge variant="outline">
											{t("{{rate}} tokens/s", {
												rate: streamingTps.toFixed(1),
											})}
										</Badge>
									)}
								</div>
								{elapsedMs !== null && (
									<span className="text-muted-foreground text-sm">
										{t("{{seconds}}s", {
											seconds: (elapsedMs / 1000).toFixed(2),
										})}
									</span>
								)}
							</div>
							{progress.status === "loading-model" && (
								<Progress value={progress.progress} />
							)}
						</div>
					</CardContent>
				</Card>
			)}

			{error && (
				<Card className="border-destructive">
					<CardContent className="pt-6">
						<p className="text-destructive text-sm">{error}</p>
					</CardContent>
				</Card>
			)}

			{streamingChunks.length > 0 && !result && (
				<Card>
					<CardHeader>
						<CardTitle>{t("Live Transcription")}</CardTitle>
						<CardDescription>
							{t("{{count}} chunks", {
								count: streamingChunks.length,
							})}{" "}
							—{" "}
							{streamingTps > 0
								? t("{{rate}} tokens/s", {
										rate: streamingTps.toFixed(1),
									})
								: t("starting...")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="bg-muted rounded-md p-4">
							<p className="whitespace-pre-wrap text-sm">
								{streamingText || "..."}
							</p>
						</div>
						<div className="mt-4 max-h-[300px] overflow-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-12">#</TableHead>
										<TableHead className="w-36">{t("Start")}</TableHead>
										<TableHead className="w-36">{t("End")}</TableHead>
										<TableHead className="w-20">{t("Status")}</TableHead>
										<TableHead>{t("Text")}</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{streamingChunks.map((chunk, index) => (
										<TableRow
											key={`streaming-${chunk.timestamp[0]}-${chunk.timestamp[1] ?? "open"}-${chunk.text}`}
										>
											<TableCell className="text-muted-foreground font-mono text-xs">
												{index + 1}
											</TableCell>
											<TableCell className="font-mono text-xs">
												{formatTimestamp({ seconds: chunk.timestamp[0] })}
											</TableCell>
											<TableCell className="font-mono text-xs">
												{chunk.timestamp[1] !== null
													? formatTimestamp({ seconds: chunk.timestamp[1] })
													: "—"}
											</TableCell>
											<TableCell>
												<Badge
													variant={chunk.finalised ? "default" : "secondary"}
												>
													{chunk.finalised ? t("Done") : t("Live")}
												</Badge>
											</TableCell>
											<TableCell>{chunk.text}</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			)}

			{result && (
				<Card>
					<CardHeader>
						<CardTitle>{t("Results")}</CardTitle>
						<CardDescription>
							{t("{{count}} segments — Language: {{language}}", {
								count: result.segments.length,
								language: result.language,
							})}
							{result.tps
								? ` — ${t("{{rate}} tokens/s", {
										rate: result.tps.toFixed(1),
									})}`
								: ""}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Tabs defaultValue="raw">
							<TabsList>
								<TabsTrigger value="raw">{t("Raw Result")}</TabsTrigger>
								<TabsTrigger value="segments">
									{t("Segments ({{count}})", {
										count: result.segments.length,
									})}
								</TabsTrigger>
								<TabsTrigger value="captions">
									{t("Caption Chunks ({{count}})", {
										count: captionChunks.length,
									})}
								</TabsTrigger>
							</TabsList>

							<TabsContent value="raw" className="mt-4">
								<div className="flex flex-col gap-4">
									<div className="flex items-center gap-2">
										<Badge variant="outline">
											{t("Language: {{language}}", {
												language: result.language,
											})}
										</Badge>
										<Badge variant="outline">
											{t("Segments: {{count}}", {
												count: result.segments.length,
											})}
										</Badge>
										{result.tps && (
											<Badge variant="outline">
												{t("{{rate}} tokens/s", {
													rate: result.tps.toFixed(1),
												})}
											</Badge>
										)}
									</div>

									<div className="bg-muted rounded-md p-4">
										<pre className="whitespace-pre-wrap text-sm">
											{result.text || t("(empty)")}
										</pre>
									</div>
								</div>
							</TabsContent>

							<TabsContent value="segments" className="mt-4">
								<div className="max-h-[500px] overflow-auto">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="w-12">#</TableHead>
												<TableHead className="w-36">{t("Start")}</TableHead>
												<TableHead className="w-36">{t("End")}</TableHead>
												<TableHead className="w-28">
													{t("Duration")}
												</TableHead>
												<TableHead>{t("Text")}</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{result.segments.map((segment, index) => {
												const isActive = index === activeSegmentIndex;
												return (
													<TableRow
														key={`${segment.start}-${segment.end}`}
														ref={isActive ? activeSegmentRef : undefined}
														className={`cursor-pointer ${isActive ? "bg-primary/10" : ""}`}
														onClick={() => seekAndPlay({ time: segment.start })}
														onKeyDown={(event) => {
															if (event.key === "Enter" || event.key === " ") {
																seekAndPlay({ time: segment.start });
															}
														}}
													>
														<TableCell className="text-muted-foreground font-mono text-xs">
															{index + 1}
														</TableCell>
														<TableCell className="font-mono text-xs">
															{formatTimestamp({ seconds: segment.start })}
														</TableCell>
														<TableCell className="font-mono text-xs">
															{formatTimestamp({ seconds: segment.end })}
														</TableCell>
														<TableCell className="text-muted-foreground font-mono text-xs">
															{t("{{seconds}}s", {
																seconds: (
																	segment.end - segment.start
																).toFixed(3),
															})}
														</TableCell>
														<TableCell>{segment.text}</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								</div>
							</TabsContent>

							<TabsContent value="captions" className="mt-4">
								<div className="flex flex-col gap-4">
									<div className="flex items-center gap-3">
										<Label htmlFor="caption-words-per-chunk">
											{t("Words per Chunk")}
										</Label>
										<Input
											id="caption-words-per-chunk"
											type="number"
											className="w-24"
											min={1}
											max={20}
											value={wordsPerChunk}
											onChange={(event) =>
												setWordsPerChunk(
													Math.max(
														1,
														Number.parseInt(event.target.value, 10) || 1,
													),
												)
											}
										/>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleRegenerateCaptions}
										>
											{t("Regenerate")}
										</Button>
									</div>

									<div className="max-h-[500px] overflow-auto">
										<Table>
											<TableHeader>
											<TableRow>
												<TableHead className="w-12">#</TableHead>
												<TableHead className="w-36">{t("Start")}</TableHead>
												<TableHead className="w-28">
													{t("Duration")}
												</TableHead>
												<TableHead className="w-36">{t("End")}</TableHead>
												<TableHead>{t("Text")}</TableHead>
											</TableRow>
										</TableHeader>
											<TableBody>
												{captionChunks.map((chunk, index) => {
													const isActive = index === activeCaptionIndex;
													return (
														<TableRow
															key={`${chunk.startTime}-${chunk.duration}`}
															ref={isActive ? activeCaptionRef : undefined}
															className={`cursor-pointer ${isActive ? "bg-primary/10" : ""}`}
															onClick={() =>
																seekAndPlay({ time: chunk.startTime })
															}
															onKeyDown={(event) => {
																if (
																	event.key === "Enter" ||
																	event.key === " "
																) {
																	seekAndPlay({ time: chunk.startTime });
																}
															}}
														>
															<TableCell className="text-muted-foreground font-mono text-xs">
																{index + 1}
															</TableCell>
															<TableCell className="font-mono text-xs">
																{formatTimestamp({
																	seconds: chunk.startTime,
																})}
															</TableCell>
															<TableCell className="text-muted-foreground font-mono text-xs">
																{t("{{seconds}}s", {
																	seconds: chunk.duration.toFixed(3),
																})}
															</TableCell>
															<TableCell className="font-mono text-xs">
																{formatTimestamp({
																	seconds: chunk.startTime + chunk.duration,
																})}
															</TableCell>
															<TableCell>{chunk.text}</TableCell>
														</TableRow>
													);
												})}
											</TableBody>
										</Table>
									</div>
								</div>
							</TabsContent>
						</Tabs>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
