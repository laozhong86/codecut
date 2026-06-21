import { describe, expect, test } from "bun:test";
import nextConfig from "../../../../next.config";

describe("Codecut Next server config", () => {
	test("keeps native node renderer packages external to the server bundle", () => {
		expect(nextConfig.serverExternalPackages).toContain("@napi-rs/canvas");
		expect(nextConfig.serverExternalPackages).toContain("@napi-rs/webcodecs");
	});
});
