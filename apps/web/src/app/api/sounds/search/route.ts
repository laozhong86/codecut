import { webEnv } from "@codecut/env/web";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

const searchParamsSchema = z.object({
	q: z.string().max(500, "Query too long").optional(),
	type: z.enum(["songs", "effects"]).optional(),
	page: z.coerce.number().int().min(1).max(1000).default(1),
	page_size: z.coerce.number().int().min(1).max(150).default(20),
	sort: z
		.enum(["downloads", "rating", "created", "score"])
		.default("downloads"),
	min_rating: z.coerce.number().min(0).max(5).default(3),
	commercial_only: z.preprocess((value) => {
		if (value === undefined) return true;
		if (value === "true") return true;
		if (value === "false") return false;
		return value;
	}, z.boolean()),
});

const freesoundResultSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string(),
	url: z.string().url(),
	previews: z
		.object({
			"preview-hq-mp3": z.string().url(),
			"preview-lq-mp3": z.string().url(),
			"preview-hq-ogg": z.string().url(),
			"preview-lq-ogg": z.string().url(),
		})
		.optional(),
	download: z.string().url().optional(),
	duration: z.number(),
	filesize: z.number(),
	type: z.string(),
	channels: z.number(),
	bitrate: z.number(),
	bitdepth: z.number(),
	samplerate: z.number(),
	username: z.string(),
	tags: z.array(z.string()),
	license: z.string(),
	created: z.string(),
	num_downloads: z.number().optional(),
	avg_rating: z.number().optional(),
	num_ratings: z.number().optional(),
});

const freesoundResponseSchema = z.object({
	count: z.number(),
	next: z.string().url().nullable(),
	previous: z.string().url().nullable(),
	results: z.array(freesoundResultSchema),
});

const transformedResultSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string(),
	url: z.string(),
	previewUrl: z.string().optional(),
	downloadUrl: z.string().optional(),
	duration: z.number(),
	filesize: z.number(),
	type: z.string(),
	channels: z.number(),
	bitrate: z.number(),
	bitdepth: z.number(),
	samplerate: z.number(),
	username: z.string(),
	tags: z.array(z.string()),
	license: z.string(),
	licenseUrl: z.string().optional(),
	sourceId: z.string().optional(),
	source: z.enum(["freesound", "internet_archive"]).optional(),
	commercialUseAllowed: z.boolean().optional(),
	attributionRequired: z.boolean().optional(),
	created: z.string(),
	downloads: z.number().optional(),
	rating: z.number().optional(),
	ratingCount: z.number().optional(),
});

const apiResponseSchema = z.object({
	count: z.number(),
	next: z.string().nullable(),
	previous: z.string().nullable(),
	results: z.array(transformedResultSchema),
	query: z.string().optional(),
	type: z.string(),
	page: z.number(),
	pageSize: z.number(),
	sort: z.string(),
	minRating: z.number().optional(),
});

function buildSortParameter({ query, sort }: { query?: string; sort: string }) {
	if (!query) return `${sort}_desc`;
	return sort === "score" ? "score" : `${sort}_desc`;
}

function applyEffectsFilters({
	params,
	min_rating,
	commercial_only,
}: {
	params: URLSearchParams;
	min_rating: number;
	commercial_only: boolean;
}) {
	params.append("filter", "duration:[* TO 30.0]");
	params.append("filter", `avg_rating:[${min_rating} TO *]`);

	if (commercial_only) {
		params.append("filter", 'license:("Attribution" OR "Creative Commons 0")');
	}

	params.append(
		"filter",
		"tag:sound-effect OR tag:sfx OR tag:foley OR tag:ambient OR tag:nature OR tag:mechanical OR tag:electronic OR tag:impact OR tag:whoosh OR tag:explosion",
	);
}

function transformFreesoundResult(
	result: z.infer<typeof freesoundResultSchema>,
) {
	return {
		id: result.id,
		name: result.name,
		description: result.description,
		url: result.url,
		previewUrl:
			result.previews?.["preview-hq-mp3"] ||
			result.previews?.["preview-lq-mp3"],
		downloadUrl: result.download,
		duration: result.duration,
		filesize: result.filesize,
		type: result.type,
		channels: result.channels,
		bitrate: result.bitrate,
		bitdepth: result.bitdepth,
		samplerate: result.samplerate,
		username: result.username,
		tags: result.tags,
		license: result.license,
		source: "freesound" as const,
		commercialUseAllowed:
			result.license === "Attribution" ||
			result.license === "Creative Commons 0",
		attributionRequired: result.license === "Attribution",
		created: result.created,
		downloads: result.num_downloads || 0,
		rating: result.avg_rating || 0,
		ratingCount: result.num_ratings || 0,
	};
}

