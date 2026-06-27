import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST as postCommands } from "../commands/route";
import { GET as getMedia } from "../media/route";
import {
	DELETE as deleteProject,
	GET as getProject,
	PATCH as patchProject,
} from "../project/route";
import { GET as getProjects, POST as postProjects } from "../projects/route";
import { GET as getStatus } from "../status/route";

const origin = "http://localhost:4100";
const token = "local-dev-bridge";

function expectedEditorBaseUrl() {
	return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:4100").replace(
		/\/$/,
		"",
	);
}

function request({
	url,
	method = "GET",
	headers,
	body,
}: {
	url: string;
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	headers?: Record<string, string>;
	body?: unknown;
}) {
	return new NextRequest(url, {
		method,
		headers: {
			...(body ? { "content-type": "application/json" } : {}),
			...headers,
		},
		body: body ? JSON.stringify(body) : undefined,
	});
}

function confirmedSetupBody(
	captionSize: "small" | "medium" | "large" = "large",
) {
	return {
		version: 1,
		taskType: "edit_execution",
		confirmedAt: "2026-06-26T00:00:00.000Z",
		source: "codecut_setup_confirmation",
		timelinePreferences: {
			aspectRatio: "9:16",
			durationGoal: { mode: "auto" },
			durationContract: {
				totalDurationMode: "auto",
				sourceCoverageMode: "selected_segments",
				toleranceSeconds: 0.2,
			},
			transitionPreference: "auto",
			generateIntroCover: true,
			requirements: "Create a clear short video.",
		},
		captionPreferences: {
			language: "auto",
			font: "auto",
			size: captionSize,
			stylePreset: "product-punch",
		},
		exportPreferences: {
			format: "mp4",
			quality: "high",
			includeAudio: true,
		},
		changes: [],
	};
}

