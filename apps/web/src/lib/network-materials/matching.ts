import {
	NetworkMaterialLicenseSchema,
	NetworkMaterialMatchRecordSchema,
	type NetworkMaterialLicense,
	type NetworkMaterialMatchRecord,
	type NetworkMaterialProvider,
	type NetworkMaterialVoiceoverSegment,
} from "./schema";

export interface NetworkMaterialCandidate {
	provider: NetworkMaterialProvider;
	sourceUrl: string;
	downloadUrl: string;
	license?: NetworkMaterialLicense;
	width: number;
	height: number;
	duration: number;
}

export interface NetworkMaterialSearchTerm {
	searchTerm: string;
	voiceoverSegment?: NetworkMaterialVoiceoverSegment;
}

export interface NetworkMaterialMatch extends NetworkMaterialCandidate {
	searchTerm: string;
	voiceoverSegment?: NetworkMaterialVoiceoverSegment;
	coverageSeconds: number;
	cropRisk: "none" | "slot_crop_required";
	localMediaId?: string;
}

export type NetworkMaterialSearchProvider = (args: {
	provider: NetworkMaterialProvider;
	searchTerm: string;
}) => Promise<NetworkMaterialCandidate[]>;

export async function matchNetworkMaterialCandidates({
	searchTerms,
	providers,
	searchProvider,
	maxClipDuration,
	requiredDuration,
}: {
	searchTerms: Array<string | NetworkMaterialSearchTerm>;
	providers: NetworkMaterialProvider[];
	searchProvider: NetworkMaterialSearchProvider;
	maxClipDuration: number;
	requiredDuration: number;
}): Promise<NetworkMaterialMatch[]> {
	if (searchTerms.length === 0) {
		throw new Error(
			"network material matching requires at least one search term.",
		);
	}
	const normalizedSearchTerms = searchTerms.map(normalizeSearchTerm);
	if (providers.length === 0) {
		throw new Error(
			"network material matching requires at least one provider.",
		);
	}
	if (maxClipDuration <= 0 || requiredDuration <= 0) {
		throw new Error("network material matching durations must be positive.");
	}

	const seenUrls = new Set<string>();
	const candidateGroups: Array<{
		searchTerm: string;
		voiceoverSegment?: NetworkMaterialVoiceoverSegment;
		candidates: NetworkMaterialCandidate[];
	}> = [];

	for (const { searchTerm, voiceoverSegment } of normalizedSearchTerms) {
		const termCandidates: NetworkMaterialCandidate[] = [];
		for (const provider of providers) {
			const providerCandidates = await searchProvider({ provider, searchTerm });
			for (const candidate of providerCandidates) {
				validateCandidate(candidate);
				const dedupeKey = candidate.sourceUrl || candidate.downloadUrl;
				if (seenUrls.has(dedupeKey)) continue;
				seenUrls.add(dedupeKey);
				termCandidates.push(candidate);
			}
		}
		if (termCandidates.length > 0) {
			candidateGroups.push({
				searchTerm,
				voiceoverSegment,
				candidates: termCandidates,
			});
		}
	}

	if (candidateGroups.length === 0) {
		throw new Error("network material matching found no usable candidates.");
	}

	const matches: NetworkMaterialMatch[] = [];
	let coveredDuration = 0;
	let candidateIndex = 0;
	while (coveredDuration < requiredDuration) {
		let addedInRound = false;
		for (const group of candidateGroups) {
			const candidate = group.candidates[candidateIndex];
			if (!candidate) continue;
			addedInRound = true;
			const coverageSeconds = Math.min(maxClipDuration, candidate.duration);
			matches.push({
				...candidate,
				searchTerm: group.searchTerm,
				...(group.voiceoverSegment
					? { voiceoverSegment: group.voiceoverSegment }
					: {}),
				coverageSeconds,
				cropRisk: "slot_crop_required",
			});
			coveredDuration += coverageSeconds;
			if (coveredDuration >= requiredDuration) break;
		}
		if (!addedInRound) break;
		candidateIndex += 1;
	}

	if (coveredDuration < requiredDuration) {
		throw new Error(
			`network material matching only covered ${coveredDuration} of ${requiredDuration} seconds.`,
		);
	}

	return matches;
}

export function toNetworkMaterialMatchRecord(
	match: NetworkMaterialMatch,
): NetworkMaterialMatchRecord {
	return NetworkMaterialMatchRecordSchema.parse({
		provider: match.provider,
		sourceUrl: match.sourceUrl,
		downloadUrl: match.downloadUrl,
		license: NetworkMaterialLicenseSchema.parse(match.license),
		searchTerm: match.searchTerm,
		...(match.voiceoverSegment
			? { voiceoverSegment: match.voiceoverSegment }
			: {}),
		width: match.width,
		height: match.height,
		duration: match.duration,
		...(match.localMediaId ? { localMediaId: match.localMediaId } : {}),
		cropRisk: match.cropRisk,
	});
}

function validateCandidate(candidate: NetworkMaterialCandidate): void {
	if (!candidate.sourceUrl || !candidate.downloadUrl) {
		throw new Error(
			"network material candidate requires source and download URLs.",
		);
	}
	if (
		candidate.width <= 0 ||
		candidate.height <= 0 ||
		candidate.duration <= 0
	) {
		throw new Error(
			"network material candidate dimensions and duration are required.",
		);
	}
	if (!candidate.license) {
		throw new Error("network material candidate license is required.");
	}
	NetworkMaterialLicenseSchema.parse(candidate.license);
}

function normalizeSearchTerm(
	value: string | NetworkMaterialSearchTerm,
): NetworkMaterialSearchTerm {
	if (typeof value === "string") {
		const searchTerm = value.trim();
		if (!searchTerm) {
			throw new Error("network material search term must not be empty.");
		}
		return { searchTerm };
	}
	const searchTerm = value.searchTerm.trim();
	if (!searchTerm) {
		throw new Error("network material search term must not be empty.");
	}
	return {
		searchTerm,
		...(value.voiceoverSegment
			? { voiceoverSegment: value.voiceoverSegment }
			: {}),
	};
}
