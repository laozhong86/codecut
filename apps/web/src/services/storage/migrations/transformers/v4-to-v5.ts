import type { MigrationResult, ProjectRecord } from "./types";
import { getProjectId } from "./utils";

export function transformProjectV4ToV5({
	project,
}: {
	project: ProjectRecord;
}): MigrationResult<ProjectRecord> {
	const projectId = getProjectId({ project });
	if (!projectId) {
		return { project, skipped: true, reason: "no project id" };
	}

	if (typeof project.version === "number" && project.version >= 5) {
		return { project, skipped: true, reason: "already v5" };
	}

	return {
		project: {
			...project,
			version: 5,
			derivedAssets: Array.isArray(project.derivedAssets)
				? project.derivedAssets
				: [],
		},
		skipped: false,
	};
}