describe("codex executor API routes", () => {
	let stateDir: string;
	let previousStateDir: string | undefined;

	beforeEach(async () => {
		previousStateDir = process.env.CODECUT_EXECUTOR_STATE_DIR;
		stateDir = await mkdtemp(join(tmpdir(), "codecut-executor-routes-"));
		process.env.CODECUT_EXECUTOR_STATE_DIR = stateDir;
		process.env.CODECUT_AGENT_BRIDGE_TOKEN = token;
	});

	afterEach(async () => {
		if (previousStateDir === undefined) {
			delete process.env.CODECUT_EXECUTOR_STATE_DIR;
		} else {
			process.env.CODECUT_EXECUTOR_STATE_DIR = previousStateDir;
		}
		await rm(stateDir, { recursive: true, force: true });
	});

	test("creates a project, executes a command, and exposes status", async () => {
		const createResponse = await postProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: { projectId: "project-1", name: "Codex cut" },
			}),
		);

		const commandResponse = await postCommands(
			request({
				url: `${origin}/api/codex-executor/commands`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: {
					envelope: {
						version: 1,
						projectId: "project-1",
						source: "codex",
						commands: [{ id: "cmd-1", tool: "get_project_info", args: {} }],
					},
				},
			}),
		);

		const statusResponse = await getStatus(
			request({
				url: `${origin}/api/codex-executor/status?projectId=project-1`,
				headers: { authorization: `Bearer ${token}` },
			}),
		);

		expect(createResponse.status).toBe(200);
		const createdProject = await createResponse.json();
		expect(createdProject).toMatchObject({
			projectId: "project-1",
		});
		const editorUrl = new URL(createdProject.editorUrl);
		expect(`${editorUrl.origin}${editorUrl.pathname}`).toBe(
			`${expectedEditorBaseUrl()}/en/editor/project-1`,
		);
		expect(editorUrl.hash).toMatch(/^#bridgeToken=.+/);
		expect(commandResponse.status).toBe(200);
		expect(await commandResponse.json()).toMatchObject({
			status: "completed",
			projectId: "project-1",
			results: [{ commandId: "cmd-1", success: true }],
		});
		expect(statusResponse.status).toBe(200);
		expect(await statusResponse.json()).toMatchObject({
			projectId: "project-1",
			status: "succeeded",
			tool: "get_project_info",
		});
	});

	test("creates a project with confirmedSetup", async () => {
		const confirmedSetup = confirmedSetupBody("large");
		const createResponse = await postProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: {
					projectId: "project-setup",
					name: "Setup cut",
					confirmedSetup,
				},
			}),
		);
		const commandResponse = await postCommands(
			request({
				url: `${origin}/api/codex-executor/commands`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: {
					envelope: {
						version: 1,
						projectId: "project-setup",
						source: "codex",
						commands: [{ id: "cmd-1", tool: "get_project_info", args: {} }],
					},
				},
			}),
		);

		expect(createResponse.status).toBe(200);
		expect(await commandResponse.json()).toMatchObject({
			results: [
				{
					success: true,
					data: { confirmedSetup },
				},
			],
		});
	});

	test("rejects invalid confirmedSetup caption size", async () => {
		const invalidConfirmedSetup = {
			...confirmedSetupBody("large"),
			captionPreferences: {
				...confirmedSetupBody("large").captionPreferences,
				size: "huge",
			},
		};

		const response = await postProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: {
					projectId: "project-invalid-setup",
					name: "Invalid setup",
					confirmedSetup: invalidConfirmedSetup,
				},
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Invalid executor project body.",
		});
	});

	test("rejects invalid confirmedSetup task type", async () => {
		const invalidConfirmedSetup = {
			...confirmedSetupBody("large"),
			taskType: "three_video_template",
		};

		const response = await postProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: {
					projectId: "project-invalid-task-type",
					name: "Invalid task type",
					confirmedSetup: invalidConfirmedSetup,
				},
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			error: "Invalid executor project body.",
		});
	});

	test("exposes read-only project snapshots and media bytes for the editor page", async () => {
		const createResponse = await postProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: { projectId: "project-1", name: "Codex cut" },
			}),
		);
		const created = await createResponse.json();
		const bridgeToken = decodeURIComponent(
			new URL(created.editorUrl).hash.replace("#bridgeToken=", ""),
		);

		const importResponse = await postCommands(
			request({
				url: `${origin}/api/codex-executor/commands`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: {
					envelope: {
						version: 1,
						projectId: "project-1",
						source: "codex",
						commands: [
							{
								id: "cmd-1",
								tool: "import_media_file",
								args: {
									fileName: "clip.mp4",
									mimeType: "video/mp4",
									base64: Buffer.from("video bytes").toString("base64"),
									size: Buffer.byteLength("video bytes"),
									lastModified: 1,
									duration: 10,
									width: 1920,
									height: 1080,
								},
							},
						],
					},
				},
			}),
		);
		const imported = await importResponse.json();
		const mediaId = imported.results[0].data.assets[0].id;

		const projectResponse = await getProject(
			request({
				url: `${origin}/api/codex-executor/project?projectId=project-1`,
				headers: { "x-codecut-editor-bridge-token": bridgeToken },
			}),
		);
		const mediaResponse = await getMedia(
			request({
				url: `${origin}/api/codex-executor/media?projectId=project-1&mediaId=${mediaId}`,
				headers: { "x-codecut-editor-bridge-token": bridgeToken },
			}),
		);
		const statusResponse = await getStatus(
			request({
				url: `${origin}/api/codex-executor/status?projectId=project-1`,
				headers: { "x-codecut-editor-bridge-token": bridgeToken },
			}),
		);

		expect(projectResponse.status).toBe(200);
		expect(await projectResponse.json()).toMatchObject({
			project: { id: "project-1", name: "Codex cut" },
			mediaAssets: [
				{
					id: mediaId,
					name: "clip.mp4",
					url: `/api/codex-executor/media?projectId=project-1&mediaId=${mediaId}`,
				},
			],
		});
		expect(mediaResponse.status).toBe(200);
		expect(mediaResponse.headers.get("content-type")).toBe("video/mp4");
		expect(await mediaResponse.text()).toBe("video bytes");
		expect(statusResponse.status).toBe(200);
		expect(await statusResponse.json()).toMatchObject({
			projectId: "project-1",
			status: "succeeded",
		});
	});

	test("lists renames and deletes executor projects", async () => {
		await postProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: { projectId: "project-1", name: "Codex cut" },
			}),
		);

		const listBeforeResponse = await getProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		const renameResponse = await patchProject(
			request({
				url: `${origin}/api/codex-executor/project`,
				method: "PATCH",
				headers: { authorization: `Bearer ${token}` },
				body: { projectId: "project-1", name: "Renamed cut" },
			}),
		);
		const renamedResponse = await getProject(
			request({
				url: `${origin}/api/codex-executor/project?projectId=project-1`,
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		const deleteResponse = await deleteProject(
			request({
				url: `${origin}/api/codex-executor/project`,
				method: "DELETE",
				headers: { authorization: `Bearer ${token}` },
				body: { projectId: "project-1" },
			}),
		);
		const listAfterResponse = await getProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				headers: { authorization: `Bearer ${token}` },
			}),
		);

		expect(listBeforeResponse.status).toBe(200);
		expect(await listBeforeResponse.json()).toMatchObject({
			projects: [{ projectId: "project-1", name: "Codex cut" }],
		});
		expect(renameResponse.status).toBe(200);
		expect(await renameResponse.json()).toMatchObject({
			projectId: "project-1",
			name: "Renamed cut",
		});
		expect(await renamedResponse.json()).toMatchObject({
			project: { id: "project-1", name: "Renamed cut" },
		});
		expect(deleteResponse.status).toBe(200);
		expect(await deleteResponse.json()).toEqual({ projectId: "project-1" });
		expect(await listAfterResponse.json()).toEqual({ projects: [] });
	});

	test("rejects command execution without the local bridge token", async () => {
		const response = await postCommands(
			request({
				url: `${origin}/api/codex-executor/commands`,
				method: "POST",
				body: { envelope: {} },
			}),
		);

		expect(response.status).toBe(401);
	});

	test("returns a uniform unauthorized response for unknown browser bridge projects", async () => {
		const response = await getProject(
			request({
				url: `${origin}/api/codex-executor/project?projectId=missing-project`,
				headers: { "x-codecut-editor-bridge-token": "wrong-token" },
			}),
		);

		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "Unauthorized" });
	});

	test("rejects executor readback without the local bridge token", async () => {
		await postProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: { projectId: "project-1", name: "Codex cut" },
			}),
		);

		const importResponse = await postCommands(
			request({
				url: `${origin}/api/codex-executor/commands`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: {
					envelope: {
						version: 1,
						projectId: "project-1",
						source: "codex",
						commands: [
							{
								id: "cmd-1",
								tool: "import_media_file",
								args: {
									fileName: "clip.mp4",
									mimeType: "video/mp4",
									base64: Buffer.from("video bytes").toString("base64"),
									size: Buffer.byteLength("video bytes"),
									lastModified: 1,
									duration: 10,
									width: 1920,
									height: 1080,
								},
							},
						],
					},
				},
			}),
		);
		const imported = await importResponse.json();
		const mediaId = imported.results[0].data.assets[0].id;

		const statusResponse = await getStatus(
			request({
				url: `${origin}/api/codex-executor/status?projectId=project-1`,
			}),
		);
		const projectResponse = await getProject(
			request({
				url: `${origin}/api/codex-executor/project?projectId=project-1`,
			}),
		);
		const mediaResponse = await getMedia(
			request({
				url: `${origin}/api/codex-executor/media?projectId=project-1&mediaId=${mediaId}`,
			}),
		);

		expect(statusResponse.status).toBe(401);
		expect(projectResponse.status).toBe(401);
		expect(mediaResponse.status).toBe(401);
	});

	test("fails fast when status.json has appended corruption", async () => {
		await postProjects(
			request({
				url: `${origin}/api/codex-executor/projects`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: { projectId: "project-1", name: "Codex cut" },
			}),
		);
		const statusPath = join(stateDir, "projects", "project-1", "status.json");
		const originalStatus = await readFile(statusPath, "utf8");
		await writeFile(
			statusPath,
			`${originalStatus}\n  "revision": 5\n}\n`,
			"utf8",
		);

		const statusResponse = await getStatus(
			request({
				url: `${origin}/api/codex-executor/status?projectId=project-1`,
				headers: { authorization: `Bearer ${token}` },
			}),
		);
		const commandResponse = await postCommands(
			request({
				url: `${origin}/api/codex-executor/commands`,
				method: "POST",
				headers: { authorization: `Bearer ${token}` },
				body: {
					envelope: {
						version: 1,
						projectId: "project-1",
						source: "codex",
						commands: [{ id: "cmd-1", tool: "get_project_info", args: {} }],
					},
				},
			}),
		);

		expect(statusResponse.status).toBe(500);
		expect(await statusResponse.json()).toMatchObject({
			error: expect.stringContaining("status.json"),
		});
		expect(commandResponse.status).toBe(500);
		expect(await commandResponse.json()).toMatchObject({
			error: expect.stringContaining("status.json"),
		});
	});
});
