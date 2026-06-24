export interface FontOption {
	value: string;
	label: string;
	category: "system" | "google" | "custom";
	weights?: number[];
	hasClassName?: boolean;
	supportsCjk?: boolean;
}

export type SelectableFontOption = FontOption & { disabled: boolean };

export const FONT_OPTIONS: FontOption[] = [
	// System fonts (always available)
	{ value: "Arial", label: "Arial", category: "system", hasClassName: false },
	{
		value: "Helvetica",
		label: "Helvetica",
		category: "system",
		hasClassName: false,
	},
	{
		value: "Times New Roman",
		label: "Times New Roman",
		category: "system",
		hasClassName: false,
	},
	{
		value: "Georgia",
		label: "Georgia",
		category: "system",
		hasClassName: false,
	},

	// Social caption fonts
	{
		value: "Inter",
		label: "Inter",
		category: "google",
		weights: [400, 700],
		hasClassName: true,
	},
	{
		value: "Roboto",
		label: "Roboto",
		category: "google",
		weights: [400, 700],
		hasClassName: true,
	},
	{
		value: "Poppins",
		label: "Poppins",
		category: "google",
		weights: [400, 700],
		hasClassName: false,
	},
	{
		value: "Montserrat",
		label: "Montserrat",
		category: "google",
		weights: [400, 700],
		hasClassName: false,
	},
	{
		value: "Oswald",
		label: "Oswald",
		category: "google",
		weights: [400, 700],
		hasClassName: false,
	},
	{
		value: "Open Sans",
		label: "Open Sans",
		category: "google",
		hasClassName: true,
	},
	{
		value: "Playfair Display",
		label: "Playfair Display",
		category: "google",
		hasClassName: true,
	},
	{
		value: "Comic Neue",
		label: "Comic Neue",
		category: "google",
		hasClassName: false,
	},
	{
		value: "Noto Sans SC",
		label: "Noto Sans SC",
		category: "google",
		weights: [400, 700],
		hasClassName: false,
		supportsCjk: true,
	},
	{
		value: "Noto Serif SC",
		label: "Noto Serif SC",
		category: "google",
		weights: [400, 700],
		hasClassName: false,
		supportsCjk: true,
	},
	{
		value: "LXGW WenKai",
		label: "LXGW WenKai",
		category: "custom",
		weights: [400, 700],
		hasClassName: false,
		supportsCjk: true,
	},
	{
		value: "Smiley Sans",
		label: "Smiley Sans",
		category: "custom",
		weights: [400, 700],
		hasClassName: false,
		supportsCjk: true,
	},
	{
		value: "ZCOOL KuaiLe",
		label: "ZCOOL KuaiLe",
		category: "google",
		weights: [400],
		hasClassName: false,
		supportsCjk: true,
	},
] as const;

export const DEFAULT_FONT = "Arial";

// Type-safe font family union
export type FontFamily = (typeof FONT_OPTIONS)[number]["value"];

// Helper functions
export const getFontByValue = (value: string): FontOption | undefined =>
	FONT_OPTIONS.find((font) => font.value === value);

export const getGoogleFonts = (): FontOption[] =>
	FONT_OPTIONS.filter((font) => font.category === "google");

export const getSystemFonts = (): FontOption[] =>
	FONT_OPTIONS.filter((font) => font.category === "system");

const CJK_TEXT_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LATIN_TEXT_RE = /\p{Script=Latin}/u;

const CJK_FALLBACK_STACK =
	'"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

const FONT_FALLBACKS: Partial<Record<FontFamily, string>> = {
	"Noto Sans SC": `"Noto Sans SC", ${CJK_FALLBACK_STACK}`,
	"Noto Serif SC": '"Noto Serif SC", "Songti SC", "STSong", SimSun, serif',
	"LXGW WenKai": '"LXGW WenKai", "Kaiti SC", STKaiti, KaiTi, cursive',
	"Smiley Sans": `"Smiley Sans", ${CJK_FALLBACK_STACK}`,
	"ZCOOL KuaiLe": `"ZCOOL KuaiLe", "Heiti SC", ${CJK_FALLBACK_STACK}`,
};

export function hasCjkText({ content }: { content: string }): boolean {
	return CJK_TEXT_RE.test(content);
}

function isPureCjkText({ content }: { content: string }): boolean {
	return hasCjkText({ content }) && !LATIN_TEXT_RE.test(content);
}

export function getFontOptionsForText({
	content,
}: {
	content: string;
}): SelectableFontOption[] {
	if (!isPureCjkText({ content })) {
		return FONT_OPTIONS.map((font) => ({ ...font, disabled: false }));
	}

	const cjkFonts = FONT_OPTIONS.filter((font) => font.supportsCjk).map(
		(font) => ({ ...font, disabled: false }),
	);
	const latinFonts = FONT_OPTIONS.filter((font) => !font.supportsCjk).map(
		(font) => ({ ...font, disabled: true }),
	);

	return [...cjkFonts, ...latinFonts];
}

export function resolveFontFamily({
	fontFamily,
	content = "",
}: {
	fontFamily: string;
	content?: string;
}): string {
	const option = getFontByValue(fontFamily);
	const fallback = option?.value ? FONT_FALLBACKS[option.value] : undefined;
	if (fallback) {
		return fallback;
	}

	if (hasCjkText({ content })) {
		const trimmedFontFamily = fontFamily.trim();
		const quotedFontFamily =
			trimmedFontFamily.includes(",") ||
			/^["'].*["']$/.test(trimmedFontFamily) ||
			!/\s/.test(trimmedFontFamily)
				? trimmedFontFamily
				: JSON.stringify(trimmedFontFamily);

		return `${quotedFontFamily}, ${CJK_FALLBACK_STACK}`;
	}

	return fontFamily;
}
