import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

import { buildThemeInitScript } from "../theme-provider";

const rootDir = resolve(import.meta.dir, "../../../../../..");

describe("theme provider", () => {
	test("locale layout uses the local provider instead of next-themes", () => {
		const layoutSource = readFileSync(
			resolve(rootDir, "apps/web/src/app/[locale]/layout.tsx"),
			"utf8",
		);

		expect(layoutSource).toContain("@/components/providers/theme-provider");
		expect(layoutSource).not.toContain("from \"next-themes\"");
	});

	test("local provider source does not render a script tag", () => {
		const providerSource = readFileSync(
			resolve(rootDir, "apps/web/src/components/providers/theme-provider.tsx"),
			"utf8",
		);

		expect(providerSource).not.toContain("createElement(\"script\"");
		expect(providerSource).not.toContain("<script");
	});

	test("theme init script is plain JavaScript for next/script", () => {
		const script = buildThemeInitScript({
			attribute: "class",
			defaultTheme: "dark",
			enableSystem: true,
			storageKey: "theme",
			themes: ["light", "dark"],
		});

		expect(script).toContain("localStorage.getItem");
		expect(script).toContain("document.documentElement");
		expect(script).not.toContain("<script");
	});
});
