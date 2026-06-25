import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PanelBaseView as BaseView } from "@/components/editor/panels/panel-base-view";
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	TRANSCRIPTION_LANGUAGES,
	TRANSCRIPTION_MODELS,
} from "@/constants/transcription-constants";
import { useEditor } from "@/hooks/use-editor";
import { useLocalStorage } from "@/hooks/storage/use-local-storage";
import { resolveCaptionStylePreset } from "@/lib/agent-bridge/edit-plan/text-presets";
import {
	EditPlanCaptionPositionSchema,
	EditPlanCaptionStylePresetSchema,
	EditPlanTextMotionPresetSchema,
	type EditPlan,
	type EditPlanCaptionStyle,
} from "@/lib/agent-bridge/edit-plan/schema";
import { resolveTextMotionPreset } from "@/lib/agent-bridge/edit-plan/motion-presets";
import {
	buildCaptionDiagnosticsReport,
	type CaptionDiagnosticsReport,
} from "@/lib/caption-diagnostics/caption-diagnostics";
import { decodeAudioToFloat32 } from "@/lib/media/audio";
import { extractTimelineAudio } from "@/lib/media/mediabunny";
import {
	buildTextElement,
	buildUploadAudioElement,
	buildVideoElement,
} from "@/lib/timeline/element-utils";
import { transcriptionService } from "@/services/transcription/service";
import type { MediaAsset } from "@/types/assets";
import type {
	TranscriptionLanguage,
	TranscriptionModelId,
	TranscriptionProgress,
	TranscriptionResult,
} from "@/types/transcription";
import type {
	TimelineTrack,
	UploadAudioElement,
	VideoElement,
} from "@/types/timeline";

type CaptionStylePreset = EditPlanCaptionStyle["preset"];
type CaptionPosition = EditPlanCaptionStyle["position"];
type CaptionMotionPreset = NonNullable<EditPlanCaptionStyle["motionPreset"]>;
type CaptionMotionSelection = CaptionMotionPreset | "none";

const CAPTION_STYLE_OPTIONS: Array<{
	value: CaptionStylePreset;
	label: string;
}> = EditPlanCaptionStylePresetSchema.options.map((value) => ({
	value,
	label: value
		.split("-")
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" "),
}));

const CAPTION_POSITION_OPTIONS: Array<{ value: CaptionPosition }> =
	EditPlanCaptionPositionSchema.options.map((value) => ({ value }));

const CAPTION_MOTION_OPTIONS: Array<{
	value: CaptionMotionSelection;
}> = [
	{ value: "none" },
	...EditPlanTextMotionPresetSchema.options.map((value) => ({ value })),
];

function formatCaptionOptionLabel(value: string): string {
	return value
		.split("-")
		.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
		.join(" ");
}

