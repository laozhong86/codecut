import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import { getTranslation } from "@i18next-toolkit/nextjs-approuter/server";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const { t } = await getTranslation(locale);
	const title = t("Privacy Policy - Codecut");
	const description = t(
		"Learn how Codecut handles your data and privacy. Our commitment to protecting your information while you edit videos.",
	);

	return {
		title,
		description,
		openGraph: {
			title,
			description,
			type: "website",
		},
	};
}

export default async function PrivacyPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const { t } = await getTranslation(locale);

	return (
		<BasePage
			title={t("Privacy policy")}
			description={t(
				"Learn how we handle your data and privacy. Contact us if you have any questions.",
			)}
		>
			<Accordion type="single" collapsible className="w-full">
				<AccordionItem
					value="quick-summary"
					className="rounded-2xl border px-5"
				>
					<AccordionTrigger className="no-underline!">
						{t("Quick summary")}
					</AccordionTrigger>
					<AccordionContent>
						<h3 className="mb-3 text-lg font-medium">
							{t("Your content stays private and encrypted.")}
						</h3>
						<ol className="list-decimal space-y-2 pl-6">
							<li>
								{t(
									"Basic editing happens locally in your browser - we never see your files",
								)}
							</li>
							<li>
								{t(
									"AI features require encrypted uploads - your content is encrypted before leaving your device",
								)}
							</li>
							<li>
								{t(
									"We only collect your email and basic profile info for your account",
								)}
							</li>
							<li>
								{t("Project data stays on your device, not our servers")}
							</li>
							<li>
								{t(
									"We use analytics to improve the app, but no personal video content is tracked",
								)}
							</li>
							<li>
								{t(
									"You can delete your account anytime and all data gets removed",
								)}
							</li>
							<li>
								{t("We don't sell your data or share it with advertisers")}
							</li>
						</ol>
						<p className="mt-4">
							{t("Questions? Email us at")}{" "}
							<a
								href="mailto:moonrailgun@gmail.com"
								className="text-primary hover:underline"
							>
								moonrailgun@gmail.com
							</a>
						</p>
					</AccordionContent>
				</AccordionItem>
			</Accordion>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("How We Handle Your Content")}
				</h2>
				<p>
					<strong>
						{t("Basic video editing happens locally on your device.")}
					</strong>{" "}
					{t(
						"For standard editing features, we never upload, store, or have access to your video files. Your content remains completely private and under your control.",
					)}
				</p>
				<p>
					<strong>{t("AI features require secure processing:")}</strong>{" "}
					{t(
						"When you choose to use AI features like auto captions, your audio/video content is encrypted on your device before being uploaded to our servers for processing. We use zero-knowledge encryption, meaning we cannot decrypt or view your content.",
					)}
				</p>
				<p>
					{t(
						"After AI processing is complete, the encrypted content is immediately deleted from our servers. Only the results (like generated captions) are returned to your device.",
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("Account Information")}
				</h2>
				<p>{t("When you create an account, we only collect:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>{t("Email address (for account access)")}</li>
					<li>
						{t(
							"Profile information from Google OAuth (if you choose to sign in with Google)",
						)}
					</li>
				</ul>
				<p>
					<strong>
						{t("We do NOT store your projects on our servers.")}
					</strong>{" "}
					{t(
						"All project data, including names, thumbnails, and creation dates, is stored locally in your browser using IndexedDB.",
					)}
				</p>
				<p>
					{t("We use")}{" "}
					<a
						href="https://www.better-auth.com"
						target="_blank"
						rel="noopener"
						className="text-primary hover:underline"
					>
						Better Auth
					</a>{" "}
					{t(
						"for secure authentication and follow industry-standard security practices.",
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("AI Features & Encryption")}
				</h2>
				<p>
					{t(
						"When you use AI-powered features (like auto captions, content analysis, or enhancement tools), your content needs to be processed on our servers. Here's how we protect your privacy:",
					)}
				</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						<strong>{t("Client-side encryption:")}</strong>{" "}
						{t("Your content is encrypted on your device before upload")}
					</li>
					<li>
						<strong>{t("Zero-knowledge processing:")}</strong>{" "}
						{t("We cannot decrypt or view your original content")}
					</li>
					<li>
						<strong>{t("Temporary processing:")}</strong>{" "}
						{t("Encrypted content is deleted immediately after processing")}
					</li>
					<li>
						<strong>{t("Opt-in only:")}</strong>{" "}
						{t("AI features are optional - basic editing remains fully local")}
					</li>
				</ul>
				<p>
					{t(
						"Different AI features may process different types of content (audio for captions, video for analysis, etc.), but all follow the same zero-knowledge encryption approach.",
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("Local Storage & Cookies")}
				</h2>
				<p>{t("We use browser local storage and IndexedDB to:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>{t("Save your projects locally on your device")}</li>
					<li>{t("Remember your editor preferences and settings")}</li>
					<li>{t("Keep you logged in across browser sessions")}</li>
				</ul>
				<p>
					{t(
						"All data stays on your device and can be cleared at any time through your browser settings.",
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("Third-Party Services")}
				</h2>
				<p>{t("Codecut integrates with these services:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						<strong>{t("Google OAuth:")}</strong>{" "}
						{t(
							"For optional Google sign-in (governed by Google's privacy policy)",
						)}
					</li>
					<li>
						<strong>{t("Vercel:")}</strong>{" "}
						{t("For hosting and content delivery")}
					</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">{t("Your Rights")}</h2>
				<p>{t("You have complete control over your data:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						{t("Delete your account and all associated data at any time")}
					</li>
					<li>{t("Export your project data")}</li>
					<li>{t("Clear local storage to remove all saved projects")}</li>
					<li>{t("Contact us with any privacy concerns")}</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("Open Source Transparency")}
				</h2>
				<p>
					{t(
						"Codecut is completely open source. You can review our code, see exactly how we handle data, and even self-host the application if you prefer.",
					)}
				</p>
				<p>
					{t("View our source code on")}{" "}
					<a
						href={SOCIAL_LINKS.github}
						target="_blank"
						rel="noopener"
						className="text-primary hover:underline"
					>
						GitHub
					</a>
					.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">{t("Contact Us")}</h2>
				<p>
					{t("Questions about this privacy policy or how we handle your data?")}
				</p>
				<p>
					{t("Open an issue on our")}{" "}
					<a
						href={`${SOCIAL_LINKS.github}/issues`}
						target="_blank"
						rel="noopener"
						className="text-primary hover:underline"
					>
						{t("GitHub repository")}
					</a>
					{t(", email us at")}{" "}
					<a
						href="mailto:moonrailgun@gmail.com"
						className="text-primary hover:underline"
					>
						moonrailgun@gmail.com
					</a>
					{t(", or reach out on")}{" "}
					<a
						href={SOCIAL_LINKS.x}
						target="_blank"
						rel="noopener"
						className="text-primary hover:underline"
					>
						X (Twitter)
					</a>
					.
				</p>
			</section>

			<Separator />

			<p className="text-muted-foreground text-sm">
				{t("Last updated: July 14, 2025")}
			</p>
		</BasePage>
	);
}
