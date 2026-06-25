import type { Metadata } from "next";
import { SITE_URL } from "@/constants/site-constants";
import { BasePage } from "@/app/base-page";
import { ComparisonTable } from "./comparison-table";
import { ComparisonFAQ } from "./comparison-faq";
import { ComparisonJsonLd } from "./json-ld";
import { GitHubContributeSection } from "@/components/gitHub-contribute-section";
import { getTranslation } from "@i18next-toolkit/nextjs-approuter/server";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const { t } = await getTranslation(locale);
	const description = t(
		"Compare Codecut and CapCut side by side. Codecut is a free, open-source, privacy-first browser video editor — no uploads, no account, no watermarks. See how it stacks up against CapCut.",
	);
	const socialDescription = t(
		"Codecut is a free, open-source, privacy-first alternative to CapCut. Compare features, privacy, pricing, and more.",
	);

	return {
		title: t("Why Not CapCut? Codecut vs CapCut Comparison — Codecut"),
		description,
		alternates: {
			canonical: `${SITE_URL}/why-not-capcut`,
		},
		keywords: [
			"Codecut vs CapCut",
			"CapCut alternative",
			"free CapCut alternative",
			"open source CapCut alternative",
			"CapCut privacy concerns",
			"browser video editor vs CapCut",
			"video editor without watermark",
			"video editor no account required",
			"privacy-first video editor",
			"CapCut open source alternative",
		],
		openGraph: {
			title: t("Why Not CapCut? Codecut vs CapCut — Side-by-Side Comparison"),
			description: socialDescription,
			url: `${SITE_URL}/why-not-capcut`,
			type: "article",
			images: [
				{
					url: "/icon.png",
					width: 512,
					height: 512,
					alt: t("Codecut — CapCut Alternative"),
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: t("Why Not CapCut? Codecut vs CapCut Comparison"),
			description: socialDescription,
		},
	};
}

export default async function WhyNotCapcutPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const { t } = await getTranslation(locale);

	return (
		<BasePage
			title={t("Why not CapCut?")}
			description={t(
				"Codecut is a free, open-source, privacy-first alternative to CapCut. Here's how they compare.",
			)}
		>
			<ComparisonJsonLd locale={locale} />

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-semibold">
					{t(
						"Codecut is a free, open-source video editor that keeps your files on your device",
					)}
				</h2>
				<p className="text-muted-foreground leading-relaxed">
					{t(
						"CapCut is a popular video editor, but it uploads your media to remote servers, requires an account, and is closed-source proprietary software. Codecut takes a different approach: it runs entirely in your browser, your files never leave your device, and the source code is open for anyone to inspect. If you care about privacy, freedom, or simply want a video editor that works without sign-ups and watermarks, Codecut is designed for you.",
					)}
				</p>
			</section>

			<ComparisonTable />

			<section className="flex flex-col gap-4">
				<h2 className="text-2xl font-semibold">
					{t("Who should use Codecut?")}
				</h2>
				<ul className="text-muted-foreground list-disc space-y-2 pl-6 leading-relaxed">
					<li>
						<strong>{t("Privacy-conscious creators")}</strong>{" "}
						{t("who want their media files to stay on their own device.")}
					</li>
					<li>
						<strong>{t("Open-source advocates")}</strong>{" "}
						{t("who prefer transparent, community-driven software.")}
					</li>
					<li>
						<strong>{t("Quick editors")}</strong>{" "}
						{t(
							"who need a video editor without installing software or creating an account.",
						)}
					</li>
					<li>
						<strong>{t("Chromebook and shared-computer users")}</strong>{" "}
						{t("who need a lightweight browser-based editor.")}
					</li>
					<li>
						<strong>{t("AI-first creators")}</strong>{" "}
						{t(
							"who want built-in AI agent, image generation, and audio transcription.",
						)}
					</li>
				</ul>
			</section>

			<ComparisonFAQ />

			<GitHubContributeSection
				title={t("Built by the community")}
				description={t(
					"Codecut is open source and community-driven. Contribute, report issues, or fork it on GitHub.",
				)}
			/>
		</BasePage>
	);
}
