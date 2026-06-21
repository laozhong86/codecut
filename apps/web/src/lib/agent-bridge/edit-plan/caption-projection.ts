import type { TranscriptionSegment } from "@/types/transcription";
import type { EditPlanCaption, EditPlanClip } from "./schema";

const TIME_TOLERANCE_SECONDS = 0.001;

function roundTime(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function isInsideClip({
	segment,
	clip,
}: {
	segment: TranscriptionSegment;
	clip: EditPlanClip;
}) {
	return (
		segment.start >= clip.sourceStart - TIME_TOLERANCE_SECONDS &&
		segment.end <= clip.sourceEnd + TIME_TOLERANCE_SECONDS
	);
}

function overlapsClip({
	segment,
	clip,
}: {
	segment: TranscriptionSegment;
	clip: EditPlanClip;
}) {
	return (
		segment.start < clip.sourceEnd - TIME_TOLERANCE_SECONDS &&
		segment.end > clip.sourceStart + TIME_TOLERANCE_SECONDS
	);
}

export function projectTranscriptSegmentsToEditedCaptions({
	clips,
	segments,
}: {
	clips: EditPlanClip[];
	segments: TranscriptionSegment[];
}): EditPlanCaption[] {
	const captions: EditPlanCaption[] = [];

	for (const segment of segments) {
		const text = segment.text.trim();
		if (!text) continue;

		const containingClip = clips.find((clip) => isInsideClip({ segment, clip }));
		if (containingClip) {
			captions.push({
				text,
				startTime: roundTime(
					containingClip.timelineStart + segment.start - containingClip.sourceStart,
				),
				duration: roundTime(segment.end - segment.start),
			});
			continue;
		}

		const partialOverlap = clips.some((clip) => overlapsClip({ segment, clip }));
		if (partialOverlap) {
			throw new Error(
				"Transcript segment overlaps an edited clip boundary; regenerate captions from edited audio or choose transcript-aligned cuts.",
			);
		}
	}

	return captions.sort((a, b) => a.startTime - b.startTime);
}
