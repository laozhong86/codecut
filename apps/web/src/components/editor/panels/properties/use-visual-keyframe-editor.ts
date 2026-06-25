"use client";

import { useEditor } from "@/hooks/use-editor";
import {
	getVisualKeyframeLocalTime,
	hasVisualKeyframeAtTime,
	hasVisualKeyframeTrack,
	resolveVisualKeyframes,
	setVisualKeyframeValue,
	setVisualPositionAxisKeyframeValue,
	toggleVisualKeyframe,
	type VisualKeyframeProperty,
	type VisualTimelineElement,
} from "@/lib/timeline/keyframe-values";
import type { TimelineElementKeyframes } from "@/types/timeline";

export function useVisualKeyframeEditor({
	element,
	trackId,
	enabled = true,
}: {
	element: VisualTimelineElement;
	trackId: string;
	enabled?: boolean;
}) {
	const editor = useEditor();
	const currentTime = editor.playback.getCurrentTime();
	const localTime = getVisualKeyframeLocalTime({ element, currentTime });
	const canEditAtPlayhead = enabled && localTime !== null;
	const resolved = localTime === null
		? { transform: element.transform, opacity: element.opacity }
		: resolveVisualKeyframes({
				transform: element.transform,
				opacity: element.opacity,
				keyframes: element.keyframes,
				localTime,
			});

	const updateKeyframes = ({
		keyframes,
		pushHistory,
	}: {
		keyframes: TimelineElementKeyframes | undefined;
		pushHistory: boolean;
	}) => {
		editor.timeline.updateElements({
			updates: [
				{
					trackId,
					elementId: element.id,
					updates: { keyframes },
				},
			],
			pushHistory,
		});
	};

	const isKeyframed = (property: VisualKeyframeProperty) =>
		hasVisualKeyframeTrack({ element, property });

	const isActive = (property: VisualKeyframeProperty) =>
		hasVisualKeyframeAtTime({ element, property, currentTime });

	const isDisabled = (property: VisualKeyframeProperty) =>
		enabled && isKeyframed(property) && localTime === null;

	const writesKeyframes = (property: VisualKeyframeProperty) =>
		canEditAtPlayhead && isKeyframed(property);

	const toggle = (property: VisualKeyframeProperty) => {
		updateKeyframes({
			keyframes: toggleVisualKeyframe({ element, property, currentTime }),
			pushHistory: true,
		});
	};

	const setScalarValue = ({
		property,
		value,
		pushHistory,
		baseKeyframes,
		useBaseKeyframes = false,
	}: {
		property: Exclude<VisualKeyframeProperty, "transform.position">;
		value: number;
		pushHistory: boolean;
		baseKeyframes?: TimelineElementKeyframes;
		useBaseKeyframes?: boolean;
	}) => {
		const baseElement =
			useBaseKeyframes ? { ...element, keyframes: baseKeyframes } : element;
		updateKeyframes({
			keyframes: setVisualKeyframeValue({
				element: baseElement,
				property,
				currentTime,
				value,
			}),
			pushHistory,
		});
	};

	const setPositionAxisValue = ({
		axis,
		value,
		pushHistory,
		baseKeyframes,
		useBaseKeyframes = false,
	}: {
		axis: "x" | "y";
		value: number;
		pushHistory: boolean;
		baseKeyframes?: TimelineElementKeyframes;
		useBaseKeyframes?: boolean;
	}) => {
		const baseElement =
			useBaseKeyframes ? { ...element, keyframes: baseKeyframes } : element;
		updateKeyframes({
			keyframes: setVisualPositionAxisKeyframeValue({
				element: baseElement,
				currentTime,
				axis,
				value,
			}),
			pushHistory,
		});
	};

	return {
		canEditAtPlayhead,
		currentTime,
		isActive,
		isDisabled,
		isKeyframed,
		resolvedOpacity: resolved.opacity,
		resolvedTransform: resolved.transform,
		restoreKeyframes: updateKeyframes,
		setPositionAxisValue,
		setScalarValue,
		toggle,
		writesKeyframes,
	};
}
