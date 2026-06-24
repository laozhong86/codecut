"use client";

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	DEFAULT_RESOLVED_THEME,
	DEFAULT_THEME,
	THEME_OPTIONS,
	THEME_STORAGE_KEY,
	buildThemeInitScript,
	type ResolvedTheme,
	type Theme,
	type ThemeAttribute,
} from "./theme-script";

export { buildThemeInitScript };

interface ThemeProviderProps {
	attribute?: ThemeAttribute;
	children: React.ReactNode;
	defaultTheme?: Theme;
	disableTransitionOnChange?: boolean;
	enableColorScheme?: boolean;
	enableSystem?: boolean;
	storageKey?: string;
	themes?: ResolvedTheme[];
}

interface ThemeContextValue {
	forcedTheme?: Theme;
	resolvedTheme: ResolvedTheme;
	setTheme: (theme: Theme) => void;
	systemTheme: ResolvedTheme;
	theme: Theme;
	themes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
	if (typeof window === "undefined") return DEFAULT_RESOLVED_THEME;

	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function isTheme(value: string | null): value is Theme {
	return value === "light" || value === "dark" || value === "system";
}

function getStoredTheme({
	defaultTheme,
	storageKey,
}: {
	defaultTheme: Theme;
	storageKey: string;
}): Theme {
	if (typeof window === "undefined") return defaultTheme;

	const storedTheme = window.localStorage.getItem(storageKey);
	if (!isTheme(storedTheme)) return defaultTheme;
	return storedTheme;
}

function resolveTheme({
	enableSystem,
	systemTheme,
	theme,
}: {
	enableSystem: boolean;
	systemTheme: ResolvedTheme;
	theme: Theme;
}): ResolvedTheme {
	if (theme === "system") {
		return enableSystem ? systemTheme : DEFAULT_RESOLVED_THEME;
	}

	return theme;
}

function disableTransitions() {
	const style = document.createElement("style");
	style.appendChild(
		document.createTextNode(
			"*,*::before,*::after{transition:none!important}",
		),
	);
	document.head.appendChild(style);
	window.getComputedStyle(document.body);

	return () => {
		window.setTimeout(() => {
			document.head.removeChild(style);
		}, 1);
	};
}

function applyTheme({
	attribute,
	disableTransitionOnChange,
	enableColorScheme,
	resolvedTheme,
	themes,
}: {
	attribute: ThemeAttribute;
	disableTransitionOnChange: boolean;
	enableColorScheme: boolean;
	resolvedTheme: ResolvedTheme;
	themes: ResolvedTheme[];
}) {
	const restoreTransitions = disableTransitionOnChange ? disableTransitions() : null;
	const root = document.documentElement;

	if (attribute === "class") {
		root.classList.remove(...themes);
		root.classList.add(resolvedTheme);
	} else {
		root.setAttribute(attribute, resolvedTheme);
	}

	if (enableColorScheme) {
		root.style.colorScheme = resolvedTheme;
	}

	restoreTransitions?.();
}

export function ThemeProvider({
	attribute = "class",
	children,
	defaultTheme = DEFAULT_THEME,
	disableTransitionOnChange = false,
	enableColorScheme = true,
	enableSystem = true,
	storageKey = THEME_STORAGE_KEY,
	themes = THEME_OPTIONS,
}: ThemeProviderProps) {
	const [theme, setThemeState] = useState<Theme>(() =>
		getStoredTheme({ defaultTheme, storageKey }),
	);
	const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
		getSystemTheme(),
	);

	const resolvedTheme = resolveTheme({ enableSystem, systemTheme, theme });

	const setTheme = useCallback(
		(nextTheme: Theme) => {
			if (!isTheme(nextTheme)) {
				throw new Error(`Unsupported theme: ${nextTheme}`);
			}

			window.localStorage.setItem(storageKey, nextTheme);
			setThemeState(nextTheme);
		},
		[storageKey],
	);

	useEffect(() => {
		applyTheme({
			attribute,
			disableTransitionOnChange,
			enableColorScheme,
			resolvedTheme,
			themes,
		});
	}, [
		attribute,
		disableTransitionOnChange,
		enableColorScheme,
		resolvedTheme,
		themes,
	]);

	useEffect(() => {
		if (!enableSystem) return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = () => {
			setSystemTheme(getSystemTheme());
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => {
			mediaQuery.removeEventListener("change", handleChange);
		};
	}, [enableSystem]);

	useEffect(() => {
		const handleStorage = (event: StorageEvent) => {
			if (event.key !== storageKey) return;
			setThemeState(isTheme(event.newValue) ? event.newValue : defaultTheme);
		};

		window.addEventListener("storage", handleStorage);
		return () => {
			window.removeEventListener("storage", handleStorage);
		};
	}, [defaultTheme, storageKey]);

	const value = useMemo<ThemeContextValue>(
		() => ({
			resolvedTheme,
			setTheme,
			systemTheme,
			theme,
			themes: enableSystem ? [...themes, "system"] : themes,
		}),
		[enableSystem, resolvedTheme, setTheme, systemTheme, theme, themes],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used within ThemeProvider.");
	}

	return context;
}
