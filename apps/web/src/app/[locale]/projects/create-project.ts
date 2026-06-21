interface ProjectCreator {
	project: {
		createNewProject: ({ name }: { name: string }) => Promise<string>;
	};
}

interface ProjectRouter {
	push: (href: string) => void | Promise<void>;
}

export function normalizeProjectName({ name }: { name: string }): string {
	const trimmedName = name.trim();
	if (!trimmedName) {
		throw new Error("Project name is required.");
	}
	return trimmedName;
}

export async function createProjectFromName({
	editor,
	router,
	name,
}: {
	editor: ProjectCreator;
	router: ProjectRouter;
	name: string;
}): Promise<string> {
	const projectName = normalizeProjectName({ name });
	const projectId = await editor.project.createNewProject({
		name: projectName,
	});
	await router.push(`/editor/${projectId}`);
	return projectId;
}