function roundCaptionSeconds(value: number): number {
	return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function aspectRatioFromCanvas({
	width,
	height,
}: {
	width: number;
	height: number;
}): EditPlan["target"]["aspectRatio"] {
	if (width === height) return "1:1";
	return width < height ? "9:16" : "16:9";
}

async function transcribeMediaRangeWithPanelRuntime({
	mediaAsset,
	language,
	modelId,
	range,
	onProgress,
}: {
	mediaAsset: MediaAsset;
	language: TranscriptionLanguage;
	modelId: TranscriptionModelId;
	range: { start: number; end: number };
	onProgress: (progress: TranscriptionProgress) => void;
}): Promise<TranscriptionResult> {
	const duration = roundCaptionSeconds(range.end - range.start);
	if (duration <= 0) {
		throw new Error("Caption diagnostics range must have positive duration.");
	}

	const element =
		mediaAsset.type === "audio"
			? {
					...buildUploadAudioElement({
						mediaId: mediaAsset.id,
						name: mediaAsset.name,
						duration,
						startTime: 0,
					}),
					id: "caption-diagnostics-audio-range",
					trimStart: range.start,
					trimEnd: range.end,
				}
			: {
					...buildVideoElement({
						mediaId: mediaAsset.id,
						name: mediaAsset.name,
						duration,
						startTime: 0,
					}),
					id: "caption-diagnostics-video-range",
					trimStart: range.start,
					trimEnd: range.end,
				};
	const track: TimelineTrack =
		mediaAsset.type === "audio"
			? {
					id: "caption-diagnostics-audio-track",
					type: "audio",
					name: "Caption Diagnostics Audio",
					muted: false,
					elements: [element as UploadAudioElement],
				}
			: {
					id: "caption-diagnostics-video-track",
					type: "video",
					name: "Caption Diagnostics Video",
					isMain: true,
					muted: false,
					hidden: false,
					elements: [element as VideoElement],
				};
	const audioBlob = await extractTimelineAudio({
		tracks: [track],
		mediaAssets: [mediaAsset],
		totalDuration: duration,
	});
	const { samples } = await decodeAudioToFloat32({
		audioBlob,
		targetSampleRate: 16000,
	});
	return transcriptionService.transcribe({
		audioData: samples,
		language,
		modelId,
		onProgress,
	});
}

function formatRange(start: number, end: number): string {
	return `${roundCaptionSeconds(start)}s - ${roundCaptionSeconds(end)}s`;
}

function statusClasses(status: CaptionDiagnosticsReport["status"]): string {
	if (status === "ready") {
		return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
	}
	if (status === "warning") {
		return "border-amber-500/30 bg-amber-500/10 text-amber-700";
	}
	return "border-destructive/30 bg-destructive/10 text-destructive";
}

function DiagnosticSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2 border-t pt-4">
			<h3 className="text-sm font-medium">{title}</h3>
			{children}
		</section>
	);
}

