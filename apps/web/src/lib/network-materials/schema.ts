import { z } from "zod";

export const NetworkMaterialPlacementSchema = z.enum([
	"background",
	"top",
	"bottom",
]);

export const NetworkMaterialProviderSchema = z.enum([
	"pexels",
	"pixabay",
	"coverr",
]);

export const NetworkMaterialLicenseSchema = z
	.object({
		label: z.string().trim().min(1),
		url: z.string().trim().url(),
	})
	.strict();

export const NetworkMaterialPolicySchema = z
	.object({
		defaultEnabled: z.boolean(),
		searchBasis: z.literal("voiceover_content"),
		defaultPlacement: NetworkMaterialPlacementSchema,
		allowedPlacements: z.array(NetworkMaterialPlacementSchema).min(1),
	})
	.strict()
	.superRefine((policy, ctx) => {
		if (!policy.allowedPlacements.includes(policy.defaultPlacement)) {
			ctx.addIssue({
				code: "custom",
				message:
					"networkMaterialPolicy.defaultPlacement must be listed in allowedPlacements.",
				path: ["defaultPlacement"],
			});
		}
	});

export const NetworkMaterialMatchingSchema = z
	.object({
		enabled: z.boolean(),
		placement: NetworkMaterialPlacementSchema,
		providers: z.array(NetworkMaterialProviderSchema).min(1),
		resolvedTemplateId: z.string().trim().min(1),
		decisionSource: z.enum(["template", "user"]),
	})
	.strict();

export const NetworkMaterialVoiceoverSegmentSchema = z
	.object({
		text: z.string().trim().min(1),
		start: z.number().nonnegative(),
		end: z.number().positive(),
	})
	.strict()
	.refine((segment) => segment.end > segment.start, {
		message:
			"network material voiceover segment end must be greater than start.",
		path: ["end"],
	});

export const NetworkMaterialMatchRecordSchema = z
	.object({
		provider: NetworkMaterialProviderSchema,
		sourceUrl: z.string().trim().url(),
		downloadUrl: z.string().trim().url(),
		license: NetworkMaterialLicenseSchema,
		searchTerm: z.string().trim().min(1),
		voiceoverSegment: NetworkMaterialVoiceoverSegmentSchema.optional(),
		width: z.number().positive(),
		height: z.number().positive(),
		duration: z.number().positive(),
		localMediaId: z.string().trim().min(1).optional(),
		cropRisk: z.enum(["none", "slot_crop_required"]),
	})
	.strict();

export type NetworkMaterialPlacement = z.infer<
	typeof NetworkMaterialPlacementSchema
>;
export type NetworkMaterialProvider = z.infer<
	typeof NetworkMaterialProviderSchema
>;
export type NetworkMaterialLicense = z.infer<
	typeof NetworkMaterialLicenseSchema
>;
export type NetworkMaterialPolicy = z.infer<typeof NetworkMaterialPolicySchema>;
export type NetworkMaterialMatching = z.infer<
	typeof NetworkMaterialMatchingSchema
>;
export type NetworkMaterialVoiceoverSegment = z.infer<
	typeof NetworkMaterialVoiceoverSegmentSchema
>;
export type NetworkMaterialMatchRecord = z.infer<
	typeof NetworkMaterialMatchRecordSchema
>;
