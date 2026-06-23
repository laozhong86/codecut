import { GlobalFonts } from "@napi-rs/canvas";
import { existsSync as fileExistsSync } from "node:fs";
import { CODECUT_CJK_FONT_FAMILY } from "@/lib/codecut-fonts";

export { CODECUT_CJK_FONT_FAMILY } from "@/lib/codecut-fonts";

export const CODECUT_CJK_FONT_PATHS = [
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

type CodecutFontRegistry = {
	has(familyName: string): boolean;
	registerFromPath(fontPath: string, familyName: string): unknown;
};

export type RegisterCodecutCjkFontResult =
	| {
			family: typeof CODECUT_CJK_FONT_FAMILY;
			fontPath: string;
			registered: true;
	  }
	| {
			family: typeof CODECUT_CJK_FONT_FAMILY;
			registered: false;
			reason: "already_registered";
	  };

export function registerCodecutCjkFont({
	fontPaths = CODECUT_CJK_FONT_PATHS,
	existsSync = fileExistsSync,
	globalFonts = GlobalFonts,
}: {
	fontPaths?: readonly string[];
	existsSync?: (path: string) => boolean;
	globalFonts?: CodecutFontRegistry;
} = {}): RegisterCodecutCjkFontResult {
	if (globalFonts.has(CODECUT_CJK_FONT_FAMILY)) {
		return {
			family: CODECUT_CJK_FONT_FAMILY,
			registered: false,
			reason: "already_registered",
		};
	}

	const fontPath = fontPaths.find((candidate) => existsSync(candidate));
	if (!fontPath) {
		throw new Error(
			`Codecut node renderer requires a CJK font for ${CODECUT_CJK_FONT_FAMILY}. Install one of: ${fontPaths.join(", ")}`,
		);
	}

	globalFonts.registerFromPath(fontPath, CODECUT_CJK_FONT_FAMILY);
	return {
		family: CODECUT_CJK_FONT_FAMILY,
		fontPath,
		registered: true,
	};
}
