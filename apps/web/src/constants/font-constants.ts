export interface FontOption {
	value: string;
	label: string;
	category: "system" | "google" | "custom";
	weights?: number[];
	hasClassName?: boolean;
}

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
	},
	{
		value: "Noto Serif SC",
		label: "Noto Serif SC",
		category: "google",
		weights: [400, 700],
		hasClassName: false,
	},
	{
		value: "LXGW WenKai",
		label: "LXGW WenKai",
		category: "custom",
		weights: [400, 700],
		hasClassName: false,
	},
	{
		value: "Smiley Sans",
		label: "Smiley Sans",
		category: "custom",
		weights: [400, 700],
		hasClassName: false,
	},
	{
		value: "ZCOOL KuaiLe",
		label: "ZCOOL KuaiLe",
		category: "google",
		weights: [400],
		hasClassName: false,
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
