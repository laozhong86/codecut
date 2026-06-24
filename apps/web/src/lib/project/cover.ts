import type { MediaType } from "@/types/assets";
import type { ProjectCover, ProjectCoverSource } from "@/types/project";

export function buildProjectCoverFromImageAsset({
	asset,
	existingCover,
	source = "media_asset",
	title,
	updatedAt = new Date().toISOString(),
}: {
	asset: {
		id: string;
		type: MediaType;
		width?: number;
		height?: number;
	};
	existingCover?: ProjectCover;
	source?: Extract<ProjectCoverSource, "media_asset" | "timeline_frame">;
	title?: string;
	updatedAt?: string;
}): ProjectCover {
	if (asset.type !== "image" || asset.width === undefined || asset.height === undefined) {
		throw new Error("Project cover requires an image asset with dimensions.");
	}

	const trimmedTitle = title?.trim();
	const isUpdatingSameAsset = existingCover?.mediaId === asset.id;
	const preservedMetadata = isUpdatingSameAsset
		? {
				source: existingCover.source,
				...(existingCover.prompt ? { prompt: existingCover.prompt } : {}),
				...(existingCover.stylePreset
					? { stylePreset: existingCover.stylePreset }
					: {}),
			}
		: { source };

	return {
		mediaId: asset.id,
		...preservedMetadata,
		...(trimmedTitle ? { title: trimmedTitle } : {}),
		width: asset.width,
		height: asset.height,
		updatedAt,
	};
}