function getFreesoundApiKey(): string | undefined {
	return process.env.FREESOUND_API_KEY ?? webEnv.FREESOUND_API_KEY;
}

async function checkSoundSearchRateLimit({
	request,
}: {
	request: NextRequest;
}) {
	try {
		return await checkRateLimit({ request });
	} catch (error) {
		if (process.env.NODE_ENV === "development") {
			console.warn(
				"Sound search rate limit is unavailable in local development; allowing request.",
				error,
			);
			return { limited: false };
		}
		throw error;
	}
}

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

function firstString(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) return value[0];
	return value;
}

function normalizeArchiveTerms(query?: string): string[] {
	return (query ?? "")
		.trim()
		.split(/\s+/)
		.map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
		.filter(Boolean)
		.slice(0, 8);
}

function buildInternetArchiveQuery(query?: string): string {
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

function isCommercialVideoSafeLicense(licenseUrl?: string): boolean {
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

function formatLicenseLabel(licenseUrl?: string): string {
	const normalized = licenseUrl?.toLowerCase() ?? "";
	if (normalized.includes("/zero/")) return "CC0";
	if (normalized.includes("/publicdomain/")) return "Public Domain";

	const match = normalized.match(/licenses\/(by-sa|by)\/([0-9.]+)/);
	if (!match) return "Creative Commons";

	return `CC ${match[1].toUpperCase()} ${match[2].replace(/\.$/, "")}`;
}

function archiveAudioFileScore(
	file: z.infer<typeof internetArchiveFileSchema>,
) {
	const name = file.name.toLowerCase();
	const sourceScore = file.source === "original" ? 0 : 10;
	if (name.endsWith(".mp3")) return sourceScore;
	if (name.endsWith(".m4a")) return sourceScore + 1;
	if (name.endsWith(".ogg")) return sourceScore + 2;
	if (name.endsWith(".flac")) return sourceScore + 3;
	if (name.endsWith(".wav")) return sourceScore + 4;
	return Number.POSITIVE_INFINITY;
}

function selectArchiveAudioFile(
	files: z.infer<typeof internetArchiveFileSchema>[],
) {
	return files
		.filter((file) => Number.isFinite(archiveAudioFileScore(file)))
		.sort((a, b) => archiveAudioFileScore(a) - archiveAudioFileScore(b))[0];
}

function buildArchiveDownloadUrl({
	identifier,
	fileName,
}: {
	identifier: string;
	fileName: string;
}): string {
	const encodedIdentifier = encodeURIComponent(identifier);
	const encodedFileName = fileName.split("/").map(encodeURIComponent).join("/");
	return `https://archive.org/download/${encodedIdentifier}/${encodedFileName}`;
}

function buildArchiveNumericId(value: string): number {
	let hash = 2166136261;
	for (const char of value) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return -(hash >>> 0 || 1);
}

function splitArchiveTags(value: string | string[] | undefined): string[] {
	if (Array.isArray(value)) return value;
	return (value ?? "")
		.split(";")
		.map((tag) => tag.trim())
		.filter(Boolean);
}

async function transformInternetArchiveDoc({
	doc,
	commercialOnly,
}: {
	doc: z.infer<typeof internetArchiveDocSchema>;
	commercialOnly: boolean;
}) {
	const docLicenseUrl = firstString(doc.licenseurl);
	if (commercialOnly && !isCommercialVideoSafeLicense(docLicenseUrl)) {
		return null;
	}

	let metadataResponse: Response;
	try {
		metadataResponse = await fetch(
			`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`,
		);
	} catch {
		return null;
	}
	if (!metadataResponse.ok) return null;

	let rawMetadata: unknown;
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

	return {
		id: buildArchiveNumericId(sourceId),
		name: title,
		description: metadata.metadata?.description ?? "",
		url: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
		previewUrl: downloadUrl,
		downloadUrl,
		duration: Number(file.length ?? 0) || 0,
		filesize: Number(file.size ?? 0) || 0,
		type: file.format ?? "audio",
		channels: 0,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 0,
		username: creator,
		tags: splitArchiveTags(metadata.metadata?.subject),
		license: formatLicenseLabel(licenseUrl),
		licenseUrl,
		sourceId,
		source: "internet_archive" as const,
		commercialUseAllowed: isCommercialVideoSafeLicense(licenseUrl),
		attributionRequired: !licenseUrl?.toLowerCase().includes("/publicdomain/"),
		created: metadata.metadata?.date ?? "",
		downloads: doc.downloads ?? 0,
		rating: 0,
		ratingCount: 0,
	};
}

async function searchInternetArchiveSongs({
	query,
	page,
	pageSize,
	sort,
	commercialOnly,
}: {
	query?: string;
	page: number;
	pageSize: number;
	sort: string;
	commercialOnly: boolean;
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

	const response = await fetch(
		`https://archive.org/advancedsearch.php?${params.toString()}`,
	);
	if (!response.ok) {
		return NextResponse.json(
			{ error: "Failed to search Internet Archive songs" },
			{ status: response.status },
		);
	}

	const rawData = await response.json();
	const archiveValidation =
		internetArchiveSearchResponseSchema.safeParse(rawData);
	if (!archiveValidation.success) {
		return NextResponse.json(
			{ error: "Invalid response from Internet Archive" },
			{ status: 502 },
		);
	}

	const transformedResults = (
		await Promise.all(
			archiveValidation.data.response.docs.map((doc) =>
				transformInternetArchiveDoc({ doc, commercialOnly }),
			),
		)
	).filter((result): result is NonNullable<typeof result> => result !== null);

	const responseData = {
		count: archiveValidation.data.response.numFound,
		next: transformedResults.length === pageSize ? "next" : null,
		previous: page > 1 ? "previous" : null,
		results: transformedResults,
		query: query || "",
		type: "songs",
		page,
		pageSize,
		sort,
		minRating: undefined,
	};

	const responseValidation = apiResponseSchema.safeParse(responseData);
	if (!responseValidation.success) {
		return NextResponse.json(
			{ error: "Internal response formatting error" },
			{ status: 500 },
		);
	}

	return NextResponse.json(responseValidation.data);
}

export async function GET(request: NextRequest) {
	try {
		const { limited } = await checkSoundSearchRateLimit({ request });
		if (limited) {
			return NextResponse.json({ error: "Too many requests" }, { status: 429 });
		}

		const { searchParams } = new URL(request.url);

		const validationResult = searchParamsSchema.safeParse({
			q: searchParams.get("q") || undefined,
			type: searchParams.get("type") || undefined,
			page: searchParams.get("page") || undefined,
			page_size: searchParams.get("page_size") || undefined,
			sort: searchParams.get("sort") || undefined,
			min_rating: searchParams.get("min_rating") || undefined,
			commercial_only: searchParams.get("commercial_only") || undefined,
		});

		if (!validationResult.success) {
			return NextResponse.json(
				{
					error: "Invalid parameters",
					details: validationResult.error.flatten().fieldErrors,
				},
				{ status: 400 },
			);
		}

		const {
			q: query,
			type,
			page,
			page_size: pageSize,
			sort,
			min_rating,
			commercial_only,
		} = validationResult.data;

		if (type === "songs") {
			return searchInternetArchiveSongs({
				query,
				page,
				pageSize,
				sort,
				commercialOnly: commercial_only,
			});
		}

		const freesoundApiKey = getFreesoundApiKey();
		if (!freesoundApiKey) {
			return NextResponse.json(
				{ error: "Freesound API key is not configured" },
				{ status: 503 },
			);
		}

		const baseUrl = "https://freesound.org/apiv2/search/text/";

		const sortParam = buildSortParameter({ query, sort });

		const params = new URLSearchParams({
			query: query || "",
			token: freesoundApiKey,
			page: page.toString(),
			page_size: pageSize.toString(),
			sort: sortParam,
			fields:
				"id,name,description,url,previews,download,duration,filesize,type,channels,bitrate,bitdepth,samplerate,username,tags,license,created,num_downloads,avg_rating,num_ratings",
		});

		const isEffectsSearch = type === "effects" || !type;
		if (isEffectsSearch) {
			applyEffectsFilters({ params, min_rating, commercial_only });
		}

		const response = await fetch(`${baseUrl}?${params.toString()}`);

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Freesound API error:", response.status, errorText);
			return NextResponse.json(
				{ error: "Failed to search sounds" },
				{ status: response.status },
			);
		}

		const rawData = await response.json();

		const freesoundValidation = freesoundResponseSchema.safeParse(rawData);
		if (!freesoundValidation.success) {
			console.error(
				"Invalid Freesound API response:",
				freesoundValidation.error,
			);
			return NextResponse.json(
				{ error: "Invalid response from Freesound API" },
				{ status: 502 },
			);
		}

		const data = freesoundValidation.data;

		const transformedResults = data.results.map(transformFreesoundResult);

		const responseData = {
			count: data.count,
			next: data.next,
			previous: data.previous,
			results: transformedResults,
			query: query || "",
			type: type || "effects",
			page,
			pageSize,
			sort,
			minRating: min_rating,
		};

		const responseValidation = apiResponseSchema.safeParse(responseData);
		if (!responseValidation.success) {
			console.error(
				"Invalid API response structure:",
				responseValidation.error,
			);
			return NextResponse.json(
				{ error: "Internal response formatting error" },
				{ status: 500 },
			);
		}

		return NextResponse.json(responseValidation.data);
	} catch (error) {
		console.error("Error searching sounds:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
