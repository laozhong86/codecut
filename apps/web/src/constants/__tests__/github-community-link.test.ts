import { describe, expect, test } from "bun:test";

import {
	GITHUB_COMMUNITY_URL,
	SOCIAL_LINKS,
} from "@/constants/site-constants";

describe("GitHub community link", () => {
	test("points to the public project repository and feedback entry", () => {
		expect(SOCIAL_LINKS.github).toBe("https://github.com/laozhong86/codecut");
		expect(GITHUB_COMMUNITY_URL).toBe(
			"https://github.com/laozhong86/codecut/issues",
		);
	});
});
