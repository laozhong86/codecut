import { describe, expect, test } from "bun:test";
import {
	buildRunningHubDigitalHumanSubmitBody,
	extractRunningHubDigitalHumanVideoUrl,
	normalizeRunningHubDigitalHumanStatus,
} from "../runninghub-digital-human";
import {
	downloadRunningHubVideo,
	queryRunningHubDigitalHumanTask,
	submitRunningHubDigitalHumanTask,
	uploadRunningHubMediaFile,
} from "../runninghub-digital-human-server";

describe("RunningHub digital human provider", () => {
	test("builds the fixed AI App nodeInfoList from generation inputs", () => {
		expect(
			buildRunningHubDigitalHumanSubmitBody({
				imageFileName: "portrait.png",
				audioFileName: "voice.mp3",
				scriptText: "欢迎来到今天的口播",
				motionPrompt: "女人自然点头微笑",
				width: 1280,
				height: 720,
				fps: 25,
			}),
		).toEqual({
			nodeInfoList: [
				{
					nodeId: "54",
					fieldName: "value",
					fieldValue: "1280",
					description: "宽",
				},
				{
					nodeId: "55",
					fieldName: "value",
					fieldValue: "720",
					description: "高",
				},
				{
					nodeId: "182",
					fieldName: "value",
					fieldValue: "25",
					description: "帧率",
				},
				{
					nodeId: "17",
					fieldName: "image",
					fieldValue: "portrait.png",
					description: "图",
				},
				{
					nodeId: "156",
					fieldName: "audio",
					fieldValue: "voice.mp3",
					description: "参考音频",
				},
				{
					nodeId: "230",
					fieldName: "text",
					fieldValue: "欢迎来到今天的口播",
					description: "说话内容",
				},
				{
					nodeId: "58",
					fieldName: "text",
					fieldValue: "女人自然点头微笑",
					description: "提示词",
				},
			],
			instanceType: "default",
			usePersonalQueue: "false",
		});
	});

	test("maps RunningHub task statuses to Codecut task statuses", () => {
		expect(normalizeRunningHubDigitalHumanStatus({ status: "QUEUED" })).toBe(
			"pending",
		);
		expect(normalizeRunningHubDigitalHumanStatus({ status: "RUNNING" })).toBe(
			"running",
		);
		expect(normalizeRunningHubDigitalHumanStatus({ status: "SUCCESS" })).toBe(
			"succeeded",
		);
		expect(normalizeRunningHubDigitalHumanStatus({ status: "FAILED" })).toBe(
			"failed",
		);
		expect(normalizeRunningHubDigitalHumanStatus({ status: "succeeded" })).toBe(
			"succeeded",
		);
		expect(normalizeRunningHubDigitalHumanStatus({ status: "failed" })).toBe(
			"failed",
		);
	});

	test("extracts the mp4 result URL and fails when no mp4 result exists", () => {
		expect(
			extractRunningHubDigitalHumanVideoUrl({
				results: [
					{ url: "https://example.com/preview.png", outputType: "png" },
					{ url: "https://example.com/result.mp4", outputType: "mp4" },
				],
			}),
		).toBe("https://example.com/result.mp4");

		expect(() =>
			extractRunningHubDigitalHumanVideoUrl({
				results: [{ url: "https://example.com/preview.png", outputType: "png" }],
			}),
		).toThrow("RunningHub task succeeded without an mp4 result");
	});

	test("fails fast when RunningHub upload fails", async () => {
		await expect(
			uploadRunningHubMediaFile({
				apiKey: "rh-key",
				file: new File(["image"], "portrait.png", { type: "image/png" }),
				fetchImpl: async () =>
					new Response(JSON.stringify({ message: "upload failed" }), {
						status: 500,
					}),
			}),
		).rejects.toThrow("upload failed");
	});

	test("uses RunningHub uploaded filename before signed download URLs", async () => {
		await expect(
			uploadRunningHubMediaFile({
				apiKey: "rh-key",
				file: new File(["image"], "portrait.png", { type: "image/png" }),
				fetchImpl: async () =>
					new Response(
						JSON.stringify({
							data: {
								filename: "api/portrait-uploaded.png",
								download_url: "https://www.runninghub.cn/temp/portrait.png",
							},
						}),
					),
			}),
		).resolves.toBe("api/portrait-uploaded.png");
	});

	test("fails fast when RunningHub submit fails", async () => {
		await expect(
			submitRunningHubDigitalHumanTask({
				apiKey: "rh-key",
				imageFileName: "portrait.png",
				audioFileName: "voice.mp3",
				request: {
					imageMediaId: "image-1",
					audioMediaId: "audio-1",
					scriptText: "欢迎来到今天的口播",
					motionPrompt: "女人自然点头微笑",
					width: 1280,
					height: 720,
					fps: 25,
				},
				fetchImpl: async () =>
					new Response(JSON.stringify({ errorMessage: "submit failed" }), {
						status: 400,
					}),
			}),
		).rejects.toThrow("submit failed");
	});

	test("submits the digital human AI App through the webapp run contract", async () => {
		const request = {
			imageMediaId: "image-1",
			audioMediaId: "audio-1",
			scriptText: "欢迎来到今天的口播",
			motionPrompt: "女人自然点头微笑",
			width: 1280,
			height: 720,
			fps: 25,
		};
		const calls: Array<{ url: string; init?: RequestInit }> = [];

		const result = await submitRunningHubDigitalHumanTask({
			apiKey: "rh-key",
			imageFileName: "portrait.png",
			audioFileName: "voice.mp3",
			request,
			fetchImpl: async (url, init) => {
				calls.push({ url: String(url), init });
				return new Response(
					JSON.stringify({
						code: 0,
						msg: "success",
						data: {
							taskId: "task-1",
							taskStatus: "RUNNING",
						},
					}),
				);
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(
			"https://www.runninghub.cn/task/openapi/ai-app/run",
		);
		expect(calls[0].init?.headers).toMatchObject({
			Authorization: "Bearer rh-key",
			"Content-Type": "application/json",
		});
		const body = JSON.parse(String(calls[0].init?.body));
		expect(body).toMatchObject({
			webappId: "2052014238952108033",
			instanceType: "default",
			usePersonalQueue: "false",
		});
		expect(body.nodeInfoList).toEqual(
			buildRunningHubDigitalHumanSubmitBody({
				imageFileName: "portrait.png",
				audioFileName: "voice.mp3",
				scriptText: request.scriptText,
				motionPrompt: request.motionPrompt,
				width: request.width,
				height: request.height,
				fps: request.fps,
			}).nodeInfoList,
		);
		expect(result).toEqual({
			taskId: "task-1",
			status: "running",
		});
	});

	test("fails fast when RunningHub query returns an app-level error", async () => {
		await expect(
			queryRunningHubDigitalHumanTask({
				apiKey: "rh-key",
				taskId: "task-1",
				fetchImpl: async () =>
					new Response(
						JSON.stringify({
							code: 804,
							msg: "task not found",
							data: null,
						}),
					),
			}),
		).rejects.toThrow("task not found");
	});

	test("fails fast when RunningHub query returns an errorCode payload", async () => {
		await expect(
			queryRunningHubDigitalHumanTask({
				apiKey: "rh-key",
				taskId: "expired-task",
				fetchImpl: async () =>
					new Response(
						JSON.stringify({
							taskId: "expired-task",
							status: null,
							errorCode: 804,
							errorMessage: "Task not found",
							failedReason: "",
							results: [],
						}),
					),
			}),
		).rejects.toThrow("Task not found");
	});

	test("fails fast when RunningHub query succeeds without an mp4 result", async () => {
		await expect(
			queryRunningHubDigitalHumanTask({
				apiKey: "rh-key",
				taskId: "task-1",
				fetchImpl: async () =>
					new Response(
						JSON.stringify({
							taskId: "task-1",
							status: "SUCCESS",
							results: [
								{
									url: "https://example.com/preview.png",
									outputType: "png",
								},
							],
						}),
					),
			}),
		).rejects.toThrow("RunningHub task succeeded without an mp4 result");
	});

	test("downloads video results with RunningHub host, redirect, type, and size guards", async () => {
		await expect(
			downloadRunningHubVideo({
				videoUrl: "https://example.com/result.mp4",
				fetchImpl: async () => new Response("video", { status: 200 }),
			}),
		).rejects.toThrow("RunningHub result URL host is not allowed");

		await expect(
			downloadRunningHubVideo({
				videoUrl: "https://www.runninghub.cn/output/result.mp4",
				fetchImpl: async () => new Response("video", { status: 200 }),
			}),
		).rejects.toThrow("RunningHub result URL host is not allowed");

		await expect(
			downloadRunningHubVideo({
				videoUrl:
					"https://rh-images-attacker.cos.ap-beijing.myqcloud.com/output/result.mp4",
				fetchImpl: async () => new Response("video", { status: 200 }),
			}),
		).rejects.toThrow("RunningHub result URL host is not allowed");

		await expect(
			downloadRunningHubVideo({
				videoUrl:
					"https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.mp4",
				fetchImpl: async () =>
					new Response(null, {
						status: 302,
						headers: { location: "http://127.0.0.1/private" },
					}),
			}),
		).rejects.toThrow("RunningHub result download redirects are not allowed");

		await expect(
			downloadRunningHubVideo({
				videoUrl:
					"https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.mp4",
				fetchImpl: async () =>
					new Response("not-video", {
						headers: { "content-type": "text/plain" },
					}),
			}),
		).rejects.toThrow("RunningHub result download returned a non-video file");

		await expect(
			downloadRunningHubVideo({
				videoUrl:
					"https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.mp4",
				fetchImpl: async () =>
					new Response("video", {
						headers: {
							"content-type": "video/mp4",
							"content-length": String(513 * 1024 * 1024),
						},
					}),
			}),
		).rejects.toThrow("RunningHub result video exceeds the maximum size");
	});
});
