import { z } from "zod";

export const INTERNET_ARCHIVE_BGM_SOURCE = "internet_archive";
export const DEFAULT_BGM_CANDIDATE_LIMIT = 5;
export const MAX_BGM_CANDIDATE_LIMIT = 10;
export const MAX_BGM_DOWNLOAD_BYTES = 50 * 1024 * 1024;

const internetArchiveDocSchema = z.object({
	identifier: z.string(),
	title: z.union([z.string(), z.array(z.string())]).optional(),
	creator: z.union([z.string(), z.array(z.string())]).optional(),
	licenseurl: z.union([z.string(), z.array(z.string())]).optional(),
	downloads: z.number().optional(),
});

const internetArchiveSearchResponseSchema = z.object({
	response: z.object({
		numFound: z.number(),
		docs: z.array(internetArchiveDocSchema),
	}),
});

const internetArchiveFileSchema = z.object({
	name: z.string(),
	source: z.string().optional(),
	format: z.string().optional(),
	size: z.union([z.string(), z.number()]).optional(),
	length: z.union([z.string(), z.number()]).optional(),
});

const internetArchiveMetadataResponseSchema = z.object({
	server: z.string().optional(),
	d1: z.string().optional(),
	metadata: z
		.object({
			identifier: z.string().optional(),
			title: z.union([z.string(), z.array(z.string())]).optional(),
			creator: z.union([z.string(), z.array(z.string())]).optional(),
			subject: z.union([z.string(), z.array(z.string())]).optional(),
			licenseurl: z.union([z.string(), z.array(z.string())]).optional(),
			description: z.string().optional(),
			date: z.string().optional(),
		})
		.optional(),
	files: z.array(internetArchiveFileSchema).optional(),
});

function firstString(value) {
	if (Array.isArray(value)) return value[0];
	return value;
}

function normalizeArchiveTerms(query) {
	return (query ?? "")
		.trim()
		.split(/\s+/)
		.map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
		.filter(Boolean)
		.slice(0, 8);
}

export function buildInternetArchiveQuery(query) {
	const terms = normalizeArchiveTerms(query);
	const termQuery =
		terms.length > 0
			? ` AND (${terms
					.map(
						(term) => `title:${term} OR subject:${term} OR description:${term}`,
					)
					.join(" OR ")})`
			: "";

	return `mediatype:audio${termQuery} AND licenseurl:*creativecommons*`;
}

export function isCommercialVideoSafeLicense(licenseUrl) {
	const normalized = licenseUrl?.toLowerCase() ?? "";
	if (!normalized) return false;
	if (
		normalized.includes("/by-nc") ||
		normalized.includes("noncommercial") ||
		normalized.includes("/by-nd") ||
		normalized.includes("noderivatives")
	) {
		return false;
	}

	return (
		normalized.includes("creativecommons.org/publicdomain/") ||
		normalized.includes("creativecommons.org/licenses/by/") ||
		normalized.includes("creativecommons.org/licenses/by-sa/")
	);
}

export function formatLicenseLabel(licenseUrl) {
	const normalized = licenseUrl?.toLowerCase() ?? "";
	if (normalized.includes("/zero/")) return "CC0";
	if (normalized.includes("/publicdomain/")) return "Public Domain";

	const match = normalized.match(/licenses\/(by-sa|by)\/([0-9.]+)/);
	if (!match) return "Creative Commons";

	return `CC ${match[1].toUpperCase()} ${match[2].replace(/\.$/, "")}`;
}

function archiveAudioFileScore(file) {
	const name = file.name.toLowerCase();
	const sourceScore = file.source === "original" ? 0 : 10;
	if (name.endsWith(".mp3")) return sourceScore;
	if (name.endsWith(".m4a")) return sourceScore + 1;
	if (name.endsWith(".ogg")) return sourceScore + 2;
	if (name.endsWith(".flac")) return sourceScore + 3;
	if (name.endsWith(".wav")) return sourceScore + 4;
	return Number.POSITIVE_INFINITY;
}

