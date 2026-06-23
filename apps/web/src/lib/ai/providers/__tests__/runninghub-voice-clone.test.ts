import { describe, expect, test } from "bun:test";
import {
	buildRunningHubVoiceCloneSubmitBody,
	extractRunningHubVoiceCloneAudioUrl,
	normalizeRunningHubVoiceCloneStatus,
} from "../runninghub-voice-clone";
import {
	queryRunningHubVoiceCloneTask,
	submitRunningHubVoiceCloneTask,
} from "../runninghub-voice-clone-server";

describe("RunningHub voice clone provider", () => {
	test("builds the fixed voice clone AI App nodeInfoList from reference audio inputs", () => {
		expect(
			buildRunningHubVoiceCloneSubmitBody({
				audioFileName:
					"aad017976ff6034453e1ba9d3106d587868bf69763952b063cacc4bcbd2e8856.mp3",
				text: "智慧的家应该什么样子。\n感到热的时候。\n可以用语音唤醒空调。",
			}),
		).toEqual({
			nodeInfoList: [
				{
					nodeId: "17",
					fieldName: "audio",
					fieldValue:
						"aad017976ff6034453e1ba9d3106d587868bf69763952b063cacc4bcbd2e8856.mp3",
					description: "音频",
				},
				{
					nodeId: "24",
					fieldName: "text",
					fieldValue: "智慧的家应该什么样子。\n感到热的时候。\n可以用语音唤醒空调。",
					description: "文稿",
				},
			],
			instanceType: "default",
			usePersonalQueue: "false",
		});
	});

	test("maps RunningHub voice clone task statuses to Codecut task statuses", () => {
		expect(normalizeRunningHubVoiceCloneStatus({ status: "QUEUED" })).toBe(
			"pending",
		);
		expect(normalizeRunningHubVoiceCloneStatus({ status: "RUNNING" })).toBe(
			"running",
		);
		expect(normalizeRunningHubVoiceCloneStatus({ status: "SUCCESS" })).toBe(
			"succeeded",
		);
		expect(normalizeRunningHubVoiceCloneStatus({ status: "FAILED" })).toBe(
			"failed",
		);
	});

	test("fails fast for missing reference audio and text", async () => {
		await expect(
			submitRunningHubVoiceCloneTask({
				apiKey: "rh-key",
				audioFileName: "",
				request: {
					text: "把肩膀沉下来，深呼吸。",
				},
			}),
		).rejects.toThrow("Reference audio upload file name is required");
		await expect(
			submitRunningHubVoiceCloneTask({
				apiKey: "rh-key",
				audioFileName: "openapi/ref.wav",
				request: {
					text: "   ",
				},
			}),
		).rejects.toThrow("Voice text is required");
	});

	test("submits the independent voice clone AI App through the v2 run contract", async () => {
		const request = {
			text: "把肩膀沉下来，深呼吸。",
		};
		const calls: Array<{ url: string; init?: RequestInit }> = [];

		const result = await submitRunningHubVoiceCloneTask({
			apiKey: "rh-key",
			audioFileName: "openapi/ref.wav",
			request,
			fetchImpl: async (url, init) => {
				calls.push({ url: String(url), init });
				return new Response(
					JSON.stringify({
						taskId: "voice-clone-task-1",
						status: "QUEUED",
						errorCode: "",
						errorMessage: "",
						results: null,
					}),
				);
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe(
			"https://www.runninghub.cn/openapi/v2/run/ai-app/2067079167992229890",
		);
		expect(calls[0].init?.headers).toMatchObject({
			Authorization: "Bearer rh-key",
			"Content-Type": "application/json",
		});
		const body = JSON.parse(String(calls[0].init?.body));
		expect(body).toMatchObject({
			instanceType: "default",
			usePersonalQueue: "false",
		});
		expect(body).not.toHaveProperty("webappId");
		expect(body).not.toHaveProperty("apiKey");
		expect(body.nodeInfoList).toEqual(
			buildRunningHubVoiceCloneSubmitBody({
				audioFileName: "openapi/ref.wav",
				...request,
			}).nodeInfoList,
		);
		expect(result).toEqual({
			taskId: "voice-clone-task-1",
			status: "pending",
		});
	});

	test("extracts audio result URL and fails when no audio result exists", () => {
		expect(
			extractRunningHubVoiceCloneAudioUrl({
				results: [
					{ url: "https://example.com/preview.png", outputType: "png" },
					{ url: "https://example.com/voice.wav", outputType: "wav" },
				],
			}),
		).toBe("https://example.com/voice.wav");

		expect(() =>
			extractRunningHubVoiceCloneAudioUrl({
				results: [
					{ url: "https://example.com/result.mp4", outputType: "mp4" },
				],
			}),
		).toThrow("RunningHub task succeeded without an audio result");
	});

	test("query extracts the cloned audio URL from successful RunningHub results", async () => {
		const result = await queryRunningHubVoiceCloneTask({
			apiKey: "rh-key",
			taskId: "voice-clone-task-1",
			fetchImpl: async () =>
				new Response(
					JSON.stringify({
						taskId: "voice-clone-task-1",
						status: "SUCCESS",
						results: [
							{
								url: "https://example.com/cloned.wav",
								outputType: "wav",
							},
						],
					}),
				),
		});

		expect(result).toEqual({
			taskId: "voice-clone-task-1",
			status: "succeeded",
			audioUrl: "https://example.com/cloned.wav",
		});
	});

	test("query treats blank RunningHub errorCode as a non-error pending task", async () => {
		const result = await queryRunningHubVoiceCloneTask({
			apiKey: "rh-key",
			taskId: "voice-clone-task-1",
			fetchImpl: async () =>
				new Response(
					JSON.stringify({
						taskId: "voice-clone-task-1",
						status: "RUNNING",
						errorCode: "",
						errorMessage: "",
						results: null,
					}),
				),
		});

		expect(result).toEqual({
			taskId: "voice-clone-task-1",
			status: "running",
		});
	});

	test("query fails fast when a successful RunningHub result contains no audio", async () => {
		await expect(
			queryRunningHubVoiceCloneTask({
				apiKey: "rh-key",
				taskId: "voice-clone-task-1",
				fetchImpl: async () =>
					new Response(
						JSON.stringify({
							taskId: "voice-clone-task-1",
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
});
