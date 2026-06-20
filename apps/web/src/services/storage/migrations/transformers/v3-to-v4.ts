import type { MigrationResult, ProjectRecord } from "./types";
import { getProjectId, isRecord } from "./utils";

export function transformProjectV3ToV4({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord> {
	const projectId = getProjectId({ project });
	if (!projectId) {
		return { project, skipped: true, reason: "no project id" };
	}

	if (isV4Project({ project })) {
		return { project, skipped: true, reason: "already v4" };
	}

	return {
		project: {
			...project,
			version: 4,
			scenes: migrateScenes({ scenes: project.scenes }),
		},
		skipped: false,
	};
}

function isV4Project({ project }: { project: ProjectRecord }): boolean {
	return typeof project.version === "number" && project.version >= 4;
}

function migrateScenes({ scenes }: { scenes: unknown }): unknown {
	if (!Array.isArray(scenes)) return scenes;
	return scenes.map((scene) => {
		if (!isRecord(scene)) return scene;
		return {
			...scene,
			tracks: migrateTracks({ tracks: scene.tracks }),
		};
	});
}

function migrateTracks({ tracks }: { tracks: unknown }): unknown {
	if (!Array.isArray(tracks)) return tracks;
	return tracks.map((track) => {
		if (!isRecord(track)) return track;
		return {
			...track,
			elements: migrateElements({ elements: track.elements }),
		};
	});
}

function migrateElements({ elements }: { elements: unknown }): unknown {
	if (!Array.isArray(elements)) return elements;
	return elements.map((element) => {
		if (!isRecord(element) || element.type !== "text") return element;
		return {
			...element,
			richSpans: Array.isArray(element.richSpans) ? element.richSpans : [],
		};
	});
}