function selectArchiveAudioFile(files) {
	return files
		.filter((file) => Number.isFinite(archiveAudioFileScore(file)))
		.sort((a, b) => archiveAudioFileScore(a) - archiveAudioFileScore(b))[0];
}

export function buildArchiveDownloadUrl({ identifier, fileName }) {
	const encodedIdentifier = encodeURIComponent(identifier);
	const encodedFileName = fileName.split("/").map(encodeURIComponent).join("/");
	return `https://archive.org/download/${encodedIdentifier}/${encodedFileName}`;
}

export function buildArchiveNumericId(value) {
	let hash = 2166136261;
	for (const char of value) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return -(hash >>> 0 || 1);
}

function splitArchiveTags(value) {
	if (Array.isArray(value)) return value;
	return (value ?? "")
		.split(";")
		.map((tag) => tag.trim())
		.filter(Boolean);
}

function archiveAttributionRequired(licenseUrl) {
	const normalized = licenseUrl?.toLowerCase() ?? "";
	return !(
		normalized.includes("/publicdomain/") || normalized.includes("/zero/")
	);
}

async function transformInternetArchiveDoc({ doc, commercialOnly, fetchImpl }) {
	const docLicenseUrl = firstString(doc.licenseurl);
	if (commercialOnly && !isCommercialVideoSafeLicense(docLicenseUrl)) {
		return null;
	}

	let metadataResponse;
	try {
		metadataResponse = await fetchImpl(
			`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`,
		);
	} catch {
		return null;
	}
	if (!metadataResponse.ok) return null;

	let rawMetadata;
	try {
		rawMetadata = await metadataResponse.json();
	} catch {
		return null;
	}
	const metadataValidation =
		internetArchiveMetadataResponseSchema.safeParse(rawMetadata);
	if (!metadataValidation.success) return null;

	const metadata = metadataValidation.data;
	const licenseUrl =
		firstString(metadata.metadata?.licenseurl) ?? docLicenseUrl;
	if (commercialOnly && !isCommercialVideoSafeLicense(licenseUrl)) {
		return null;
	}

	const file = selectArchiveAudioFile(metadata.files ?? []);
	if (!file) return null;
	const fileSizeBytes = Number(file.size ?? 0) || 0;
	if (fileSizeBytes <= 0 || fileSizeBytes > MAX_BGM_DOWNLOAD_BYTES) {
		return null;
	}

	const downloadUrl = buildArchiveDownloadUrl({
		identifier: doc.identifier,
		fileName: file.name,
	});
	const sourceId = `internet-archive:${doc.identifier}:${file.name}`;
	const title =
		firstString(metadata.metadata?.title) ??
		firstString(doc.title) ??
		file.name;
	const creator =
		firstString(metadata.metadata?.creator) ??
		firstString(doc.creator) ??
		"Internet Archive";
	const commercialUseAllowed = isCommercialVideoSafeLicense(licenseUrl);
	const licenseLabel = formatLicenseLabel(licenseUrl);

	return {
		id: buildArchiveNumericId(sourceId),
		sourceId,
		title,
		creator,
		description: metadata.metadata?.description ?? "",
		sourceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
		previewUrl: downloadUrl,
		downloadUrl,
		durationSeconds: Number(file.length ?? 0) || 0,
		filesize: fileSizeBytes,
		type: file.format ?? "audio",
		tags: splitArchiveTags(metadata.metadata?.subject),
		licenseLabel,
		licenseUrl,
		source: INTERNET_ARCHIVE_BGM_SOURCE,
		commercialUseAllowed,
		attributionRequired: archiveAttributionRequired(licenseUrl),
		created: metadata.metadata?.date ?? "",
		downloads: doc.downloads ?? 0,
	};
}

function archiveResultToSoundResult(result) {
	return {
		id: result.id,
		name: result.title,
		description: result.description,
		url: result.sourceUrl,
		previewUrl: result.previewUrl,
		downloadUrl: result.downloadUrl,
		duration: result.durationSeconds,
		filesize: result.filesize,
		type: result.type,
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: result.creator,
		tags: result.tags,
		license: result.licenseLabel,
		licenseUrl: result.licenseUrl,
		sourceId: result.sourceId,
		source: result.source,
		commercialUseAllowed: result.commercialUseAllowed,
		attributionRequired: result.attributionRequired,
		created: result.created,
		downloads: result.downloads,
		rating: 0,
		ratingCount: 0,
	};
}

