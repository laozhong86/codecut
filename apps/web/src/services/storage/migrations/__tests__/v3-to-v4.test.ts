import { describe, expect, test } from "bun:test";
import { transformProjectV3ToV4 } from "../transformers/v3-to-v4";

describe("transformProjectV3ToV4", () => {
	test("adds empty richSpans to existing text elements", () => {
		const result = transformProjectV3ToV4({
			project: {
				id: "project-v3-text",
				version: 3,
				metadata: {
					id: "project-v3-text",
					name: "Text project",
					duration: 5,
				},
				scenes: [
					{
						id: "scene-1",
						tracks: [
							{
								id: "text-track",
								type: "text",
								elements: [
									{
										id: "text-1",
										type: "text",
										content: "hello",
										startTime: 0,
										duration: 5,
									},
								],
							},
						],
					},
				],
			},
		});

		expect(result.skipped).toBe(false);
		expect(result.project.version).toBe(4);
		expect(
			// @ts-expect-error migration fixtures are intentionally loose records
			result.project.scenes[0].tracks[0].elements[0].richSpans,
		).toEqual([]);
	});

	test("skips projects that are already v4", () => {
		const project = {
			id: "project-v4",
			version: 4,
			scenes: [],
		};

		const result = transformProjectV3ToV4({ project });

		expect(result).toEqual({
			project,
			skipped: true,
			reason: "already v4",
		});
	});
});
