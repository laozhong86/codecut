import codecutFontManifest from "./codecut-fonts.json";

export const CODECUT_CJK_FONT_FAMILY = codecutFontManifest.cjkFontFamily;
export const CODECUT_LOCAL_FONT_PUBLIC_DIRECTORY =
	codecutFontManifest.publicDirectory;

export const CODECUT_LOCAL_FONTS = codecutFontManifest.localFonts;
export const CODECUT_FONTSOURCE_FONTS = codecutFontManifest.fontsourceFonts;

export const CODECUT_YAN_BO_SONG_FONT_FAMILY = CODECUT_LOCAL_FONTS[0].family;
export const CODECUT_WEN_KAI_FONT_FAMILY = CODECUT_LOCAL_FONTS[1].family;
export const CODECUT_SMILEY_SANS_FONT_FAMILY = CODECUT_LOCAL_FONTS[2].family;
export const CODECUT_EDITOR_CJK_FONT_FAMILY = CODECUT_YAN_BO_SONG_FONT_FAMILY;
export const CODECUT_INTER_FONT_FAMILY = "Inter";
export const CODECUT_MONTSERRAT_FONT_FAMILY = "Montserrat";
export const CODECUT_OUTFIT_FONT_FAMILY = "Outfit";
export const CODECUT_OSWALD_FONT_FAMILY = "Oswald";
export const CODECUT_ARCHIVO_BLACK_FONT_FAMILY = "Archivo Black";
export const CODECUT_LEAGUE_GOTHIC_FONT_FAMILY = "League Gothic";
export const CODECUT_SPACE_MONO_FONT_FAMILY = "Space Mono";
export const CODECUT_JETBRAINS_MONO_FONT_FAMILY = "JetBrains Mono";
export const CODECUT_PLAYFAIR_DISPLAY_FONT_FAMILY = "Playfair Display";
export const CODECUT_POPPINS_FONT_FAMILY = "Poppins";

export type CodecutLocalFontFamily =
	(typeof CODECUT_LOCAL_FONTS)[number]["family"];
export type CodecutFontsourceFontFamily =
	(typeof CODECUT_FONTSOURCE_FONTS)[number]["family"];

export type CodecutRendererFontFamily =
	| typeof CODECUT_CJK_FONT_FAMILY
	| CodecutLocalFontFamily
	| CodecutFontsourceFontFamily;

export function getCodecutLocalFontByFamily(fontFamily: string) {
	return CODECUT_LOCAL_FONTS.find((font) => font.family === fontFamily);
}

export function getCodecutFontsourceFontByFamily(fontFamily: string) {
	return CODECUT_FONTSOURCE_FONTS.find((font) => font.family === fontFamily);
}

export function isCodecutLocalFontFamily(
	fontFamily: string,
): fontFamily is CodecutLocalFontFamily {
	return getCodecutLocalFontByFamily(fontFamily) !== undefined;
}

export function isCodecutFontsourceFontFamily(
	fontFamily: string,
): fontFamily is CodecutFontsourceFontFamily {
	return getCodecutFontsourceFontByFamily(fontFamily) !== undefined;
}

export function isCodecutRendererFontFamily(
	fontFamily: string,
): fontFamily is CodecutRendererFontFamily {
	return (
		fontFamily === CODECUT_CJK_FONT_FAMILY ||
		isCodecutLocalFontFamily(fontFamily) ||
		isCodecutFontsourceFontFamily(fontFamily)
	);
}
