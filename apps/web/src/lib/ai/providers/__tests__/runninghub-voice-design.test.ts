import { describe, expect, test } from "bun:test";
import {
	buildRunningHubVoiceDesignSubmitBody,
	extractRunningHubVoiceDesignAudioUrl,
	normalizeRunningHubVoiceDesignStatus,
} from "../runninghub-voice-design";
import {
	downloadRunningHubAudio,
	queryRunningHubVoiceDesignTask,
	submitRunningHubVoiceDesignTask,
} from "../runninghub-voice-design-server";

describe("RunningHub voice design provider", () => {
	test("builds the fixed AI App nodeInfoList from voice design inputs", () => {
		expect(
			buildRunningHubVoiceDesignSubmitBody({
				text: "把肩膀沉下来，深呼吸。",
				emotionPrompt: "温柔、低沉、安抚感强的心理咨询师声音",
			}),
		).toEqual({
			nodeInfoList: [
				{
					nodeId: "24",
					fieldName: "text",
					fieldValue: "把肩膀沉下来，深呼吸。",
					description: "语音内容",
				},
				{
					nodeId: "21",
					fieldName: "text",
					fieldValue: "温柔、低沉、安抚感强的心理咨询师声音",
					description: "声音描述",
				},
			],
			instanceType: "default",
			usePersonalQueue: "false",
		});
	});

	test("maps RunningHub voice task statuses to Codecut task statuses", () => {
		expect(normalizeRunningHubVoiceDesignStatus({ status: "QUEUED" })).toBe(
			"pending",
		);
		expect(normalizeRunningHubVoiceDesignStatus({ status: "RUNNING" })).toBe(
			"running",
		);
		expect(normalizeRunningHubVoiceDesignStatus({ status: "SUCCESS" })).toBe(
			"succeeded",
		);
		expect(normalizeRunningHubVoiceDesignStatus({ status: "FAILED" })).toBe(
			"failed",
		);
		expect(normalizeRunningHubVoiceDesignStatus({ status: "succeeded" })).toBe(
			"succeeded",
		);
		expect(normalizeRunningHubVoiceDesignStatus({ status: "failed" })).toBe(
			"failed",
		);
	});

	test("extracts audio result URL and fails when no audio result exists", () => {
		expect(
			extractRunningHubVoiceDesignAudioUrl({
				results: [
					{ url: "https://example.com/preview.png", outputType: "png" },
					{ url: "https://example.com/voice.wav", outputType: "wav" },
				],
			}),
		).toBe("https://example.com/voice.wav");

		expect(() =>
			extractRunningHubVoiceDesignAudioUrl({
				results: [
					{ url: "https://example.com/result.mp4", outputType: "mp4" },
				],
			}),
		).toThrow("RunningHub task succeeded without an audio result");
	});

	test("fails fast when RunningHub voice submit fails", async () => {
		await expect(
			submitRunningHubVoiceDesignTask({
				apiKey: "rh-key",
				request: {
					text: "把肩膀沉下来，深呼吸。",
					emotionPrompt: "温柔、低沉、安抚感强的心理咨询师声音",
				},
				fetchImpl: async () =>
					new Response(JSON.stringify({ errorMessage: "submit failed" }), {
						status: 400,
					}),
			}),
		).rejects.toThrow("submit failed");
	});

	test("submits the voice design AI App through the webapp run contract", async () => {
		const request = {
			text: "把肩膀沉下来，深呼吸。",
			emotionPrompt: "温柔、低沉、安抚感强的心理咨询师声音",
		};
		const calls: Array<{ url: string; init?: RequestInit }> = [];

		const result = await submitRunningHubVoiceDesignTask({
			apiKey: "rh-key",
			request,
			fetchImpl: async (url, init) => {
				calls.push({ url: String(url), init });
				return new Response(
					JSON.stringify({
						code: 0,
						msg: "success",
						data: {
							taskId: "voice-task-1",
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
			webappId: "2049802245339918337",
			apiKey: "rh-key",
			instanceType: "default",
			usePersonalQueue: "false",
		});
		expect(body.nodeInfoList).toEqual(
			buildRunningHubVoiceDesignSubmitBody(request).nodeInfoList,
		);
		expect(result).toEqual({
			taskId: "voice-task-1",
			status: "running",
		});
	});

	test("fails fast when RunningHub voice query returns an app-level error", async () => {
		await expect(
			queryRunningHubVoiceDesignTask({
				apiKey: "rh-key",
				taskId: "voice-task-1",
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

	test("fails fast when RunningHub voice query returns an errorCode payload", async () => {
		await expect(
			queryRunningHubVoiceDesignTask({
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

	test("treats blank RunningHub voice query errorCode as a non-error pending task", async () => {
		const result = await queryRunningHubVoiceDesignTask({
			apiKey: "rh-key",
			taskId: "voice-task-1",
			fetchImpl: async () =>
				new Response(
					JSON.stringify({
						taskId: "voice-task-1",
						status: "RUNNING",
						errorCode: "",
						errorMessage: "",
						results: null,
					}),
				),
		});

		expect(result).toEqual({
			taskId: "voice-task-1",
			status: "running",
		});
	});

	test("fails fast when RunningHub query succeeds without audio", async () => {
		await expect(
			queryRunningHubVoiceDesignTask({
				apiKey: "rh-key",
				taskId: "task-1",
				fetchImpl: async () =>
					new Response(
						JSON.stringify({
							taskId: "task-1",
							status: "SUCCESS",
							results: [
								{
									url: "https://example.com/result.mp4",
									outputType: "mp4",
								},
							],
						}),
					),
			}),
		).rejects.toThrow("RunningHub task succeeded without an audio result");
	});

	test("downloads audio results with RunningHub host, redirect, type, and size guards", async () => {
		await expect(
			downloadRunningHubAudio({
				audioUrl: "https://example.com/result.wav",
				fetchImpl: async () => new Response("audio", { status: 200 }),
			}),
		).rejects.toThrow("RunningHub result URL host is not allowed");

		await expect(
			downloadRunningHubAudio({
				audioUrl: "https://www.runninghub.cn/output/result.wav",
				fetchImpl: async () => new Response("audio", { status: 200 }),
			}),
		).rejects.toThrow("RunningHub result URL host is not allowed");

		await expect(
			downloadRunningHubAudio({
				audioUrl:
					"https://rh-images-attacker.cos.ap-beijing.myqcloud.com/output/result.wav",
				fetchImpl: async () => new Response("audio", { status: 200 }),
			}),
		).rejects.toThrow("RunningHub result URL host is not allowed");

		await expect(
			downloadRunningHubAudio({
				audioUrl:
					"https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.wav",
				fetchImpl: async () =>
					new Response(null, {
						status: 302,
						headers: { location: "http://127.0.0.1/private" },
					}),
			}),
		).rejects.toThrow("RunningHub result download redirects are not allowed");

		await expect(
			downloadRunningHubAudio({
				audioUrl:
					"https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.wav",
				fetchImpl: async () =>
					new Response("not-audio", {
						headers: { "content-type": "text/plain" },
					}),
			}),
		).rejects.toThrow("RunningHub result download returned a non-audio file");

		await expect(
			downloadRunningHubAudio({
				audioUrl:
					"https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.wav",
				fetchImpl: async () =>
					new Response("audio", {
						headers: {
							"content-type": "audio/wav",
							"content-length": String(101 * 1024 * 1024),
						},
					}),
			}),
		).rejects.toThrow("RunningHub result audio exceeds the maximum size");
	});
});
