export const SITE_URL = "https://codecut.msgbyte.com";

export const SITE_INFO = {
	title: "Codecut",
	description:
		"Codecut is an AI-native, open-source video editor in your browser — a free, privacy-first alternative to CapCut. AI-powered editing, multi-track timeline, MP4/WebM export with no uploads.",
	url: SITE_URL,
	openGraphImage: "/icon.png",
	twitterImage: "/icon.png",
	favicon: "/logos/codecut/png/logo-64.png",
};

export type ExternalTool = {
	name: string;
	description: string;
	url: string;
	icon: React.ElementType;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [];

export const DEFAULT_LOGO_URL = "/logos/codecut/png/logo-64.png";

export const SOCIAL_LINKS = {
	x: "https://x.com/moonrailgun",
	github: "https://github.com/msgbyte/cutia",
	discord: "",
};

export const GITHUB_COMMUNITY_URL = `${SOCIAL_LINKS.github}/issues`;
