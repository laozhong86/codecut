import type {
	TimelineTrack,
	VideoElement,
	ImageElement,
	VideoTrack,
} from "@/types/timeline";
import type { MediaAsset } from "@/types/assets";
import { RootNode } from "./nodes/root-node";
import { VideoNode } from "./nodes/video-node";
import {
	MaskedVideoNode,
	type MaskedVideoNodeParams,
} from "./nodes/masked-video-node";
import { ImageNode } from "./nodes/image-node";
import { TextNode } from "./nodes/text-node";
import { StickerNode } from "./nodes/sticker-node";
import { ColorNode } from "./nodes/color-node";
import { BlurBackgroundNode } from "./nodes/blur-background-node";
import { TransitionNode } from "./nodes/transition-node";
import type { BaseNode } from "./nodes/base-node";
import type { DerivedAsset, TBackground, TCanvasSize } from "@/types/project";
import { DEFAULT_BLUR_INTENSITY } from "@/constants/project-constants";
import { isMainTrack } from "@/lib/timeline";
import { isBottomAlignedSubtitleText } from "@/lib/timeline/text-utils";

export type BuildSceneParams = {
	canvasSize: TCanvasSize;
	tracks: TimelineTrack[];
	mediaAssets: MediaAsset[];
	derivedAssets: DerivedAsset[];
	duration: number;
	background: TBackground;
	frameRate?: number;
};

type VideoSourceMetadata = {
	sourcePath?: string;
	sourceWidth: number;
	sourceHeight: number;
	sourceFrameRate: number;
};

function assertPositiveInteger({
	value,
	label,
	mediaId,
}: {
	value: number | undefined;
	label: string;
	mediaId: string;
}): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
		throw new Error(
			`Timeline ${label} is required for media asset ${mediaId}.`,
		);
	}
	return value;
}

function assertPositiveFinite({
	value,
	label,
	mediaId,
}: {
	value: number | undefined;
	label: string;
	mediaId: string;
}): number {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		throw new Error(
			`Timeline ${label} is required for media asset ${mediaId}.`,
		);
	}
	return value;
}

function buildVideoSourceMetadata({
	mediaAsset,
	frameRate,
	label,
}: {
	mediaAsset: MediaAsset;
	frameRate?: number;
	label: string;
}): VideoSourceMetadata {
	return {
		sourcePath: mediaAsset.sourcePath,
		sourceWidth: assertPositiveInteger({
			value: mediaAsset.width,
			label: `${label} source width`,
			mediaId: mediaAsset.id,
		}),
		sourceHeight: assertPositiveInteger({
			value: mediaAsset.height,
			label: `${label} source height`,
			mediaId: mediaAsset.id,
		}),
		sourceFrameRate: assertPositiveFinite({
			value: mediaAsset.fps ?? frameRate,
			label: `${label} source frame rate`,
			mediaId: mediaAsset.id,
		}),
	};
}

function buildVisualElementNode({
	element,
	mediaMap,
	derivedAssetMap,
	frameRate,
}: {
	element: VideoElement | ImageElement;
	mediaMap: Map<string, MediaAsset>;
	derivedAssetMap: Map<string, DerivedAsset>;
	frameRate?: number;
}): BaseNode {
	const mediaAsset = mediaMap.get(element.mediaId);
	if (!mediaAsset) {
		throw new Error(`Timeline media asset was not found: ${element.mediaId}`);
	}
	if (!mediaAsset.file) {
		throw new Error(`Timeline media asset has no file: ${mediaAsset.id}`);
	}

	if (mediaAsset.type === "video") {
		const videoElement = element as VideoElement;
		if (videoElement.mask) {
			const sourceMetadata = buildVideoSourceMetadata({
				mediaAsset,
				frameRate,
				label: "masked video",
			});
			const derivedAsset = derivedAssetMap.get(
				videoElement.mask.derivedAssetId,
			);
			if (!derivedAsset) {
				throw new Error("Masked video derived asset was not found.");
			}
			if (derivedAsset.sourceMediaId !== videoElement.mediaId) {
				throw new Error("Masked video source does not match derived asset.");
			}

			const alphaMedia = mediaMap.get(derivedAsset.alphaMediaId);
			if (!alphaMedia?.file) {
				throw new Error("Masked video alpha media asset was not found.");
			}
			if (alphaMedia.type !== "video") {
				throw new Error("Masked video alpha media asset must be video.");
			}
			const alphaMetadata = buildVideoSourceMetadata({
				mediaAsset: alphaMedia,
				frameRate,
				label: "masked video alpha",
			});

			const maskedParams: MaskedVideoNodeParams = {
				mediaId: mediaAsset.id,
				url: mediaAsset.url,
				file: mediaAsset.file,
				...sourceMetadata,
				alphaMediaId: alphaMedia.id,
				alphaFile: alphaMedia.file,
				alphaSourcePath: alphaMetadata.sourcePath,
				alphaSourceWidth: alphaMetadata.sourceWidth,
				alphaSourceHeight: alphaMetadata.sourceHeight,
				alphaSourceFrameRate: alphaMetadata.sourceFrameRate,
				duration: element.duration,
				timeOffset: element.startTime,
				trimStart: element.trimStart,
				trimEnd: element.trimEnd,
				transform: element.transform,
				opacity: element.opacity,
				keyframes: element.keyframes,
				sourceCrop: videoElement.sourceCrop,
				playbackRate: videoElement.playbackRate,
				reversed: videoElement.reversed,
			};
			return new MaskedVideoNode(maskedParams);
		}
		return new VideoNode({
			mediaId: mediaAsset.id,
			url: mediaAsset.url,
			file: mediaAsset.file,
			...buildVideoSourceMetadata({
				mediaAsset,
				frameRate,
				label: "video",
			}),
			duration: element.duration,
			timeOffset: element.startTime,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
			transform: element.transform,
			opacity: element.opacity,
			keyframes: element.keyframes,
			sourceCrop: videoElement.sourceCrop,
			playbackRate: videoElement.playbackRate,
			reversed: videoElement.reversed,
		});
	}

	if (mediaAsset.type === "image") {
		return new ImageNode({
			url: mediaAsset.url,
			file: mediaAsset.file,
			duration: element.duration,
			timeOffset: element.startTime,
			trimStart: element.trimStart,
			trimEnd: element.trimEnd,
			transform: element.transform,
			opacity: element.opacity,
			keyframes: element.keyframes,
		});
	}

	throw new Error(`Timeline media asset is not visual: ${mediaAsset.id}`);
}

