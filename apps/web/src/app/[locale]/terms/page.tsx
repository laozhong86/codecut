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
	const title = t("Terms of Service - Codecut");
	const description = t(
		"Codecut's Terms of Service. Fair, transparent terms for our free and open-source video editor.",
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

export default async function TermsPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const { t } = await getTranslation(locale);

	return (
		<BasePage
			title={t("Terms of service")}
			description={t(
				"Fair and transparent terms for our free, open-source video editor. Contact us if you have any questions.",
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
							{t("You own your content, we own nothing.")}
						</h3>
						<ol className="list-decimal space-y-2 pl-6">
							<li>
								{t(
									"Your content stays private - basic editing is local, AI features use encrypted uploads",
								)}
							</li>
							<li>
								{t(
									"We never claim ownership of your content, even when processing AI features",
								)}
							</li>
							<li>
								{t(
									"Free for personal and commercial use with no watermarks or restrictions",
								)}
							</li>
							<li>
								{t("Don't use Codecut for illegal activities or harassment")}
							</li>
							<li>
								{t(
									'Service provided "as is" - we can\'t guarantee perfect uptime',
								)}
							</li>
							<li>
								{t(
									"Open source means you can review our code and self-host if needed",
								)}
							</li>
							<li>
								{t(
									"You can delete your account anytime and keep using your exported videos",
								)}
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
					{t("Your Content, Your Rights")}
				</h2>
				<p>
					<strong>{t("You own everything you create.")}</strong>{" "}
					{t(
						"Codecut processes basic editing locally on your device. For AI features, content is encrypted before upload and we cannot access your original files. We make no claims to ownership, licensing, or rights over your videos, projects, or any content you create using Codecut.",
					)}
				</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						{t("Your content remains private and under your control at all times")}
					</li>
					<li>
						{t("You retain all intellectual property rights to your content")}
					</li>
					<li>
						{t(
							"Even when using AI features, we cannot access your unencrypted content",
						)}
					</li>
					<li>{t("You can export and use your content however you choose")}</li>
					<li>{t("No watermarks, no licensing restrictions from Codecut")}</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("How You Can Use Codecut")}
				</h2>
				<p>{t("Codecut is free for personal and commercial use. You can:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						{t("Create videos for personal, educational, or commercial purposes")}
					</li>
					<li>{t("Use Codecut for client work and paid projects")}</li>
					<li>{t("Share and distribute videos created with Codecut")}</li>
					<li>
						{t("Modify and distribute the Codecut software (under GPLv3 license)")}
					</li>
				</ul>
				<p>
					<strong>{t("What we ask:")}</strong>{" "}
					{t(
						"Don't use Codecut for illegal activities, harassment, or creating harmful content. Be respectful of others and follow applicable laws.",
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("AI Features and Data Processing")}
				</h2>
				<p>
					{t(
						"Codecut offers optional AI-powered features that require server processing:",
					)}
				</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>
						{t(
							"AI features (auto captions, content analysis, etc.) are completely optional",
						)}
					</li>
					<li>{t("Your content is encrypted on your device before any upload")}</li>
					<li>
						{t("We use zero-knowledge encryption - we cannot decrypt your content")}
					</li>
					<li>{t("Encrypted content is deleted immediately after processing")}</li>
					<li>
						{t("You maintain full ownership and control of your content throughout")}
					</li>
				</ul>
				<p>
					{t(
						"By using AI features, you consent to the temporary, encrypted processing of your content as described in our Privacy Policy. You can always choose to use only local editing features.",
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">{t("Account and Service")}</h2>
				<p>{t("To use certain features, you may create an account:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>{t("Provide accurate information when signing up")}</li>
					<li>{t("Keep your account secure and don't share credentials")}</li>
					<li>{t("You're responsible for activity under your account")}</li>
					<li>{t("You can delete your account at any time")}</li>
				</ul>
				<p>
					{t(
						'Codecut is provided "as is" without warranties. While we strive for reliability, we can\'t guarantee uninterrupted service.',
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("Open Source Benefits")}
				</h2>
				<p>{t("Because Codecut is open source, you have additional rights:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>{t("Review our code to see exactly how we handle your data")}</li>
					<li>{t("Self-host Codecut on your own servers")}</li>
					<li>{t("Modify the software to suit your needs")}</li>
					<li>{t("Contribute improvements back to the community")}</li>
				</ul>
				<p>
					{t("View our source code and license on")}{" "}
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
				<h2 className="text-2xl font-semibold">
					{t("Third-Party Content")}
				</h2>
				<p>
					{t(
						"When using Codecut, make sure you have the right to use any content you import:",
					)}
				</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>{t("Only upload content you own or have permission to use")}</li>
					<li>
						{t("Respect copyright, trademarks, and other intellectual property")}
					</li>
					<li>
						{t("Don't use copyrighted music, images, or videos without permission")}
					</li>
					<li>{t("You're responsible for any claims related to your content")}</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">
					{t("Limitations and Liability")}
				</h2>
				<p>
					{t(
						"Codecut is provided free of charge. To the extent permitted by law:",
					)}
				</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>{t("We're not liable for any loss of data or content")}</li>
					<li>
						{t(
							"Projects are stored in your browser and may be lost if you clear browser data",
						)}
					</li>
					<li>{t("We're not responsible for how you use the service")}</li>
					<li>
						{t("Our liability is limited to the maximum extent allowed by law")}
					</li>
				</ul>
				<p>
					{t(
						"Since your content stays on your device, we have no way to recover lost projects. Consider exporting important videos when finished editing.",
					)}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">{t("Service Changes")}</h2>
				<p>{t("We may update Codecut and these terms:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>{t("We'll notify you of significant changes to these terms")}</li>
					<li>{t("Continued use means you accept any updates")}</li>
					<li>{t("You can always self-host an older version if you prefer")}</li>
					<li>
						{t("Major changes will be discussed with the community on GitHub")}
					</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">{t("Termination")}</h2>
				<p>{t("You can stop using Codecut at any time:")}</p>
				<ul className="list-disc space-y-2 pl-6">
					<li>{t("Delete your account through your profile settings")}</li>
					<li>{t("Clear your browser data to remove local projects")}</li>
					<li>{t("Your content remains yours even if you stop using Codecut")}</li>
					<li>{t("We may suspend accounts for violations of these terms")}</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2 className="text-2xl font-semibold">{t("Contact Us")}</h2>
				<p>{t("Questions about these terms or need to report an issue?")}</p>
				<p>
					{t("Contact us through our")}{" "}
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
				<p>
					{t(
						"These terms are governed by applicable law in your jurisdiction. We prefer to resolve disputes through friendly discussion in our open-source community.",
					)}
				</p>
			</section>
			<Separator />
			<p className="text-muted-foreground text-sm">
				{t("Last updated: July 14, 2025")}
			</p>
		</BasePage>
	);
}