export function archiveResultToBgmCandidate(result) {
	return {
		id: result.sourceId,
		sourceId: result.sourceId,
		title: result.title,
		creator: result.creator,
		source: result.source,
		sourceUrl: result.sourceUrl,
		licenseLabel: result.licenseLabel,
		licenseUrl: result.licenseUrl,
		commercialUseAllowed: result.commercialUseAllowed,
		attributionRequired: result.attributionRequired,
		previewUrl: result.previewUrl,
		downloadUrl: result.downloadUrl,
		durationSeconds: result.durationSeconds,
		fileSizeBytes: result.filesize,
	};
}

async function fetchInternetArchiveResults({
	query,
	page,
	pageSize,
	sort,
	commercialOnly,
	fetchImpl,
}) {
	const params = new URLSearchParams({
		q: buildInternetArchiveQuery(query),
		rows: pageSize.toString(),
		page: page.toString(),
		output: "json",
	});
	for (const field of [
		"identifier",
		"title",
		"creator",
		"licenseurl",
		"downloads",
	]) {
		params.append("fl[]", field);
	}
	params.append("sort[]", sort === "created" ? "date desc" : "downloads desc");

	const response = await fetchImpl(
		`https://archive.org/advancedsearch.php?${params.toString()}`,
	);
	if (!response.ok) {
		const error = new Error("Failed to search Internet Archive songs");
		error.status = response.status;
		throw error;
	}

	const rawData = await response.json();
	const archiveValidation =
		internetArchiveSearchResponseSchema.safeParse(rawData);
	if (!archiveValidation.success) {
		const error = new Error("Invalid response from Internet Archive");
		error.status = 502;
		throw error;
	}

	const transformedResults = (
		await Promise.all(
			archiveValidation.data.response.docs.map((doc) =>
				transformInternetArchiveDoc({ doc, commercialOnly, fetchImpl }),
			),
		)
	).filter((result) => result !== null);

	return {
		totalFound: archiveValidation.data.response.numFound,
		results: transformedResults,
	};
}

export async function searchInternetArchiveSongs({
	query,
	page,
	pageSize,
	sort,
	commercialOnly,
	fetchImpl = fetch,
}) {
	const { totalFound, results } = await fetchInternetArchiveResults({
		query,
		page,
		pageSize,
		sort,
		commercialOnly,
		fetchImpl,
	});

	return {
		count: totalFound,
		next: results.length === pageSize ? "next" : null,
		previous: page > 1 ? "previous" : null,
		results: results.map(archiveResultToSoundResult),
		query: query || "",
		type: "songs",
		page,
		pageSize,
		sort,
		minRating: undefined,
	};
}

export function normalizeBgmCandidateLimit(limit) {
	if (limit === undefined || limit === null) return DEFAULT_BGM_CANDIDATE_LIMIT;
	return Math.min(Math.max(Number(limit), 1), MAX_BGM_CANDIDATE_LIMIT);
}

export async function searchInternetArchiveBgm({
	query,
	limit = DEFAULT_BGM_CANDIDATE_LIMIT,
	commercialOnly = true,
	fetchImpl = fetch,
}) {
	const normalizedQuery = String(query ?? "").trim();
	if (!normalizedQuery) {
		throw new Error("BGM search query is required.");
	}
	const pageSize = normalizeBgmCandidateLimit(limit);
	const { results } = await fetchInternetArchiveResults({
		query: normalizedQuery,
		page: 1,
		pageSize,
		sort: "downloads",
		commercialOnly,
		fetchImpl,
	});
	const candidates = results
		.map(archiveResultToBgmCandidate)
		.slice(0, MAX_BGM_CANDIDATE_LIMIT);

	return {
		query: normalizedQuery,
		candidates,
		count: candidates.length,
	};
}
