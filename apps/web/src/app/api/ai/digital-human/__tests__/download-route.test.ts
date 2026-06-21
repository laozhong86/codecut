import { describe, expect, test } from "bun:test";
import {
	assertAllowedRunningHubUrl,
	downloadRunningHubResult,
} from "../download/route";

describe("digital human result download route", () => {
	test("accepts RunningHub result hosts", () => {
		expect(
			assertAllowedRunningHubUrl({
				url: "https://www.runninghub.cn/output/result.mp4",
			}).hostname,
		).toBe("www.runninghub.cn");
		expect(
			assertAllowedRunningHubUrl({
				url: "https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.mp4",
			}).hostname,
		).toBe("rh-images-1252422369.cos.ap-beijing.myqcloud.com");
	});

	test("rejects non-RunningHub result hosts", () => {
		expect(() =>
			assertAllowedRunningHubUrl({
				url: "http://www.runninghub.cn/output/result.mp4",
			}),
		).toThrow("RunningHub result URL must use HTTPS");
		expect(() =>
			assertAllowedRunningHubUrl({
				url: "https://other-tenant.cos.ap-beijing.myqcloud.com/output/result.mp4",
			}),
		).toThrow("RunningHub result URL host is not allowed");
	});

	test("downloads video results without following redirects", async () => {
		await expect(
			downloadRunningHubResult({
				url: "https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.mp4",
				fetchImpl: async () =>
					new Response(null, {
						status: 302,
						headers: {
							location: "http://127.0.0.1:3000/private",
						},
					}),
			}),
		).rejects.toThrow("RunningHub result download redirects are not allowed");

		const result = await downloadRunningHubResult({
			url: "https://rh-images-1252422369.cos.ap-beijing.myqcloud.com/output/result.mp4",
			fetchImpl: async (_url, init) => {
				expect(init?.redirect).toBe("manual");
				return new Response("video-bytes", {
					headers: { "content-type": "video/mp4" },
				});
			},
		});
		expect(result.contentType).toBe("video/mp4");
		expect(new TextDecoder().decode(result.bytes)).toBe("video-bytes");
	});

	test("rejects non-video result bodies", async () => {
		await expect(
			downloadRunningHubResult({
				url: "https://www.runninghub.cn/output/result.mp4",
				fetchImpl: async () =>
					new Response("not-video", {
						headers: { "content-type": "text/plain" },
					}),
			}),
		).rejects.toThrow("RunningHub result download returned a non-video file");
	});
});
