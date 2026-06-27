import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync as fileExistsSync } from "node:fs";
import { join } from "node:path";
import {
	CODECUT_CJK_FONT_FAMILY,
	getCodecutFontsourceFontByFamily,
	getCodecutLocalFontByFamily,
	isCodecutRendererFontFamily,
	type CodecutRendererFontFamily,
} from "@/lib/codecut-fonts";

export {
	CODECUT_CJK_FONT_FAMILY,
	CODECUT_FONTSOURCE_FONTS,
	isCodecutFontsourceFontFamily,
	isCodecutRendererFontFamily,
} from "@/lib/codecut-fonts";

export const CODECUT_CJK_FONT_PATH_ENV = "CODECUT_CJK_FONT_PATH";

export const CODECUT_CJK_SYSTEM_FONT_PATHS = [
	"/System/Library/Fonts/PingFang.ttc",
	"/System/Library/Fonts/STHeiti Medium.ttc",
	"/System/Library/Fonts/STHeiti Light.ttc",
	"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
	"/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
	"/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
	"/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
	"C:\\Windows\\Fonts\\msyh.ttc",
	"C:\\Windows\\Fonts\\simhei.ttf",
	"C:\\Windows\\Fonts\\simsun.ttc",
] as const;

export function resolveCodecutCjkFontPaths({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): readonly string[] {
	const configuredPath = env[CODECUT_CJK_FONT_PATH_ENV]?.trim();
	if (configuredPath) return [configuredPath];
	return CODECUT_CJK_SYSTEM_FONT_PATHS;
}

export function resolveCodecutFontFamilyPaths({
	fontFamily,
	cwd = process.cwd(),
	env = process.env,
}: {
	fontFamily: string;
	cwd?: string;
	env?: Record<string, string | undefined>;
}): readonly string[] {
	if (fontFamily === CODECUT_CJK_FONT_FAMILY) {
		return resolveCodecutCjkFontPaths({ env });
	}

	const localFont = getCodecutLocalFontByFamily(fontFamily);
	if (localFont) {
		return [
			join(cwd, "apps/web/public/fonts/codecut-cjk", localFont.fileName),
			join(cwd, "public/fonts/codecut-cjk", localFont.fileName),
		];
	}

	const fontsourceFont = getCodecutFontsourceFontByFamily(fontFamily);
	if (fontsourceFont) {
		return resolveCodecutFontsourcePathGroups({
			fontsourceFont,
			cwd,
		}).flat();
	}

	throw new Error(`Unsupported Codecut caption font family: ${fontFamily}.`);
}

type CodecutFontRegistry = {
	has(familyName: string): boolean;
	registerFromPath(fontPath: string, familyName: string): unknown;
};

export type RegisterCodecutCjkFontResult =
	| {
			family: CodecutRendererFontFamily;
			fontPath: string;
			registered: true;
	  }
	| {
			family: CodecutRendererFontFamily;
			registered: false;
			reason: "already_registered";
	  };

export function registerCodecutFontFamily({
	fontFamily,
	fontPaths,
	existsSync = fileExistsSync,
	globalFonts = GlobalFonts,
	force = false,
}: {
	fontFamily: CodecutRendererFontFamily | string;
	fontPaths?: readonly string[];
	existsSync?: (path: string) => boolean;
	globalFonts?: CodecutFontRegistry;
	force?: boolean;
}): RegisterCodecutCjkFontResult {
	if (!isCodecutRendererFontFamily(fontFamily)) {
		throw new Error(`Unsupported Codecut caption font family: ${fontFamily}.`);
	}

	const family = fontFamily as CodecutRendererFontFamily;
	if (!force && globalFonts.has(family)) {
		return {
			family,
			registered: false,
			reason: "already_registered",
		};
	}

	const fontsourceFont = getCodecutFontsourceFontByFamily(family);
	if (fontsourceFont && fontPaths === undefined) {
		const selectedPaths = resolveCodecutFontsourcePathGroups({
			fontsourceFont,
			cwd: process.cwd(),
		}).map((candidates) => candidates.find((candidate) => existsSync(candidate)));
		const missingIndex = selectedPaths.findIndex((candidate) => !candidate);

		if (missingIndex !== -1) {
			throw new Error(
				`Codecut node renderer requires a registered font file for ${family}. Install one of: ${resolveCodecutFontFamilyPaths({ fontFamily: family }).join(", ")}`,
			);
		}

		for (const selectedPath of selectedPaths) {
			globalFonts.registerFromPath(selectedPath as string, family);
		}

		return {
			family,
			fontPath: selectedPaths[0] as string,
			registered: true,
		};
	}

	const resolvedFontPaths =
		fontPaths ?? resolveCodecutFontFamilyPaths({ fontFamily: family });
	const fontPath = resolvedFontPaths.find((candidate) => existsSync(candidate));
	if (!fontPath) {
		if (family === CODECUT_CJK_FONT_FAMILY) {
			throw new Error(
				`Codecut node renderer requires a CJK font for ${family}. Install one of: ${resolvedFontPaths.join(", ")}`,
			);
		}
		throw new Error(
			`Codecut node renderer requires a registered font file for ${family}. Install one of: ${resolvedFontPaths.join(", ")}`,
		);
	}

	globalFonts.registerFromPath(fontPath, family);
	return {
		family,
		fontPath,
		registered: true,
	};
}

export function registerCodecutCjkFont({
	fontPaths = resolveCodecutCjkFontPaths(),
	existsSync = fileExistsSync,
	globalFonts = GlobalFonts,
}: {
	fontPaths?: readonly string[];
	existsSync?: (path: string) => boolean;
	globalFonts?: CodecutFontRegistry;
} = {}): RegisterCodecutCjkFontResult {
	return registerCodecutFontFamily({
		fontFamily: CODECUT_CJK_FONT_FAMILY,
		fontPaths,
		existsSync,
		globalFonts,
	});
}

function resolveCodecutFontsourcePathGroups({
	fontsourceFont,
	cwd,
}: {
	fontsourceFont: {
		packageName: string;
		fileName: string;
		additionalFiles?: Array<{ fileName: string }>;
	};
	cwd: string;
}): readonly string[][] {
	const fileNames = [
		fontsourceFont.fileName,
		...(fontsourceFont.additionalFiles ?? []).map((file) => file.fileName),
	];
	return fileNames.map((fileName) => [
		join(cwd, "apps/web/node_modules", fontsourceFont.packageName, "files", fileName),
		join(cwd, "node_modules", fontsourceFont.packageName, "files", fileName),
	]);
}