export function Captions() {
	const { t } = useTranslation();
	const [selectedLanguage, setSelectedLanguage] =
		useLocalStorage<TranscriptionLanguage>({
			key: "editor-caption-language",
			defaultValue: "auto",
		});
	const [selectedModelId, setSelectedModelId] =
		useLocalStorage<TranscriptionModelId>({
			key: "editor-caption-model-id",
			defaultValue: DEFAULT_TRANSCRIPTION_MODEL,
		});
	const [selectedPreset, setSelectedPreset] =
		useLocalStorage<CaptionStylePreset>({
			key: "editor-caption-style-preset",
			defaultValue: "creator-clean",
		});
	const [selectedPosition, setSelectedPosition] =
		useLocalStorage<CaptionPosition>({
			key: "editor-caption-position",
			defaultValue: "lower-safe",
		});
	const [selectedMotionPreset, setSelectedMotionPreset] =
		useLocalStorage<CaptionMotionSelection>({
			key: "editor-caption-motion-preset",
			defaultValue: "none",
		});
	const [isProcessing, setIsProcessing] = useState(false);
	const [processingStep, setProcessingStep] = useState("");
	const [progressValue, setProgressValue] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [diagnostics, setDiagnostics] =
		useState<CaptionDiagnosticsReport | null>(null);
	const [diagnosticsSignature, setDiagnosticsSignature] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const editor = useEditor();

	const captionStyle = useMemo<EditPlanCaptionStyle>(
		() => ({
			preset: selectedPreset,
			position: selectedPosition,
			...(selectedMotionPreset === "none"
				? {}
				: { motionPreset: selectedMotionPreset }),
		}),
		[selectedMotionPreset, selectedPosition, selectedPreset],
	);
	const currentSignature = useMemo(
		() =>
			JSON.stringify({
				language: selectedLanguage,
				modelId: selectedModelId,
				captionStyle,
			}),
		[captionStyle, selectedLanguage, selectedModelId],
	);
	const canvasSize = editor.project.getActive().settings.canvasSize;
	const aspectRatio = aspectRatioFromCanvas(canvasSize);
	const resolvedCaptionStyle = useMemo(
		() => resolveCaptionStylePreset({ captionStyle, aspectRatio }),
		[aspectRatio, captionStyle],
	);
	const captionBaseTransform = resolvedCaptionStyle.transform ?? {
		scale: 1,
		position: { x: 0, y: 0 },
		rotate: 0,
	};
	const selectedModelDescription =
		TRANSCRIPTION_MODELS.find((model) => model.id === selectedModelId)
			?.description ?? "";
	const hasFreshDiagnostics =
		diagnostics !== null && diagnosticsSignature === currentSignature;
	const canGenerate =
		hasFreshDiagnostics &&
		diagnostics.status !== "blocked" &&
		!diagnostics.existingSubtitles.blocksGeneration &&
		diagnostics.candidateCaptions.length > 0;

	const handleProgress = (progress: TranscriptionProgress) => {
		setProgressValue(progress.progress);
		if (progress.status === "loading-model") {
			setProcessingStep(
				t("Loading model {{progress}}%", {
					progress: Math.round(progress.progress),
				}),
			);
			return;
		}
		if (progress.status === "transcribing") {
			setProcessingStep(
				t("Transcribing {{progress}}%", {
					progress: Math.round(progress.progress),
				}),
			);
		}
	};

	const handleRunDiagnostics = async () => {
		try {
			setIsProcessing(true);
			setError(null);
			setProgressValue(0);
			setProcessingStep(t("Preparing caption diagnostics..."));

			const tracks = editor.timeline.getTracks();
			const mediaAssets = editor.media.getAssets();
			const report = await buildCaptionDiagnosticsReport({
				tracks,
				mediaAssets,
				language: selectedLanguage,
				modelId: selectedModelId,
				captionStyle,
				aspectRatio,
				canvasSize,
				timelineDuration: editor.timeline.getTotalDuration(),
				transcribeMediaRange: async ({
					mediaAsset,
					language,
					modelId,
					range,
				}) => {
					const runtimeAsset = mediaAssets.find(
						(asset) => asset.id === mediaAsset.id,
					);
					if (!runtimeAsset) {
						throw new Error(`Media asset '${mediaAsset.id}' not found.`);
					}
					if (runtimeAsset.type !== "video" && runtimeAsset.type !== "audio") {
						throw new Error(
							`Media asset '${runtimeAsset.name}' is type '${runtimeAsset.type}', expected video or audio.`,
						);
					}
					setProcessingStep(
						t("Transcribing {{name}} {{range}}", {
							name: runtimeAsset.name,
							range: formatRange(range.start, range.end),
						}),
					);
					return transcribeMediaRangeWithPanelRuntime({
						mediaAsset: runtimeAsset,
						language,
						modelId,
						range,
						onProgress: handleProgress,
					});
				},
			});
			setDiagnostics(report);
			setDiagnosticsSignature(currentSignature);
		} catch (error) {
			console.error("Caption diagnostics failed:", error);
			setError(
				error instanceof Error
					? error.message
					: t("An unexpected error occurred"),
			);
		} finally {
			setIsProcessing(false);
			setProcessingStep("");
			setProgressValue(0);
		}
	};

	const handleGenerateCaptions = () => {
		if (!diagnostics || diagnosticsSignature !== currentSignature) {
			setError(t("Run diagnostics again after changing caption settings."));
			return;
		}
		if (diagnostics.status === "blocked") {
			setError(t("Resolve blocked caption diagnostics before generating."));
			return;
		}
		if (diagnostics.existingSubtitles.blocksGeneration) {
			setError(t("Remove or replace existing editable captions first."));
			return;
		}

		try {
			setError(null);
			const captionTrackId = editor.timeline.addTrack({
				type: "text",
				index: 0,
			});
			for (
				let index = 0;
				index < diagnostics.candidateCaptions.length;
				index += 1
			) {
				const caption = diagnostics.candidateCaptions[index];
				const resolvedMotion = captionStyle.motionPreset
					? resolveTextMotionPreset({
							preset: captionStyle.motionPreset,
							duration: caption.duration,
							baseTransform: captionBaseTransform,
						})
					: undefined;
				editor.timeline.insertElement({
					placement: { mode: "explicit", trackId: captionTrackId },
					element: buildTextElement({
						raw: {
							...resolvedCaptionStyle,
							transform: captionBaseTransform,
							name: `Caption ${index + 1}`,
							content: caption.text,
							duration: caption.duration,
							...(resolvedMotion
								? {
										motionPreset: resolvedMotion.motionPreset,
										keyframes: resolvedMotion.keyframes,
									}
								: {}),
						},
						startTime: caption.startTime,
					}),
				});
			}
		} catch (error) {
			console.error("Caption generation failed:", error);
			setError(
				error instanceof Error
					? error.message
					: t("An unexpected error occurred"),
			);
		}
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage({ value: "auto" });
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage({ value: matchedLanguage.code });
	};

	return (
		<BaseView
			ref={containerRef}
			className="flex h-full min-h-0 flex-col overflow-hidden"
		>
			<div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-3">
						<Label>{t("Model")}</Label>
						<Select
							value={selectedModelId}
							onValueChange={(value) =>
								setSelectedModelId({
									value: value as TranscriptionModelId,
								})
							}
							disabled={isProcessing}
						>
							<SelectTrigger>
								<SelectValue placeholder={t("Select a model")} />
							</SelectTrigger>
							<SelectContent>
								{TRANSCRIPTION_MODELS.map((model) => (
									<SelectItem key={model.id} value={model.id}>
										{model.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<p className="text-muted-foreground text-xs">
							{selectedModelDescription}
						</p>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label>{t("Language")}</Label>
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
								disabled={isProcessing}
							>
								<SelectTrigger>
									<SelectValue placeholder={t("Select a language")} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">{t("Auto detect")}</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-2">
							<Label>{t("Position")}</Label>
							<Select
								value={selectedPosition}
								onValueChange={(value) =>
									setSelectedPosition({ value: value as CaptionPosition })
								}
								disabled={isProcessing}
							>
								<SelectTrigger>
									<SelectValue placeholder={t("Select position")} />
								</SelectTrigger>
								<SelectContent>
									{CAPTION_POSITION_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{t(formatCaptionOptionLabel(option.value))}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label>{t("Caption Style")}</Label>
							<Select
								value={selectedPreset}
								onValueChange={(value) =>
									setSelectedPreset({ value: value as CaptionStylePreset })
								}
								disabled={isProcessing}
							>
								<SelectTrigger>
									<SelectValue placeholder={t("Select a style")} />
								</SelectTrigger>
								<SelectContent>
									{CAPTION_STYLE_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{t(option.label)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-2">
							<Label>{t("Motion")}</Label>
							<Select
								value={selectedMotionPreset}
								onValueChange={(value) =>
									setSelectedMotionPreset({
										value: value as CaptionMotionSelection,
									})
								}
								disabled={isProcessing}
							>
								<SelectTrigger>
									<SelectValue placeholder={t("Select motion")} />
								</SelectTrigger>
								<SelectContent>
									{CAPTION_MOTION_OPTIONS.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.value === "none"
												? t("None")
												: t(formatCaptionOptionLabel(option.value))}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="flex min-h-[76px] items-center justify-center rounded-md border bg-neutral-950 p-3">
						<span
							className="max-w-full break-words px-2 py-1 text-center"
							style={{
								fontFamily: resolvedCaptionStyle.fontFamily,
								color: resolvedCaptionStyle.color,
								backgroundColor: resolvedCaptionStyle.backgroundColor,
								fontWeight: resolvedCaptionStyle.fontWeight,
								fontStyle: resolvedCaptionStyle.fontStyle,
								textDecoration: resolvedCaptionStyle.textDecoration,
								borderRadius: resolvedCaptionStyle.backgroundBorderRadius,
								textShadow: resolvedCaptionStyle.shadow
									? `${resolvedCaptionStyle.shadow.offsetX}px ${resolvedCaptionStyle.shadow.offsetY}px ${resolvedCaptionStyle.shadow.blur}px ${resolvedCaptionStyle.shadow.color}`
									: undefined,
								WebkitTextStroke: resolvedCaptionStyle.stroke
									? `${resolvedCaptionStyle.stroke.width}px ${resolvedCaptionStyle.stroke.color}`
									: undefined,
							}}
						>
							{t("Caption diagnostics preview")}
						</span>
					</div>
				</div>

				{diagnostics && (
					<div className="flex flex-col gap-4">
						<DiagnosticSection title={t("Diagnostic Summary")}>
							<div className="flex flex-wrap items-center gap-2">
								<span
									className={`rounded-md border px-2 py-1 text-xs font-medium ${statusClasses(
										diagnostics.status,
									)}`}
								>
									{t(diagnostics.status)}
								</span>
								<span className="text-muted-foreground text-xs">
									{t(
										"{{captions}} candidates, {{issues}} quality issues, {{low}} low confidence",
										{
											captions: diagnostics.summary.candidateCaptionCount,
											issues: diagnostics.summary.captionIssueCount,
											low: diagnostics.summary.lowConfidenceCount,
										},
									)}
								</span>
							</div>
							{diagnostics.recommendations.length > 0 && (
								<ul className="text-muted-foreground list-disc space-y-1 pl-4 text-xs">
									{diagnostics.recommendations.map((recommendation) => (
										<li key={recommendation}>{t(recommendation)}</li>
									))}
								</ul>
							)}
						</DiagnosticSection>

						<DiagnosticSection title={t("Source Coverage")}>
							<div className="grid grid-cols-3 gap-2 text-xs">
								<div>
									<p className="font-medium">
										{diagnostics.sourceCoverage.eligibleClipCount}
									</p>
									<p className="text-muted-foreground">{t("Eligible")}</p>
								</div>
								<div>
									<p className="font-medium">
										{diagnostics.sourceCoverage.skippedClipCount}
									</p>
									<p className="text-muted-foreground">{t("Skipped")}</p>
								</div>
								<div>
									<p className="font-medium">
										{diagnostics.sourceCoverage.issues.length}
									</p>
									<p className="text-muted-foreground">{t("Source errors")}</p>
								</div>
							</div>
							{diagnostics.sourceCoverage.eligibleClips.length > 0 && (
								<ul className="space-y-1 text-xs">
									{diagnostics.sourceCoverage.eligibleClips.map((clip) => (
										<li
											key={clip.clipId}
											className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground"
										>
											<span>
												{t("Clip")} {clip.clipId.slice(0, 8)}
											</span>
											<span>
												{formatRange(clip.sourceStart, clip.sourceEnd)}
											</span>
										</li>
									))}
								</ul>
							)}
							{diagnostics.sourceCoverage.skippedClips.length > 0 && (
								<ul className="space-y-1 text-xs">
									{diagnostics.sourceCoverage.skippedClips.map((clip) => (
										<li key={`${clip.clipId}-${clip.reason}`}>
											<span className="text-muted-foreground">
												{clip.clipId.slice(0, 8)}
											</span>{" "}
											{t(clip.reason)}
										</li>
									))}
								</ul>
							)}
							{diagnostics.sourceCoverage.issues.length > 0 && (
								<ul className="text-destructive space-y-1 text-xs">
									{diagnostics.sourceCoverage.issues.map((issue) => (
										<li key={`${issue.clipId}-${issue.message}`}>
											{issue.message}
										</li>
									))}
								</ul>
							)}
						</DiagnosticSection>

						<DiagnosticSection title={t("Transcription And Confidence")}>
							<div className="grid grid-cols-3 gap-2 text-xs">
								<div>
									<p className="font-medium">
										{diagnostics.transcription.successfulClipCount}/
										{diagnostics.transcription.attemptedClipCount}
									</p>
									<p className="text-muted-foreground">{t("Clips")}</p>
								</div>
								<div>
									<p className="font-medium">
										{diagnostics.transcription.segmentCount}
									</p>
									<p className="text-muted-foreground">{t("Segments")}</p>
								</div>
								<div>
									<p className="font-medium">
										{diagnostics.confidence.confidenceAvailable
											? (diagnostics.confidence.averageConfidence ?? "-")
											: t("Unavailable")}
									</p>
									<p className="text-muted-foreground">{t("Confidence")}</p>
								</div>
							</div>
							{diagnostics.confidence.lowConfidenceItems.length > 0 && (
								<ul className="space-y-1 text-xs">
									{diagnostics.confidence.lowConfidenceItems
										.slice(0, 5)
										.map((item) => (
											<li
												key={`${item.clipId}-${item.timelineStart}-${item.text}`}
											>
												<span className="font-medium">{item.confidence}</span>{" "}
												<span className="text-muted-foreground">
													{formatRange(item.timelineStart, item.timelineEnd)}
												</span>{" "}
												{item.text}
											</li>
										))}
								</ul>
							)}
							{diagnostics.transcription.errors.length > 0 && (
								<ul className="text-destructive space-y-1 text-xs">
									{diagnostics.transcription.errors.map((item) => (
										<li key={`${item.clipId}-${item.message}`}>
											{item.message}
										</li>
									))}
								</ul>
							)}
						</DiagnosticSection>

						<DiagnosticSection title={t("Caption Quality")}>
							{diagnostics.captionQuality.ok ? (
								<p className="text-muted-foreground text-xs">
									{t("No readability issues found in candidate captions.")}
								</p>
							) : (
								<ul className="space-y-1 text-xs">
									{diagnostics.captionQuality.issues.map((issue) => (
										<li key={`${issue.path}-${issue.code}`}>
											<span className="font-medium">{issue.code}</span>{" "}
											<span className="text-muted-foreground">
												{issue.path}
											</span>
										</li>
									))}
								</ul>
							)}
						</DiagnosticSection>

						<DiagnosticSection title={t("Subtitle Risk")}>
							<div className="space-y-2 text-xs">
								<p>
									<span className="font-medium">
										{diagnostics.existingSubtitles.editableCaptionCount}
									</span>{" "}
									<span className="text-muted-foreground">
										{t("editable caption elements")}
									</span>
								</p>
								<p className="text-muted-foreground">
									{t(diagnostics.burnedSubtitleRisk.message)}{" "}
									{diagnostics.burnedSubtitleRisk.severity === "warning"
										? t(
												"Visual inspection recommended before lower-safe captions.",
											)
										: t("No burned subtitle detection has been run.")}
								</p>
							</div>
						</DiagnosticSection>

						<DiagnosticSection title={t("Candidate Preview")}>
							{diagnostics.candidateCaptions.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									{t("No candidate captions available.")}
								</p>
							) : (
								<ul className="space-y-2 text-xs">
									{diagnostics.candidateCaptions
										.slice(0, 6)
										.map((caption, index) => (
											<li key={`${caption.startTime}-${caption.text}`}>
												<div className="text-muted-foreground">
													{index + 1}.{" "}
													{formatRange(
														caption.startTime,
														caption.startTime + caption.duration,
													)}
												</div>
												<div className="break-words">{caption.text}</div>
											</li>
										))}
								</ul>
							)}
						</DiagnosticSection>
					</div>
				)}
			</div>

			<div className="flex shrink-0 flex-col gap-3 border-t pt-4">
				{error && (
					<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
						<p className="text-destructive text-sm">{error}</p>
					</div>
				)}

				{isProcessing && (
					<div className="flex flex-col gap-1.5">
						<Progress value={progressValue} className="w-full" />
						<p className="text-muted-foreground text-center text-xs">
							{processingStep}
						</p>
					</div>
				)}

				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					<Button
						type="button"
						variant="outline"
						onClick={handleRunDiagnostics}
						disabled={isProcessing}
					>
						{isProcessing && <Spinner className="mr-1" />}
						{isProcessing ? t("Processing...") : t("Run diagnostics")}
					</Button>
					<Button
						type="button"
						onClick={handleGenerateCaptions}
						disabled={isProcessing || !canGenerate}
					>
						{t("Generate captions")}
					</Button>
				</div>
			</div>
		</BaseView>
	);
}
