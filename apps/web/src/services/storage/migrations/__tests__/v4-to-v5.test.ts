import { describe, expect, test } from "bun:test";
import { transformProjectV4ToV5 } from "../transformers/v4-to-v5";

describe("transformProjectV4ToV5", () => {
	test("adds an empty derivedAssets registry", () => {
		const result = transformProjectV4ToV5({
			project: {
				id: "project-v4",
				version: 4,
				metadata: { id: "project-v4", name: "Project", duration: 0 },
				scenes: [],
			},
		});

		expect(result).toEqual({
			project: {
				id: "project-v4",
				version: 5,
				metadata: { id: "project-v4", name: "Project", duration: 0 },
				scenes: [],
				derivedAssets: [],
			},
			skipped: false,
		});
	});

	test("skips projects that are already v5", () => {
		const project = {
			id: "project-v5",
			version: 5,
			derivedAssets: [],
		};

		expect(transformProjectV4ToV5({ project })).toEqual({
			project,
			skipped: true,
			reason: "already v5",
		});
	});
});
