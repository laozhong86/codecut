import type { DerivedAsset } from "@/types/project";

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
