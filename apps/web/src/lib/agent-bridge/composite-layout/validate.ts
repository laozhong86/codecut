import {
	CompositeLayoutPlanSchema,
	type CompositeLayoutAspectRatio,
	type CompositeLayoutPlan,
} from "./schema";
import type { NetworkMaterialPlacement } from "@/lib/network-materials/schema";

export interface CompositeLayoutSlot {
	x: number;
	y: number;
	width: number;
	height: number;
}

export type CompositeLayoutValidationResult =
	| { success: true; normalizedPlan: CompositeLayoutPlan }
	| { success: false; message: string; path?: string };

export function resolveCompositeLayoutSlots({
	aspectRatio,
	placement,
}: {
	aspectRatio: CompositeLayoutAspectRatio;
	placement: NetworkMaterialPlacement;
}): {
	networkMaterial: CompositeLayoutSlot;
	presenter: CompositeLayoutSlot;
} {
	if (aspectRatio !== "9:16" && placement !== "background") {
		throw new Error(
			"CompositeLayoutPlan split placements require a 9:16 target.",
		);
	}
	if (placement === "top") {
		return {
			networkMaterial: { x: 0, y: 0, width: 1, height: 0.45 },
			presenter: { x: 0, y: 0.45, width: 1, height: 0.55 },
		};
	}
	if (placement === "bottom") {
		return {
			presenter: { x: 0, y: 0, width: 1, height: 0.55 },
			networkMaterial: { x: 0, y: 0.55, width: 1, height: 0.45 },
		};
	}
	return {
		networkMaterial: { x: 0, y: 0, width: 1, height: 1 },
		presenter: { x: 0, y: 0, width: 1, height: 1 },
	};
}

export function validateCompositeLayoutPlan({
	plan,
}: {
	plan: unknown;
}): CompositeLayoutValidationResult {
	const parsed = CompositeLayoutPlanSchema.safeParse(plan);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return {
			success: false,
			message: issue?.message ?? "CompositeLayoutPlan is invalid.",
			path: issue ? formatIssuePath(issue.path) : undefined,
		};
	}

	const normalizedPlan = parsed.data;
	if (
		(normalizedPlan.placement === "top" ||
			normalizedPlan.placement === "bottom") &&
		normalizedPlan.target.aspectRatio !== "9:16"
	) {
		return {
			success: false,
			message: "CompositeLayoutPlan split placements require a 9:16 target.",
			path: "target.aspectRatio",
		};
	}
	if (
		normalizedPlan.placement === "background" &&
		!normalizedPlan.presenter.maskMediaId
	) {
		return {
			success: false,
			message:
				"CompositeLayoutPlan background placement with presenter media requires presenter.maskMediaId.",
			path: "presenter.maskMediaId",
		};
	}

	return { success: true, normalizedPlan };
}

function formatIssuePath(path: PropertyKey[]): string | undefined {
	if (path.length === 0) return undefined;
	let formatted = "";
	for (const part of path) {
		if (typeof part === "number") {
			formatted = `${formatted}[${part}]`;
			continue;
		}
		const key = String(part);
		formatted = formatted ? `${formatted}.${key}` : key;
	}
	return formatted;
}
