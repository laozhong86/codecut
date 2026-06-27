import Script from "next/script";
import type { Viewport } from "next";

import "@fontsource/archivo-black/latin-400.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/league-gothic/latin-400.css";
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/oswald/latin-400.css";
import "@fontsource/oswald/latin-700.css";
import "@fontsource/outfit/latin-400.css";
import "@fontsource/outfit/latin-700.css";
import "@fontsource/playfair-display/latin-400.css";
import "@fontsource/playfair-display/latin-700.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/space-mono/latin-400.css";
import "@fontsource/space-mono/latin-700.css";
import "./globals.css";
import { baseMetaData } from "./metadata";
import { BotIdClient } from "botid/client";
import {
	DEFAULT_THEME,
	THEME_INIT_SCRIPT_ID,
	THEME_OPTIONS,
	THEME_STORAGE_KEY,
	buildThemeInitScript,
} from "@/components/providers/theme-script";
import {
	initServerI18n,
	getLocale,
} from "@i18next-toolkit/nextjs-approuter/server";
import { i18nConfig } from "../i18n.config";

export const metadata = baseMetaData;

export const viewport: Viewport = {
	viewportFit: "cover",
};

initServerI18n(i18nConfig);

const protectedRoutes = [
	{
		path: "/none",
		method: "GET",
	},
];

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const locale = await getLocale();

	return (
		<html lang={locale} suppressHydrationWarning>
			<head>
				<BotIdClient protect={protectedRoutes} />
				<Script id={THEME_INIT_SCRIPT_ID} strategy="beforeInteractive">
					{buildThemeInitScript({
						attribute: "class",
						defaultTheme: DEFAULT_THEME,
						enableSystem: true,
						storageKey: THEME_STORAGE_KEY,
						themes: THEME_OPTIONS,
					})}
				</Script>
				<Script
					src="https://app.tianji.dev/tracker.js"
					data-website-id="cmm637ekbb51pbiglgy2s7n6k"
				/>
			</head>
			<body className="font-sans antialiased">{children}</body>
		</html>
	);
}
