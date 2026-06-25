import type { Metadata } from "next";
import { BasePage } from "@/app/base-page";
import { GitHubContributeSection } from "@/components/gitHub-contribute-section";
import { Badge } from "@/components/ui/badge";
import { ReactMarkdownWrapper } from "@/components/ui/react-markdown-wrapper";
import { cn } from "@/utils/ui";
import { getTranslation } from "@i18next-toolkit/nextjs-approuter/server";

type TranslateFn = (key: string) => string;

type StatusType = "complete" | "pending" | "default" | "info";

interface Status {
	text: string;
	type: StatusType;
}

interface RoadmapItem {
	title: string;
	description: string;
	status: Status;
}

function createRoadmapItems(t: TranslateFn): RoadmapItem[] {
	return [
		{
			title: t("Start"),
			description: t(
				"This is where it all started. Repository created, initial project structure, and the vision for a free, open-source video editor. [Check out the first tweet](https://x.com/mazeincoding/status/1936706642512388188) to see where it started.",
			),
			status: {
				text: t("Completed"),
				type: "complete",
			},
		},
		{
			title: t("Core UI"),
			description: t(
				"Build the foundation - main layout, header, sidebar, timeline container, and basic component structure. Not all functionality yet, but the UI framework that everything else builds on.",
			),
			status: {
				text: t("Completed"),
				type: "complete",
			},
		},
		{
			title: t("Essential functionality"),
			description: t(
				"Everything that makes a video editor **useful**. Timeline interactivity, storage, effects, transitions, etc.",
			),
			status: {
				text: t("In progress"),
				type: "pending",
			},
		},
		{
			title: t("Badge (potentially)"),
			description: t(
				'An "Edit with Codecut" badge web apps can integrate. Shows on video players.',
			),
			status: {
				text: t("Not started"),
				type: "default",
			},
		},
	];
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: string }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const { t } = await getTranslation(locale);
	const description = t(
		"See what's coming next for Codecut - the free, open-source video editor that respects your privacy.",
	);

	return {
		title: t("Roadmap - Codecut"),
		description,
		openGraph: {
			title: t("Codecut Roadmap - What's Coming Next"),
			description,
			type: "website",
			images: [
				{
					url: "/icon.png",
					width: 512,
					height: 512,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: t("Codecut Roadmap - What's Coming Next"),
			description,
		},
	};
}

export default async function RoadmapPage({
	params,
}: {
	params: Promise<{ locale: string }>;
}) {
	const { locale } = await params;
	const { t } = await getTranslation(locale);
	const roadmapItems = createRoadmapItems(t);

	return (
		<BasePage
			title={t("Roadmap")}
			description={t(
				"What's coming next for Codecut (last updated: July 14, 2025)",
			)}
		>
			<div className="mx-auto flex max-w-4xl flex-col gap-16">
				<div className="flex flex-col gap-6">
					{roadmapItems.map((item, index) => (
						<RoadmapItem key={item.title} item={item} index={index} />
					))}
				</div>
				<GitHubContributeSection
					title={t("Want to help?")}
					description={t(
						"Codecut is open source and built by the community. Every contribution, no matter how small, helps us build the best free video editor possible.",
					)}
				/>
			</div>
		</BasePage>
	);
}

function RoadmapItem({ item, index }: { item: RoadmapItem; index: number }) {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2 text-lg font-medium">
				<span className="leading-normal select-none">{index + 1}</span>
				<h3>{item.title}</h3>
				<StatusBadge status={item.status} className="ml-1" />
			</div>
			<div className="text-foreground/70 leading-relaxed">
				<ReactMarkdownWrapper>{item.description}</ReactMarkdownWrapper>
			</div>
		</div>
	);
}

function StatusBadge({
	status,
	className,
}: {
	status: Status;
	className?: string;
}) {
	return (
		<Badge
			className={cn("shadow-none", className, {
				"bg-green-500! text-white": status.type === "complete",
				"bg-yellow-500! text-white": status.type === "pending",
				"bg-blue-500! text-white": status.type === "info",
				"bg-foreground/10! text-accent-foreground": status.type === "default",
			})}
		>
			{status.text}
		</Badge>
	);
}
