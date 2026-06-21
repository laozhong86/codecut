import { describe, expect, mock, test } from "bun:test";

class RedirectError extends Error {
	constructor(readonly target: string) {
		super(`Redirected to ${target}`);
	}
}

const redirectCalls: string[] = [];

mock.module("next/navigation", () => ({
	redirect: (href: string) => {
		redirectCalls.push(href);
		throw new RedirectError(href);
	},
}));

const { default: HomePage } = await import("../page");

describe("home page", () => {
	test("redirects visitors to the projects list", async () => {
		redirectCalls.length = 0;

		try {
			await HomePage({
				params: Promise.resolve({ locale: "en" }),
			});
		} catch (error) {
			expect(error).toBeInstanceOf(RedirectError);
		}

		expect(redirectCalls).toEqual(["/en/projects"]);
	});
});
