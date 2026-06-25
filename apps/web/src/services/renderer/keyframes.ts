import type {
	TimelineElementKeyframes,
	Transform,
} from "@/types/timeline";
import { resolveVisualKeyframes } from "@/lib/timeline/keyframe-values";

type VisualKeyframeInput = {
	transform: Transform;
	opacity: number;
	keyframes?: TimelineElementKeyframes;
	localTime: number;
};

export function applyVisualKeyframes({
	transform,
	opacity,
	keyframes,
	localTime,
}: VisualKeyframeInput) {
	return resolveVisualKeyframes({ transform, opacity, keyframes, localTime });
}
