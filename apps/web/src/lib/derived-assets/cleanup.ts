import type { DerivedAsset } from "@/types/project";
import type { TimelineTrack } from "@/types/timeline";
import { hasMediaId } from "@/lib/timeline/element-utils";

export interface DerivedAssetCleanupPlan {
	derivedAssetIds: string[];
	mediaAssetIds: string[];
}

export function getDerivedAssetCleanupForMediaRemoval({
	removedMediaId,
	derivedAssets,
}: {
	removedMediaId: string;
	derivedAssets: DerivedAsset[];
}): DerivedAssetCleanupPlan {
	const derivedAssetIds: string[] = [];
	const mediaAssetIds = new Set<string>([removedMediaId]);

	for (const asset of derivedAssets) {
		if (
			asset.sourceMediaId !== removedMediaId &&
			asset.alphaMediaId !== removedMediaId
		) {
			continue;
		}

		derivedAssetIds.push(asset.id);
		if (asset.sourceMediaId === removedMediaId) {
			mediaAssetIds.add(asset.alphaMediaId);
		}
	}

	return {
		derivedAssetIds,
		mediaAssetIds: Array.from(mediaAssetIds),
	};
}

export function getTimelineElementsForMediaAndDerivedAssetRemoval({
	tracks,
	mediaAssetIds,
	derivedAssetIds,
}: {
	tracks: TimelineTrack[];
	mediaAssetIds: string[];
	derivedAssetIds: string[];
}): Array<{ trackId: string; elementId: string }> {
	const mediaAssetIdSet = new Set(mediaAssetIds);
	const derivedAssetIdSet = new Set(derivedAssetIds);
	const elementsToRemove: Array<{ trackId: string; elementId: string }> = [];

	for (const track of tracks) {
		for (const element of track.elements) {
			const referencesRemovedMedia =
				hasMediaId(element) && mediaAssetIdSet.has(element.mediaId);
			const referencesRemovedDerivedAsset =
				element.type === "video" &&
				element.mask !== undefined &&
				derivedAssetIdSet.has(element.mask.derivedAssetId);

			if (referencesRemovedMedia || referencesRemovedDerivedAsset) {
				elementsToRemove.push({ trackId: track.id, elementId: element.id });
			}
		}
	}

	return elementsToRemove;
}
