import { describe, expect, test } from "bun:test";
import {
	assertAllowedRunningHubAudioUrl,
	downloadRunningHubAudioResult,
} from "../download/route";

describe("voice design result download route", () => {
	test("accepts RunningHub audio result hosts", () => {
		expect(
			assertAllowedRunningHubAudioUrl({
				url: "https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.wav",
			}).hostname,
		).toBe("rh-images-1252422369.cos.ap-beijing.myqcloud.com");
	});

	test("rejects non-RunningHub result hosts", () => {
		expect(() =>
			assertAllowedRunningHubAudioUrl({
				url: "http://www.runninghub.cn/output/result.wav",
			}),
		).toThrow("RunningHub result URL must use HTTPS");
		expect(() =>
			assertAllowedRunningHubAudioUrl({
				url: "https://other-tenant.cos.ap-beijing.myqcloud.com/output/result.wav",
			}),
		).toThrow("RunningHub result URL host is not allowed");
		expect(() =>
			assertAllowedRunningHubAudioUrl({
				url: "https://www.runninghub.cn/output/result.wav",
			}),
		).toThrow("RunningHub result URL host is not allowed");
		expect(() =>
			assertAllowedRunningHubAudioUrl({
				url: "https://rh-images-attacker.cos.ap-beijing.myqcloud.com/output/result.wav",
			}),
		).toThrow("RunningHub result URL host is not allowed");
	});

	test("downloads audio results without following redirects", async () => {
		await expect(
			downloadRunningHubAudioResult({
				url: "https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.wav",
				fetchImpl: async () =>
					new Response(null, {
						status: 302,
						headers: {
							location: "http://127.0.0.1:3000/private",
						},
					}),
			}),
		).rejects.toThrow("RunningHub result download redirects are not allowed");

		const result = await downloadRunningHubAudioResult({
			url: "https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.wav",
			fetchImpl: async (_url, init) => {
				expect(init?.redirect).toBe("manual");
				return new Response("audio-bytes", {
					headers: { "content-type": "audio/wav" },
				});
			},
		});
		expect(result.contentType).toBe("audio/wav");
		expect(new TextDecoder().decode(result.bytes)).toBe("audio-bytes");
	});

	test("rejects non-audio result bodies", async () => {
		await expect(
			downloadRunningHubAudioResult({
				url: "https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.wav",
				fetchImpl: async () =>
					new Response("not-audio", {
						headers: { "content-type": "text/plain" },
					}),
			}),
		).rejects.toThrow("RunningHub result download returned a non-audio file");
	});
});
