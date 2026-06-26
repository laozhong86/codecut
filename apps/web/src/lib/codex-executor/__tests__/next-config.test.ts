import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import nextConfig from "../../../../next.config";

const rootDir = resolve(import.meta.dir, "../../../../../..");

describe("Codecut Next server config", () => {
	test("keeps native node renderer packages external to the server bundle", () => {
		expect(nextConfig.serverExternalPackages).toContain("@napi-rs/canvas");
		expect(nextConfig.serverExternalPackages).toContain("@napi-rs/webcodecs");
	});

	test("pins file tracing and Turbopack to the current repository root", () => {
		expect(nextConfig.outputFileTracingRoot).toBe(rootDir);
		expect(nextConfig.turbopack?.root).toBe(rootDir);
	});
});
