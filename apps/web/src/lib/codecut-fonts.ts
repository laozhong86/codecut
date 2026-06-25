export const CODECUT_CJK_FONT_FAMILY = "CodecutCJK";
export const CODECUT_YAN_BO_SONG_FONT_FAMILY = "CodecutYanBoSong";
export const CODECUT_WEN_KAI_FONT_FAMILY = "CodecutWenKai";
export const CODECUT_SMILEY_SANS_FONT_FAMILY = "CodecutSmileySans";

export const CODECUT_LOCAL_FONT_PUBLIC_DIRECTORY = "/fonts/codecut-cjk";

export const CODECUT_LOCAL_FONTS = [
	{
		family: CODECUT_YAN_BO_SONG_FONT_FAMILY,
		label: "CodeCut YanBo Song",
		fileName: "MaoKenWangYanBoSong-M.ttf",
		licenseFileName: "MaoKenWangYanBoSong-OFL.txt",
		sourceUrl: "https://www.maoken.com/freefonts/7911.html",
	},
	{
		family: CODECUT_WEN_KAI_FONT_FAMILY,
		label: "CodeCut WenKai",
		fileName: "LXGWWenKai-Regular.ttf",
		licenseFileName: "LXGWWenKai-OFL.txt",
		sourceUrl: "https://github.com/lxgw/LxgwWenKai",
	},
	{
		family: CODECUT_SMILEY_SANS_FONT_FAMILY,
		label: "CodeCut Smiley Sans",
		fileName: "SmileySans-Oblique.ttf",
		licenseFileName: "SmileySans-OFL.txt",
		sourceUrl: "https://github.com/atelier-anchor/smiley-sans",
	},
] as const;

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
	return fontFamily === CODECUT_CJK_FONT_FAMILY || isCodecutLocalFontFamily(fontFamily);
}