function getElementEndTime({
	element,
}: {
	element: VideoElement | ImageElement;
}): number {
	return element.startTime + element.duration;
}

export function buildScene(params: BuildSceneParams) {
	const {
		tracks,
		mediaAssets,
		derivedAssets,
		duration,
		canvasSize,
		background,
		frameRate,
	} = params;

	const rootNode = new RootNode({ duration });
	const mediaMap = new Map(mediaAssets.map((m) => [m.id, m]));
	const derivedAssetMap = new Map(derivedAssets.map((asset) => [asset.id, asset]));

	const visibleTracks = tracks.filter(
		(track) => !("hidden" in track && track.hidden),
	);

	const orderedTracksTopToBottom = [
		...visibleTracks.filter((track) => !isMainTrack(track)),
		...visibleTracks.filter((track) => isMainTrack(track)),
	];

	const orderedTracksBottomToTop = orderedTracksTopToBottom.slice().reverse();

	const contentNodes: BaseNode[] = [];

	for (const track of orderedTracksBottomToTop) {
		const elements = track.elements
			.filter((element) => !("hidden" in element && element.hidden))
			.slice()
			.sort((a, b) => {
				if (a.startTime !== b.startTime) return a.startTime - b.startTime;
				return a.id.localeCompare(b.id);
			});

		if (track.type === "video") {
			const videoTrack = track as VideoTrack;
			const visualElements = elements as (VideoElement | ImageElement)[];
			const processedIds = new Set<string>();

			const trackTransitions = videoTrack.transitions ?? [];
			const transitionLookup = new Map<string, typeof trackTransitions[number]>();
			for (const transition of trackTransitions) {
				const key = `${transition.fromElementId}:${transition.toElementId}`;
				transitionLookup.set(key, transition);
			}

			for (let i = 0; i < visualElements.length; i++) {
				const element = visualElements[i];
				if (processedIds.has(element.id)) continue;

				// look ahead: check transition with next element
				if (i < visualElements.length - 1) {
					const nextElement = visualElements[i + 1];
					const pairKey = `${element.id}:${nextElement.id}`;
					const transition = transitionLookup.get(pairKey);

					if (transition) {
							const outgoingNode = buildVisualElementNode({
								element,
								mediaMap,
								derivedAssetMap,
								frameRate,
							});
							const incomingNode = buildVisualElementNode({
								element: nextElement,
								mediaMap,
								derivedAssetMap,
								frameRate,
							});

						if (outgoingNode && incomingNode) {
							processedIds.add(element.id);
							processedIds.add(nextElement.id);

							const junctionTime = nextElement.startTime;
							contentNodes.push(
								new TransitionNode({
									type: transition.type,
									duration: transition.duration,
									transitionStart:
										junctionTime - transition.duration / 2,
									outgoingNode,
									incomingNode,
									outgoingEndTime: getElementEndTime({
										element,
									}),
									incomingStartTime: nextElement.startTime,
								}),
							);
							continue;
						}
					}
				}

					const node = buildVisualElementNode({
						element,
						mediaMap,
						derivedAssetMap,
						frameRate,
					});
				if (node) {
					processedIds.add(element.id);
					contentNodes.push(node);
				}
			}

			continue;
		}

		for (const element of elements) {
			if (element.type === "text") {
				const textBaseline = isBottomAlignedSubtitleText({ element })
					? "bottom"
					: "middle";
				contentNodes.push(
					new TextNode({
						...element,
						canvasCenter: {
							x: canvasSize.width / 2,
							y: canvasSize.height / 2,
						},
						canvasHeight: canvasSize.height,
						textBaseline,
					}),
				);
			}

			if (element.type === "sticker") {
				contentNodes.push(
					new StickerNode({
						iconName: element.iconName,
						duration: element.duration,
						timeOffset: element.startTime,
						trimStart: element.trimStart,
						trimEnd: element.trimEnd,
						transform: element.transform,
						opacity: element.opacity,
						keyframes: element.keyframes,
						color: element.color,
					}),
				);
			}
		}
	}

	if (background.type === "blur") {
		rootNode.add(
			new BlurBackgroundNode({
				blurIntensity: background.blurIntensity ?? DEFAULT_BLUR_INTENSITY,
				contentNodes,
			}),
		);
		for (const node of contentNodes) {
			rootNode.add(node);
		}
	} else {
		if (background.type === "color" && background.color !== "transparent") {
			rootNode.add(new ColorNode({ color: background.color }));
		}
		for (const node of contentNodes) {
			rootNode.add(node);
		}
	}

	return rootNode;
}
