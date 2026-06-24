export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;
export type ThemeAttribute = "class" | `data-${string}`;

export const THEME_STORAGE_KEY = "theme";
export const DEFAULT_THEME: Theme = "dark";
export const DEFAULT_RESOLVED_THEME: ResolvedTheme = "dark";
export const THEME_INIT_SCRIPT_ID = "codecut-theme-init";
export const THEME_OPTIONS: ResolvedTheme[] = ["light", "dark"];

export interface ThemeInitScriptOptions {
	attribute: ThemeAttribute;
	defaultTheme: Theme;
	enableSystem: boolean;
	storageKey: string;
	themes: ResolvedTheme[];
}

export function buildThemeInitScript({
	attribute,
	defaultTheme,
	enableSystem,
	storageKey,
	themes,
}: ThemeInitScriptOptions) {
	const config = JSON.stringify({
		attribute,
		defaultTheme,
		enableSystem,
		storageKey,
		themes,
	});

	return `
(() => {
  const config = ${config};
  const root = document.documentElement;
  const systemTheme = () =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  let theme = config.defaultTheme;

  try {
    const storedTheme = localStorage.getItem(config.storageKey);
    if (storedTheme === "light" || storedTheme === "dark" || storedTheme === "system") {
      theme = storedTheme;
    }
  } catch {
    theme = config.defaultTheme;
  }

  const resolvedTheme = theme === "system" && config.enableSystem ? systemTheme() : theme;
  if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;

  if (config.attribute === "class") {
    root.classList.remove(...config.themes);
    root.classList.add(resolvedTheme);
  } else {
    root.setAttribute(config.attribute, resolvedTheme);
  }
  root.style.colorScheme = resolvedTheme;
})();
`.trim();
}
