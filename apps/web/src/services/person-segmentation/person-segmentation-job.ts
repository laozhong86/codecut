export interface PersonSegmentationFrame {
	timestampSec: number;
	image: unknown;
}

export interface PersonSegmentationAlphaFrame {
	timestampSec: number;
	alpha: Uint8ClampedArray;
}

export interface SegmentFrameResult {
	alpha: Uint8ClampedArray;
	confidence: number;
}

export interface EncodedAlphaVideo {
	file: File;
	width: number;
	height: number;
	fps: number;
	duration: number;
}

export interface RunPersonSegmentationJobParams {
	frames: PersonSegmentationFrame[];
	width: number;
	height: number;
	fps: number;
	segmentFrame({
		image,
		timestampMs,
		width,
		height,
	}: {
		image: unknown;
		timestampMs: number;
		width: number;
		height: number;
	}): Promise<SegmentFrameResult>;
	encodeAlphaVideo({
		frames,
		width,
		height,
		fps,
	}: {
		frames: PersonSegmentationAlphaFrame[];
		width: number;
		height: number;
		fps: number;
	}): Promise<EncodedAlphaVideo>;
}

export type PersonSegmentationJobResult = EncodedAlphaVideo & {
	confidence: number;
};

function validateJobShape({
	frames,
	width,
	height,
	fps,
}: {
	frames: PersonSegmentationFrame[];
	width: number;
	height: number;
	fps: number;
}): void {
	if (frames.length === 0) {
		throw new Error("Person segmentation frames are required.");
	}
	if (width <= 0 || height <= 0) {
		throw new Error("Person segmentation dimensions are required.");
	}
	if (fps <= 0) {
		throw new Error("Person segmentation fps is required.");
	}

	let previousTimestamp = -Infinity;
	for (const frame of frames) {
		if (frame.timestampSec <= previousTimestamp) {
			throw new Error(
				"Person segmentation frame timestamps must be strictly increasing.",
			);
		}
		previousTimestamp = frame.timestampSec;
	}
}

export async function runPersonSegmentationJob({
	frames,
	width,
	height,
	fps,
	segmentFrame,
	encodeAlphaVideo,
}: RunPersonSegmentationJobParams): Promise<PersonSegmentationJobResult> {
	validateJobShape({ frames, width, height, fps });

	const alphaFrames: PersonSegmentationAlphaFrame[] = [];
	let confidenceTotal = 0;

	for (const frame of frames) {
		const result = await segmentFrame({
			image: frame.image,
			timestampMs: Math.round(frame.timestampSec * 1000),
			width,
			height,
		});

		if (result.alpha.length === 0) {
			throw new Error("Person segmentation alpha frame is empty.");
		}
		if (result.alpha.length !== width * height) {
			throw new Error(
				"Person segmentation alpha frame length must match width * height.",
			);
		}
		if (result.confidence < 0 || result.confidence > 1) {
			throw new Error("Person segmentation confidence must be between 0 and 1.");
		}

		alphaFrames.push({
			timestampSec: frame.timestampSec,
			alpha: result.alpha,
		});
		confidenceTotal += result.confidence;
	}

	const encoded = await encodeAlphaVideo({
		frames: alphaFrames,
		width,
		height,
		fps,
	});

	return {
		...encoded,
		confidence: confidenceTotal / frames.length,
	};
}
