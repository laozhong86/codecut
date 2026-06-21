import { describe, expect, test } from "bun:test";
import { createProjectFromName, normalizeProjectName } from "../create-project";

describe("project creation naming", () => {
	test("creates a project from a trimmed user-provided name", async () => {
		const createdProjects: Array<{ name: string }> = [];
		const pushedUrls: string[] = [];

		await createProjectFromName({
			name: "  Launch ad cut  ",
			editor: {
				project: {
					createNewProject: async ({ name }) => {
						createdProjects.push({ name });
						return "project-123";
					},
				},
			},
			router: {
				push: (href) => {
					pushedUrls.push(href);
				},
			},
		});

		expect(createdProjects).toEqual([{ name: "Launch ad cut" }]);
		expect(pushedUrls).toEqual(["/editor/project-123"]);
	});

	test("rejects blank project names before creating a project", async () => {
		expect(() => normalizeProjectName({ name: "   " })).toThrow(
			"Project name is required.",
		);
	});
});
