import { getVideoTemplate } from "@/lib/video-templates/registry";
import type {
	VideoTemplateId,
	VideoTemplateManifest,
	VideoTemplateRequiredEvidence,
} from "./schema";

export interface VideoTemplateMaterialFacts {
	hasTranscript?: boolean;
	hasVisualProof?: boolean;
	hasProductFacts?: boolean;
	hasExistingNarrationAudio?: boolean;
	hasVisualBroll?: boolean;
}

export type VideoTemplateResolveResult =
	| {
			success: true;
			template: VideoTemplateManifest;
	  }
	| {
			success: false;
			message: string;
			templateId?: VideoTemplateId;
			missingEvidence?: VideoTemplateRequiredEvidence[];
	  };

export function resolveVideoTemplate({
	userIntent,
	platformHint,
	materialFacts,
}: {
	userIntent: string;
	platformHint?: string;
	materialFacts: VideoTemplateMaterialFacts;
}): VideoTemplateResolveResult {
	const text = `${userIntent} ${platformHint ?? ""}`.toLowerCase();
	const templateId = chooseTemplateId({ text });

	if (!templateId) {
		return {
			success: false,
			message: "No P0 video template matches the user intent.",
		};
	}

	const template = getVideoTemplate(templateId);
	if (!template) {
		throw new Error(`Video template is not registered: ${templateId}`);
	}

	const missingEvidence = getMissingEvidence({
		requiredEvidence: template.requiredEvidence,
		materialFacts,
	});
	if (missingEvidence.length > 0) {
		return {
			success: false,
			templateId,
			message: `Video template ${templateId} requires ${formatEvidenceList(
				missingEvidence,
			)}.`,
			missingEvidence,
		};
	}

	return { success: true, template };
}

function chooseTemplateId({ text }: { text: string }): VideoTemplateId | null {
	if (/(商品|带货|ugc|广告|转化|product|conversion|ad\b)/i.test(text)) {
		return "product-proof-ad";
	}
	if (/(教程|demo|演示|步骤|tutorial|walkthrough|software demo)/i.test(text)) {
		return "tutorial-demo";
	}
	if (/(旁白|配音|b-roll|b roll|混剪|narration|voiceover)/i.test(text)) {
		return "narrated-broll";
	}
	if (
		/(去废话|口播|精剪|剪紧凑|talking[- ]?head|filler|polish|shorts?|tiktok|reels|竖屏)/i.test(
			text,
		)
	) {
		return "talking-head-short";
	}
	return null;
}

function getMissingEvidence({
	requiredEvidence,
	materialFacts,
}: {
	requiredEvidence: VideoTemplateRequiredEvidence[];
	materialFacts: VideoTemplateMaterialFacts;
}): VideoTemplateRequiredEvidence[] {
	const available: Record<VideoTemplateRequiredEvidence, boolean | undefined> =
		{
			transcript: materialFacts.hasTranscript,
			"visual-proof": materialFacts.hasVisualProof,
			"product-facts": materialFacts.hasProductFacts,
			"existing-narration-audio": materialFacts.hasExistingNarrationAudio,
			"visual-broll": materialFacts.hasVisualBroll,
		};
	return requiredEvidence.filter((evidence) => !available[evidence]);
}

function formatEvidenceList(evidence: VideoTemplateRequiredEvidence[]): string {
	if (evidence.length <= 1) return evidence.join("");
	return `${evidence.slice(0, -1).join(", ")} and ${evidence.at(-1)}`;
}
