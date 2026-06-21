import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const rootDir = resolve(import.meta.dir, "../../../../..");
const publicLogo64Path = resolve(
	rootDir,
	"apps/web/public/logos/codecut/png/logo-64.png",
);
const publicLogo192Path = resolve(
	rootDir,
	"apps/web/public/logos/codecut/png/logo-192.png",
);
const publicLogo512Path = resolve(
	rootDir,
	"apps/web/public/logos/codecut/png/logo-512.png",
);
const appIconPath = resolve(rootDir, "apps/web/src/app/icon.png");
const publicSvgPath = resolve(
	rootDir,
	"apps/web/public/logos/codecut/svg/logo.svg",
);
const legacyAppSvgPath = resolve(rootDir, "apps/web/src/app/icon.svg");
const siteConstantsPath = resolve(
	rootDir,
	"apps/web/src/constants/site-constants.ts",
);
const manifestPath = resolve(rootDir, "apps/web/public/manifest.json");
const metadataPath = resolve(rootDir, "apps/web/src/app/metadata.ts");
const middlewarePath = resolve(rootDir, "apps/web/src/middleware.ts");
const headerPath = resolve(rootDir, "apps/web/src/components/header.tsx");
const footerPath = resolve(rootDir, "apps/web/src/components/footer.tsx");
const comparisonTablePath = resolve(
	rootDir,
	"apps/web/src/app/[locale]/why-not-capcut/comparison-table.tsx",
);
const authServerPath = resolve(rootDir, "apps/web/src/lib/auth/server.ts");

const pngSignature = Buffer.from([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function getPngSize(buffer: Buffer) {
	expect(buffer.subarray(0, pngSignature.length)).toEqual(pngSignature);

	return {
		width: buffer.readUInt32BE(16),
		height: buffer.readUInt32BE(20),
	};
}

describe("Codecut brand assets", () => {
	test("ships compressed PNG logo assets sized for each surface", () => {
		const assets = [
			{ path: publicLogo64Path, size: 64, maxBytes: 16_000 },
			{ path: publicLogo192Path, size: 192, maxBytes: 48_000 },
			{ path: publicLogo512Path, size: 512, maxBytes: 160_000 },
			{ path: appIconPath, size: 512, maxBytes: 160_000 },
		];

		for (const asset of assets) {
			const buffer = readFileSync(asset.path);
			const dimensions = getPngSize(buffer);

			expect(dimensions).toEqual({
				width: asset.size,
				height: asset.size,
			});
			expect(statSync(asset.path).size).toBeLessThan(asset.maxBytes);
		}

		const svg = readFileSync(publicSvgPath, "utf8");
		expect(svg).toContain("<title");
		expect(svg).toContain("Codecut");
		expect(svg).toContain("#22D3EE");
		expect(existsSync(legacyAppSvgPath)).toBe(false);
	});

	test("uses Codecut as the visible brand name", () => {
		const siteConstants = readFileSync(siteConstantsPath, "utf8");
		const manifest = readFileSync(manifestPath, "utf8");
		const metadata = readFileSync(metadataPath, "utf8");
		const middleware = readFileSync(middlewarePath, "utf8");
		const header = readFileSync(headerPath, "utf8");
		const footer = readFileSync(footerPath, "utf8");
		const comparisonTable = readFileSync(comparisonTablePath, "utf8");
		const authServer = readFileSync(authServerPath, "utf8");

		expect(siteConstants).toContain('title: "Codecut"');
		expect(siteConstants).toContain('openGraphImage: "/icon.png"');
		expect(siteConstants).toContain(
			'favicon: "/logos/codecut/png/logo-64.png"',
		);
		expect(siteConstants).toContain(
			'DEFAULT_LOGO_URL = "/logos/codecut/png/logo-64.png"',
		);
		expect(manifest).toContain('"name": "Codecut"');
		expect(manifest).toContain('"/logos/codecut/png/logo-192.png"');
		expect(manifest).toContain('"/logos/codecut/png/logo-512.png"');
		expect(metadata).toContain('type: "image/png"');
		expect(metadata).not.toContain("/logos/codecut/svg/logo.svg");
		expect(middleware).toContain("icon.png");
		expect(header).toContain("Codecut");
		expect(header).not.toContain("dark:invert");
		expect(footer).toContain("Codecut");
		expect(footer).not.toContain("dark:invert");
		expect(comparisonTable).toContain("Codecut");
		expect(comparisonTable).not.toContain("CodeCut");
		expect(authServer).toContain('appName: "Codecut"');
		expect(authServer).not.toContain('appName: "CodeCut"');
	});
});
