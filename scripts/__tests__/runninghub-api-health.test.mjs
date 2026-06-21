import { describe, expect, test } from "bun:test";
import {
	buildRunningHubHealthContract,
	buildRunningHubQueryHealthRequest,
	redactSecret,
	runRunningHubHealthCheck,
} from "../runninghub-api-health.mjs";

describe("runninghub api health script", () => {
	test("prints a contract-only report when invoked as a script", async () => {
		const process = Bun.spawn(
			["bun", "scripts/runninghub-api-health.mjs", "--contract-only"],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const stdout = await new Response(process.stdout).text();
		const stderr = await new Response(process.stderr).text();
		const exitCode = await process.exited;

		expect(exitCode).toBe(0);
		expect(stderr).toBe("");
		expect(stdout).toContain("RunningHub API health");
		expect(stdout).toContain("digital human app: 2052014238952108033");
		expect(stdout).toContain("voice design app: 2049802245339918337");
		expect(stdout).toContain("network: skipped (--contract-only)");
	});

	test("builds the fixed digital human and voice design contract summary", () => {
		const contract = buildRunningHubHealthContract();

		expect(contract.digitalHuman).toEqual({
			appId: "2052014238952108033",
			endpoint:
				"https://www.runninghub.cn/openapi/v2/run/ai-app/2052014238952108033",
			nodeInfoList: [
				{ nodeId: "54", fieldName: "value", description: "宽" },
				{ nodeId: "55", fieldName: "value", description: "高" },
				{ nodeId: "182", fieldName: "value", description: "帧率" },
				{ nodeId: "17", fieldName: "image", description: "图" },
				{ nodeId: "156", fieldName: "audio", description: "参考音频" },
				{ nodeId: "230", fieldName: "text", description: "说话内容" },
				{ nodeId: "58", fieldName: "text", description: "提示词" },
			],
		});
		expect(contract.voiceDesign).toEqual({
			appId: "2049802245339918337",
			endpoint:
				"https://www.runninghub.cn/openapi/v2/run/ai-app/2049802245339918337",
			nodeInfoList: [
				{ nodeId: "24", fieldName: "text", description: "语音内容" },
				{ nodeId: "21", fieldName: "text", description: "声音描述" },
			],
		});
	});

	test("builds the cheapest live health request against query only", () => {
		const request = buildRunningHubQueryHealthRequest({
			apiKey: "secret-value",
			taskId: "2009215121247047681",
		});

		expect(request.url).toBe("https://www.runninghub.cn/openapi/v2/query");
		expect(request.init).toMatchObject({
			method: "POST",
			headers: {
				Authorization: "Bearer secret-value",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ taskId: "2009215121247047681" }),
		});
	});

	test("redacts secrets without hiding whether a key exists", () => {
		expect(redactSecret("")).toBe("<missing>");
		expect(redactSecret("abc")).toBe("<redacted:3>");
		expect(redactSecret("1234567890abcdef1234567890abcdef")).toBe(
			"<redacted:32>",
		);
	});

	test("runs a JSON health check without requiring a successful task", async () => {
		const calls = [];
		const result = await runRunningHubHealthCheck({
			apiKey: "secret-value",
			taskId: "2009215121247047681",
			fetchImpl: async (url, init) => {
				calls.push({ url: String(url), init });
				return new Response(
					JSON.stringify({
						code: 804,
						msg: "task not found",
						data: null,
					}),
					{
						status: 200,
						headers: { "content-type": "application/json" },
					},
				);
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://www.runninghub.cn/openapi/v2/query");
		expect(result).toEqual({
			ok: true,
			authOk: true,
			cost: "no generation task submitted",
			request: {
				endpoint: "https://www.runninghub.cn/openapi/v2/query",
				taskId: "2009215121247047681",
				apiKey: "<redacted:12>",
			},
			response: {
				httpStatus: 200,
				json: true,
				keys: ["code", "data", "msg"],
				status: null,
				code: 804,
				message: "task not found",
			},
		});
	});
});
