import type {
	NetworkMaterialCandidate,
	NetworkMaterialSearchProvider,
} from "./matching";
import type { NetworkMaterialProvider } from "./schema";

type NetworkMaterialEnv = Record<string, string | undefined>;
type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export function createNetworkMaterialSearchProvider({
	env = process.env,
	fetchImpl = fetch,
	perPage,
}: {
	env?: NetworkMaterialEnv;
	fetchImpl?: FetchLike;
	perPage?: number;
} = {}): NetworkMaterialSearchProvider {
	return ({ provider, searchTerm }) =>
		searchNetworkMaterialProvider({
			provider,
			searchTerm,
			env,
			fetchImpl,
			perPage,
		});
}

export async function searchNetworkMaterialProvider({
	provider,
	searchTerm,
	env = process.env,
	fetchImpl = fetch,
	perPage = 12,
}: {
	provider: NetworkMaterialProvider;
	searchTerm: string;
	env?: NetworkMaterialEnv;
	fetchImpl?: FetchLike;
	perPage?: number;
}): Promise<NetworkMaterialCandidate[]> {
	if (provider === "pexels") {
		return searchPexelsVideos({ searchTerm, env, fetchImpl, perPage });
	}
	if (provider === "pixabay") {
		return searchPixabayVideos({ searchTerm, env, fetchImpl, perPage });
	}
	if (provider === "coverr") {
		return searchCoverrVideos({ searchTerm, env, fetchImpl, perPage });
	}
	throw new Error(`Unsupported network material provider: ${provider}`);
}

export async function downloadNetworkMaterialCandidate({
	candidate,
	fetchImpl = fetch,
}: {
	candidate: NetworkMaterialCandidate;
	fetchImpl?: FetchLike;
}): Promise<{
	bytes: Uint8Array;
	contentType: string;
	fileName: string;
}> {
	const response = await fetchImpl(candidate.downloadUrl);
	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`Network material download failed with ${response.status}: ${body}`,
		);
	}
	const contentType = response.headers.get("content-type") || "video/mp4";
	if (!contentType.toLowerCase().startsWith("video/")) {
		throw new Error(
			`Network material download returned non-video content: ${contentType}`,
		);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (bytes.byteLength === 0) {
		throw new Error("Network material download returned an empty file.");
	}
	return {
		bytes,
		contentType,
		fileName: fileNameFromDownloadUrl(candidate.downloadUrl),
	};
}

async function searchPexelsVideos({
	searchTerm,
	env,
	fetchImpl,
	perPage,
}: ProviderSearchArgs): Promise<NetworkMaterialCandidate[]> {
	const apiKey = requiredEnv(env, "PEXELS_API_KEY", "Pexels");
	const url = new URL("https://api.pexels.com/v1/videos/search");
	url.searchParams.set("query", searchTerm);
	url.searchParams.set("per_page", String(perPage));
	const payload = await fetchJson(url, "Pexels", fetchImpl, {
		headers: { Authorization: apiKey },
	});
	if (!Array.isArray(payload.videos)) {
		throw new Error("Pexels search response did not include videos.");
	}
	return payload.videos.flatMap((entry) => {
		const video = asRecord(entry);
		if (!video) return [];
		const file = selectPexelsVideoFile(video.video_files);
		if (!file) return [];
		return [
			{
				provider: "pexels" as const,
				sourceUrl: String(video.url || ""),
				downloadUrl: String(file.link || ""),
				license: {
					label: "Pexels License",
					url: "https://www.pexels.com/license/",
				},
				width: positiveNumber(file.width) || positiveNumber(video.width) || 0,
				height:
					positiveNumber(file.height) || positiveNumber(video.height) || 0,
				duration: positiveNumber(video.duration) || 0,
			},
		];
	});
}

async function searchPixabayVideos({
	searchTerm,
	env,
	fetchImpl,
	perPage,
}: ProviderSearchArgs): Promise<NetworkMaterialCandidate[]> {
	const apiKey = requiredEnv(env, "PIXABAY_API_KEY", "Pixabay");
	const url = new URL("https://pixabay.com/api/videos/");
	url.searchParams.set("key", apiKey);
	url.searchParams.set("q", searchTerm);
	url.searchParams.set("per_page", String(perPage));
	url.searchParams.set("safesearch", "true");
	const payload = await fetchJson(url, "Pixabay", fetchImpl);
	if (!Array.isArray(payload.hits)) {
		throw new Error("Pixabay search response did not include hits.");
	}
	return payload.hits.flatMap((entry) => {
		const hit = asRecord(entry);
		if (!hit) return [];
		const video = selectPixabayVideoFile(hit.videos);
		if (!video) return [];
		return [
			{
				provider: "pixabay" as const,
				sourceUrl: String(hit.pageURL || ""),
				downloadUrl: appendQueryParam(String(video.url || ""), "download", "1"),
				license: {
					label: "Pixabay Content License",
					url: "https://pixabay.com/service/license-summary/",
				},
				width: positiveNumber(video.width) || 0,
				height: positiveNumber(video.height) || 0,
				duration: positiveNumber(hit.duration) || 0,
			},
		];
	});
}

