import { z } from "zod";
import {
	NetworkMaterialLicenseSchema,
	NetworkMaterialPlacementSchema,
	NetworkMaterialProviderSchema,
} from "@/lib/network-materials/schema";

export const CompositeLayoutAspectRatioSchema = z.enum(["9:16", "16:9", "1:1"]);

export const CompositeLayoutPresenterSchema = z
	.object({
		mediaId: z.string().trim().min(1),
		maskMediaId: z.string().trim().min(1).optional(),
		sourceStart: z.number().min(0),
		sourceEnd: z.number().min(0),
	})
	.strict()
	.superRefine((presenter, ctx) => {
		if (presenter.sourceEnd <= presenter.sourceStart) {
			ctx.addIssue({
				code: "custom",
				message: "presenter.sourceEnd must be greater than sourceStart.",
				path: ["sourceEnd"],
			});
		}
	});

export const CompositeLayoutNetworkMaterialBeatSchema = z
	.object({
		id: z.string().trim().min(1),
		mediaId: z.string().trim().min(1),
		provider: NetworkMaterialProviderSchema,
		searchTerm: z.string().trim().min(1),
		sourceUrl: z.string().trim().url(),
		license: NetworkMaterialLicenseSchema,
		sourceStart: z.number().min(0),
		sourceEnd: z.number().min(0),
		timelineStart: z.number().min(0),
		cropMode: z.literal("cover-slot"),
	})
	.strict()
	.superRefine((beat, ctx) => {
		if (beat.sourceEnd <= beat.sourceStart) {
			ctx.addIssue({
				code: "custom",
				message:
					"networkMaterialBeats.sourceEnd must be greater than sourceStart.",
				path: ["sourceEnd"],
			});
		}
	});

export const CompositeLayoutPlanSchema = z
	.object({
		version: z.literal(1),
		projectId: z.string().trim().min(1),
		target: z
			.object({
				aspectRatio: CompositeLayoutAspectRatioSchema,
				durationSec: z.number().positive(),
			})
			.strict(),
		placement: NetworkMaterialPlacementSchema,
		presenter: CompositeLayoutPresenterSchema,
		networkMaterialBeats: z
			.array(CompositeLayoutNetworkMaterialBeatSchema)
			.min(1),
		rationale: z.string().trim().min(1),
	})
	.strict();

export type CompositeLayoutPlan = z.infer<typeof CompositeLayoutPlanSchema>;
export type CompositeLayoutAspectRatio = z.infer<
	typeof CompositeLayoutAspectRatioSchema
>;
