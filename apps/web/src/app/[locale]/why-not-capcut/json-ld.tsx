import { SITE_URL } from "@/constants/site-constants";
import { getTranslation } from "@i18next-toolkit/nextjs-approuter/server";

export async function ComparisonJsonLd({ locale }: { locale: string }) {
	const { t } = await getTranslation(locale);

	const faqItems = [
		{
			question: t("Is Codecut a good alternative to CapCut?"),
			answer: t(
				"Yes. Codecut is designed as a free, open-source, privacy-first alternative to CapCut. It offers AI-native editing, multi-track timeline, MP4/WebM export, and runs entirely in your browser — no account, no uploads, no watermarks.",
			),
		},
		{
			question: t("Does Codecut have the same features as CapCut?"),
			answer: t(
				"Codecut covers the core editing features most creators need: multi-track timeline, text and sticker overlays, AI image generation, audio transcription, and caption generation. CapCut offers additional advanced features like effects templates and more export formats, but Codecut is rapidly growing as an open-source project.",
			),
		},
		{
			question: t("Is Codecut really free with no watermarks?"),
			answer: t(
				"Yes. Codecut is 100% free with no premium tiers, no subscriptions, and no watermarks on exported videos. It is open-source software that you can use without any restrictions.",
			),
		},
		{
			question: t("Does CapCut upload my videos to servers?"),
			answer: t(
				"Yes. CapCut requires uploading your media files to remote servers for processing and storage. Codecut takes the opposite approach — all media processing happens locally in your browser and your files never leave your device.",
			),
		},
		{
			question: t("Can I use Codecut without creating an account?"),
			answer: t(
				"Yes. Codecut requires no sign-up or login. Just open the website and start editing immediately. Your projects are saved locally in your browser.",
			),
		},
		{
			question: t("Is Codecut open source?"),
			answer: t(
				"Yes. Codecut is fully open source and available on GitHub. You can inspect the code, contribute, fork it, or self-host it on your own server.",
			),
		},
		{
			question: t(
				"What AI features does Codecut offer compared to CapCut?",
			),
			answer: t(
				"Codecut is AI-native with a built-in AI agent that can edit videos from natural language prompts, AI image generation for creating visuals, and audio transcription for automatic caption generation. These features are integrated into the core editing workflow.",
			),
		},
		{
			question: t("Can I use Codecut on a Chromebook?"),
			answer: t(
				"Yes. Codecut runs entirely in your browser and works on any platform including Chromebooks, shared computers, and tablets — no installation or plugins required.",
			),
		},
	];

	const articleSchema = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: t("Why Not CapCut? Codecut vs CapCut — Side-by-Side Comparison"),
		description: t(
			"Compare Codecut and CapCut side by side. Codecut is a free, open-source, privacy-first browser video editor — no uploads, no account, no watermarks.",
		),
		url: `${SITE_URL}/why-not-capcut`,
		author: {
			"@type": "Organization",
			name: "Codecut",
			url: SITE_URL,
		},
		publisher: {
			"@type": "Organization",
			name: "Codecut",
			url: SITE_URL,
			logo: {
				"@type": "ImageObject",
				url: `${SITE_URL}/logos/codecut/png/logo-512.png`,
			},
		},
		datePublished: "2026-03-10",
		dateModified: new Date().toISOString().split("T")[0],
		mainEntityOfPage: `${SITE_URL}/why-not-capcut`,
	};

	const faqSchema = {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqItems.map((item) => ({
			"@type": "Question",
			name: item.question,
			acceptedAnswer: {
				"@type": "Answer",
				text: item.answer,
			},
		})),
	};

	const comparisonSchema = {
		"@context": "https://schema.org",
		"@type": "ItemList",
		name: "Codecut vs CapCut Comparison",
		description: t(
			"Side-by-side feature comparison between Codecut and CapCut video editors",
		),
		itemListElement: [
			{
				"@type": "ListItem",
				position: 1,
				item: {
					"@type": "SoftwareApplication",
					name: "Codecut",
					applicationCategory: "MultimediaApplication",
					operatingSystem: "Any (Browser-based)",
					offers: {
						"@type": "Offer",
						price: "0",
						priceCurrency: "USD",
					},
					description: t(
						"AI-native, open-source, privacy-first video editor that runs in your browser",
					),
				},
			},
			{
				"@type": "ListItem",
				position: 2,
				item: {
					"@type": "SoftwareApplication",
					name: "CapCut",
					applicationCategory: "MultimediaApplication",
					description: t("Popular video editor by ByteDance"),
				},
			},
		],
	};

	const schemas = [articleSchema, faqSchema, comparisonSchema];

	return (
		<>
			{schemas.map((schema, index) => (
				// biome-ignore lint: JSON-LD requires dangerouslySetInnerHTML
				<script key={index} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
			))}
		</>
	);
}