async function searchCoverrVideos({
	searchTerm,
	env,
	fetchImpl,
	perPage,
}: ProviderSearchArgs): Promise<NetworkMaterialCandidate[]> {
	const apiKey = requiredEnv(env, "COVERR_API_KEY", "Coverr");
	const url = new URL("https://api.coverr.co/videos");
	url.searchParams.set("query", searchTerm);
	url.searchParams.set("page_size", String(perPage));
	url.searchParams.set("urls", "true");
	const payload = await fetchJson(url, "Coverr", fetchImpl, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	if (!Array.isArray(payload.hits)) {
		throw new Error("Coverr search response did not include hits.");
	}
	return payload.hits.flatMap((entry) => {
		const video = asRecord(entry);
		if (!video) return [];
		const urls = asRecord(video.urls);
		const downloadUrl = String(urls?.mp4_download || urls?.mp4 || "");
		if (!downloadUrl) return [];
		const id = String(video.id || "").trim();
		return [
			{
				provider: "coverr" as const,
				sourceUrl: `https://coverr.co/videos/${encodeURIComponent(id)}`,
				downloadUrl,
				license: {
					label: "Coverr License",
					url: "https://coverr.co/license/",
				},
				width: positiveNumber(video.max_width) || 0,
				height: positiveNumber(video.max_height) || 0,
				duration: positiveNumber(video.duration) || 0,
			},
		];
	});
}

interface ProviderSearchArgs {
	searchTerm: string;
	env: NetworkMaterialEnv;
	fetchImpl: FetchLike;
	perPage: number;
}

async function fetchJson(
	url: URL,
	providerLabel: string,
	fetchImpl: FetchLike,
	init?: RequestInit,
): Promise<Record<string, unknown>> {
	const response = await fetchImpl(url, init);
	if (!response.ok) {
		const body = await response.text();
		throw new Error(
			`${providerLabel} search failed with ${response.status}: ${body}`,
		);
	}
	const payload = await response.json();
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
		throw new Error(`${providerLabel} search response was not an object.`);
	}
	return payload as Record<string, unknown>;
}

function requiredEnv(
	env: NetworkMaterialEnv,
	key: "PEXELS_API_KEY" | "PIXABAY_API_KEY" | "COVERR_API_KEY",
	providerLabel: string,
): string {
	const value = env[key]?.trim();
	if (!value) {
		throw new Error(
			`${key} is required for ${providerLabel} network material search.`,
		);
	}
	return value;
}

function selectPexelsVideoFile(
	value: unknown,
): Record<string, unknown> | undefined {
	if (!Array.isArray(value)) return undefined;
	return [...value]
		.map((file) => asRecord(file))
		.filter((file): file is Record<string, unknown> => {
			if (!file) return false;
			return (
				String(file.file_type || "") === "video/mp4" &&
				typeof file.link === "string" &&
				positiveNumber(file.width) > 0 &&
				positiveNumber(file.height) > 0
			);
		})
		.sort(
			(left, right) =>
				positiveNumber(right.width) * positiveNumber(right.height) -
				positiveNumber(left.width) * positiveNumber(left.height),
		)[0];
}

function selectPixabayVideoFile(
	value: unknown,
): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object") return undefined;
	const videos = value as Record<string, unknown>;
	for (const key of ["large", "medium", "small", "tiny"]) {
		const video = asRecord(videos[key]);
		if (
			video &&
			typeof video.url === "string" &&
			video.url.length > 0 &&
			positiveNumber(video.width) > 0 &&
			positiveNumber(video.height) > 0
		) {
			return video;
		}
	}
	return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	return value as Record<string, unknown>;
}

function positiveNumber(value: unknown): number {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}

function appendQueryParam(url: string, key: string, value: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set(key, value);
	return parsed.toString();
}

function fileNameFromDownloadUrl(url: string): string {
	const parsed = new URL(url);
	const fileName = parsed.pathname.split("/").filter(Boolean).pop();
	if (fileName && /\.[a-z0-9]{2,5}$/i.test(fileName)) {
		return fileName;
	}
	return "network-material.mp4";
}
