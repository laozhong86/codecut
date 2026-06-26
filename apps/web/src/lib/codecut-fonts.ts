import codecutFontManifest from "./codecut-fonts.json";

export const CODECUT_CJK_FONT_FAMILY = codecutFontManifest.cjkFontFamily;
export const CODECUT_LOCAL_FONT_PUBLIC_DIRECTORY =
	codecutFontManifest.publicDirectory;

export const CODECUT_LOCAL_FONTS = codecutFontManifest.localFonts;

export const CODECUT_YAN_BO_SONG_FONT_FAMILY = CODECUT_LOCAL_FONTS[0].family;
export const CODECUT_WEN_KAI_FONT_FAMILY = CODECUT_LOCAL_FONTS[1].family;
export const CODECUT_SMILEY_SANS_FONT_FAMILY = CODECUT_LOCAL_FONTS[2].family;

export type CodecutLocalFontFamily =
	(typeof CODECUT_LOCAL_FONTS)[number]["family"];

export type CodecutRendererFontFamily =
	| typeof CODECUT_CJK_FONT_FAMILY
	| CodecutLocalFontFamily;

export function getCodecutLocalFontByFamily(fontFamily: string) {
	return CODECUT_LOCAL_FONTS.find((font) => font.family === fontFamily);
}

export function isCodecutLocalFontFamily(
	fontFamily: string,
): fontFamily is CodecutLocalFontFamily {
	return getCodecutLocalFontByFamily(fontFamily) !== undefined;
}

export function isCodecutRendererFontFamily(
	fontFamily: string,
): fontFamily is CodecutRendererFontFamily {
	return (
		fontFamily === CODECUT_CJK_FONT_FAMILY ||
		isCodecutLocalFontFamily(fontFamily)
	);
}
