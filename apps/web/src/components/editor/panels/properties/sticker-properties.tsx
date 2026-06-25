"use client";

import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { useReducer, useRef } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { PanelBaseView } from "@/components/editor/panels/panel-base-view";
import {
	PropertyGroup,
	PropertyItem,
	PropertyItemLabel,
	PropertyItemValue,
} from "./property-item";
import { ColorPicker } from "@/components/ui/color-picker";
import { clamp } from "@/utils/math";
import { useEditor } from "@/hooks/use-editor";
import type { StickerElement, TimelineElementKeyframes } from "@/types/timeline";
import { KeyframeToggle } from "./keyframe-toggle";
import { useVisualKeyframeEditor } from "./use-visual-keyframe-editor";

export function StickerProperties({
	_element: element,
	trackId,
}: {
	_element: StickerElement;
	trackId: string;
}) {
	const { t } = useTranslation();
	const editor = useEditor();
	const keyframeEditor = useVisualKeyframeEditor({ element, trackId });
	const [, forceRender] = useReducer((x: number) => x + 1, 0);

	const isEditingScale = useRef(false);
	const isEditingPosX = useRef(false);
	const isEditingPosY = useRef(false);
	const isEditingRotation = useRef(false);
	const isEditingOpacity = useRef(false);

	const scaleDraft = useRef("");
	const posXDraft = useRef("");
	const posYDraft = useRef("");
	const rotationDraft = useRef("");
	const opacityDraft = useRef("");

	const initialScaleRef = useRef<number | null>(null);
	const initialPosXRef = useRef<number | null>(null);
	const initialPosYRef = useRef<number | null>(null);
	const initialRotationRef = useRef<number | null>(null);
	const initialOpacityRef = useRef<number | null>(null);
	const initialColorRef = useRef<string | null>(null);
	const initialKeyframesRef = useRef<TimelineElementKeyframes | undefined | null>(
		null,
	);

	const scalePercent = Math.round(keyframeEditor.resolvedTransform.scale * 100);
	const scaleDisplay = isEditingScale.current
		? scaleDraft.current
		: scalePercent.toString();
	const posXDisplay = isEditingPosX.current
		? posXDraft.current
		: Math.round(keyframeEditor.resolvedTransform.position.x).toString();
	const posYDisplay = isEditingPosY.current
		? posYDraft.current
		: Math.round(keyframeEditor.resolvedTransform.position.y).toString();
	const rotationDisplay = isEditingRotation.current
		? rotationDraft.current
		: Math.round(keyframeEditor.resolvedTransform.rotate).toString();
	const opacityDisplay = isEditingOpacity.current
		? opacityDraft.current
		: Math.round(keyframeEditor.resolvedOpacity * 100).toString();

	const updateElement = ({
		updates,
		pushHistory = true,
	}: {
		updates: Partial<Record<string, unknown>>;
		pushHistory?: boolean;
	}) => {
		editor.timeline.updateElements({
			updates: [{ trackId, elementId: element.id, updates }],
			pushHistory,
		});
	};

	const updateTransform = ({
		updates,
		pushHistory = true,
	}: {
		updates: Partial<typeof element.transform>;
		pushHistory?: boolean;
	}) => {
		updateElement({
			updates: { transform: { ...element.transform, ...updates } },
			pushHistory,
		});
	};

	const commitNumberField = ({
		draft,
		initial,
		apply,
	}: {
		draft: string;
		initial: React.RefObject<number | null>;
		apply: (value: number) => void;
	}) => {
		if (initial.current === null) return;
		const parsed = Number.parseFloat(draft);
		if (!Number.isNaN(parsed)) {
			apply(parsed);
		}
		initial.current = null;
	};

	const beginKeyframeEdit = () => {
		if (initialKeyframesRef.current === null) {
			initialKeyframesRef.current = structuredClone(element.keyframes);
		}
	};

	const commitKeyframeEdit = ({
		apply,
	}: {
		apply: (baseKeyframes: TimelineElementKeyframes | undefined) => void;
	}) => {
		if (initialKeyframesRef.current === null) return false;
		const baseKeyframes = initialKeyframesRef.current;
		keyframeEditor.restoreKeyframes({
			keyframes: baseKeyframes,
			pushHistory: false,
		});
		apply(baseKeyframes);
		initialKeyframesRef.current = null;
		return true;
	};

	return (
		<div className="flex h-full flex-col">
			<PanelBaseView className="p-0">
				<PropertyGroup
					title={t("Transform")}
					hasBorderTop={false}
					collapsible={false}
				>
					<div className="space-y-6">
						<PropertyItem>
							<PropertyItemLabel className="flex items-center gap-1.5">
								<KeyframeToggle
									label="Toggle position keyframe"
									pressed={keyframeEditor.isActive("transform.position")}
									disabled={!keyframeEditor.canEditAtPlayhead}
									onClick={() => keyframeEditor.toggle("transform.position")}
								/>
								{t("Position X")}
							</PropertyItemLabel>
							<PropertyItemValue>
								<Input
									aria-label="Position X"
									type="number"
									value={posXDisplay}
									disabled={keyframeEditor.isDisabled("transform.position")}
									onFocus={() => {
										isEditingPosX.current = true;
										posXDraft.current = Math.round(
											keyframeEditor.resolvedTransform.position.x,
										).toString();
										forceRender();
									}}
									onChange={(event) => {
										posXDraft.current = event.target.value;
										forceRender();
										if (initialPosXRef.current === null) {
											initialPosXRef.current = element.transform.position.x;
										}
										const parsed = Number.parseFloat(event.target.value);
										if (!Number.isNaN(parsed)) {
											if (keyframeEditor.writesKeyframes("transform.position")) {
												beginKeyframeEdit();
												keyframeEditor.setPositionAxisValue({
													axis: "x",
													value: parsed,
													pushHistory: false,
												});
												return;
											}
											updateTransform({
												updates: {
													position: {
														...element.transform.position,
														x: parsed,
													},
												},
												pushHistory: false,
											});
										}
									}}
									onBlur={() => {
										if (
											commitKeyframeEdit({
												apply: (baseKeyframes) => {
													const parsed = Number.parseFloat(posXDraft.current);
													const value = Number.isNaN(parsed)
														? keyframeEditor.resolvedTransform.position.x
														: parsed;
													keyframeEditor.setPositionAxisValue({
														axis: "x",
														value,
														pushHistory: true,
														baseKeyframes,
														useBaseKeyframes: true,
													});
												},
											})
										) {
											initialPosXRef.current = null;
											isEditingPosX.current = false;
											posXDraft.current = "";
											forceRender();
											return;
										}
										commitNumberField({
											draft: posXDraft.current,
											initial: initialPosXRef,
											apply: (value) => {
												updateTransform({
													updates: {
														position: {
															...element.transform.position,
															x: initialPosXRef.current ?? 0,
														},
													},
													pushHistory: false,
												});
												updateTransform({
													updates: {
														position: {
															...element.transform.position,
															x: value,
														},
													},
													pushHistory: true,
												});
											},
										});
										isEditingPosX.current = false;
										posXDraft.current = "";
										forceRender();
									}}
									className="bg-accent h-7 w-full [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
								/>
							</PropertyItemValue>
						</PropertyItem>

						<PropertyItem>
							<PropertyItemLabel>{t("Position Y")}</PropertyItemLabel>
							<PropertyItemValue>
								<Input
									aria-label="Position Y"
									type="number"
									value={posYDisplay}
									disabled={keyframeEditor.isDisabled("transform.position")}
									onFocus={() => {
										isEditingPosY.current = true;
										posYDraft.current = Math.round(
											keyframeEditor.resolvedTransform.position.y,
										).toString();
										forceRender();
									}}
									onChange={(event) => {
										posYDraft.current = event.target.value;
										forceRender();
										if (initialPosYRef.current === null) {
											initialPosYRef.current = element.transform.position.y;
										}
										const parsed = Number.parseFloat(event.target.value);
										if (!Number.isNaN(parsed)) {
											if (keyframeEditor.writesKeyframes("transform.position")) {
												beginKeyframeEdit();
												keyframeEditor.setPositionAxisValue({
													axis: "y",
													value: parsed,
													pushHistory: false,
												});
												return;
											}
											updateTransform({
												updates: {
													position: {
														...element.transform.position,
														y: parsed,
													},
												},
												pushHistory: false,
											});
										}
									}}
									onBlur={() => {
										if (
											commitKeyframeEdit({
												apply: (baseKeyframes) => {
													const parsed = Number.parseFloat(posYDraft.current);
													const value = Number.isNaN(parsed)
														? keyframeEditor.resolvedTransform.position.y
														: parsed;
													keyframeEditor.setPositionAxisValue({
														axis: "y",
														value,
														pushHistory: true,
														baseKeyframes,
														useBaseKeyframes: true,
													});
												},
											})
										) {
											initialPosYRef.current = null;
											isEditingPosY.current = false;
											posYDraft.current = "";
											forceRender();
											return;
										}
										commitNumberField({
											draft: posYDraft.current,
											initial: initialPosYRef,
											apply: (value) => {
												updateTransform({
													updates: {
														position: {
															...element.transform.position,
															y: initialPosYRef.current ?? 0,
														},
													},
													pushHistory: false,
												});
												updateTransform({
													updates: {
														position: {
															...element.transform.position,
															y: value,
														},
													},
													pushHistory: true,
												});
											},
										});
										isEditingPosY.current = false;
										posYDraft.current = "";
										forceRender();
									}}
									className="bg-accent h-7 w-full [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
								/>
							</PropertyItemValue>
						</PropertyItem>

						<PropertyItem direction="column">
							<PropertyItemLabel className="flex items-center gap-1.5">
								<KeyframeToggle
									label="Toggle scale keyframe"
									pressed={keyframeEditor.isActive("transform.scale")}
									disabled={!keyframeEditor.canEditAtPlayhead}
									onClick={() => keyframeEditor.toggle("transform.scale")}
								/>
								{t("Scale")}
							</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[scalePercent]}
										min={10}
										max={500}
										step={1}
										disabled={keyframeEditor.isDisabled("transform.scale")}
										onValueChange={([value]) => {
											if (keyframeEditor.writesKeyframes("transform.scale")) {
												beginKeyframeEdit();
												keyframeEditor.setScalarValue({
													property: "transform.scale",
													value: value / 100,
													pushHistory: false,
												});
												return;
											}
											if (initialScaleRef.current === null) {
												initialScaleRef.current = element.transform.scale;
											}
											updateTransform({
												updates: { scale: value / 100 },
												pushHistory: false,
											});
										}}
										onValueCommit={([value]) => {
											if (
												commitKeyframeEdit({
													apply: (baseKeyframes) =>
														keyframeEditor.setScalarValue({
															property: "transform.scale",
															value: value / 100,
															pushHistory: true,
															baseKeyframes,
															useBaseKeyframes: true,
														}),
												})
											) {
												initialScaleRef.current = null;
												return;
											}
											if (initialScaleRef.current !== null) {
												updateTransform({
													updates: { scale: initialScaleRef.current },
													pushHistory: false,
												});
												updateTransform({
													updates: { scale: value / 100 },
													pushHistory: true,
												});
												initialScaleRef.current = null;
											}
										}}
										className="w-full"
									/>
									<Input
										type="number"
										value={scaleDisplay}
										min={10}
										max={500}
										aria-label="Scale percentage"
										disabled={keyframeEditor.isDisabled("transform.scale")}
										onFocus={() => {
											isEditingScale.current = true;
											scaleDraft.current = scalePercent.toString();
											forceRender();
										}}
										onChange={(event) => {
											scaleDraft.current = event.target.value;
											forceRender();
											if (initialScaleRef.current === null) {
												initialScaleRef.current = element.transform.scale;
											}
											const parsed = Number.parseInt(event.target.value, 10);
											if (!Number.isNaN(parsed)) {
												const clamped = clamp({
													value: parsed,
													min: 10,
													max: 500,
												});
												if (keyframeEditor.writesKeyframes("transform.scale")) {
													beginKeyframeEdit();
													keyframeEditor.setScalarValue({
														property: "transform.scale",
														value: clamped / 100,
														pushHistory: false,
													});
													return;
												}
												updateTransform({
													updates: { scale: clamped / 100 },
													pushHistory: false,
												});
											}
										}}
										onBlur={() => {
											if (
												commitKeyframeEdit({
													apply: (baseKeyframes) => {
														const parsed = Number.parseInt(
															scaleDraft.current,
															10,
														);
														const clamped = Number.isNaN(parsed)
															? scalePercent
															: clamp({ value: parsed, min: 10, max: 500 });
														keyframeEditor.setScalarValue({
															property: "transform.scale",
															value: clamped / 100,
															pushHistory: true,
															baseKeyframes,
															useBaseKeyframes: true,
														});
													},
												})
											) {
												initialScaleRef.current = null;
												isEditingScale.current = false;
												scaleDraft.current = "";
												forceRender();
												return;
											}
											if (initialScaleRef.current !== null) {
												const parsed = Number.parseInt(
													scaleDraft.current,
													10,
												);
												const clamped = Number.isNaN(parsed)
													? scalePercent
													: clamp({ value: parsed, min: 10, max: 500 });
												updateTransform({
													updates: { scale: initialScaleRef.current },
													pushHistory: false,
												});
												updateTransform({
													updates: { scale: clamped / 100 },
													pushHistory: true,
												});
												initialScaleRef.current = null;
											}
											isEditingScale.current = false;
											scaleDraft.current = "";
											forceRender();
										}}
										className="bg-accent h-7 w-14 [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
									/>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						<PropertyItem direction="column">
							<PropertyItemLabel className="flex items-center gap-1.5">
								<KeyframeToggle
									label="Toggle rotation keyframe"
									pressed={keyframeEditor.isActive("transform.rotate")}
									disabled={!keyframeEditor.canEditAtPlayhead}
									onClick={() => keyframeEditor.toggle("transform.rotate")}
								/>
								{t("Rotation")}
							</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[keyframeEditor.resolvedTransform.rotate]}
										min={-180}
										max={180}
										step={1}
										disabled={keyframeEditor.isDisabled("transform.rotate")}
										onValueChange={([value]) => {
											if (keyframeEditor.writesKeyframes("transform.rotate")) {
												beginKeyframeEdit();
												keyframeEditor.setScalarValue({
													property: "transform.rotate",
													value,
													pushHistory: false,
												});
												return;
											}
											if (initialRotationRef.current === null) {
												initialRotationRef.current = element.transform.rotate;
											}
											updateTransform({
												updates: { rotate: value },
												pushHistory: false,
											});
										}}
										onValueCommit={([value]) => {
											if (
												commitKeyframeEdit({
													apply: (baseKeyframes) =>
														keyframeEditor.setScalarValue({
															property: "transform.rotate",
															value,
															pushHistory: true,
															baseKeyframes,
															useBaseKeyframes: true,
														}),
												})
											) {
												initialRotationRef.current = null;
												return;
											}
											if (initialRotationRef.current !== null) {
												updateTransform({
													updates: {
														rotate: initialRotationRef.current,
													},
													pushHistory: false,
												});
												updateTransform({
													updates: { rotate: value },
													pushHistory: true,
												});
												initialRotationRef.current = null;
											}
										}}
										className="w-full"
									/>
									<Input
										type="number"
										value={rotationDisplay}
										min={-360}
										max={360}
										aria-label="Rotation degrees"
										disabled={keyframeEditor.isDisabled("transform.rotate")}
										onFocus={() => {
											isEditingRotation.current = true;
											rotationDraft.current = Math.round(
												keyframeEditor.resolvedTransform.rotate,
											).toString();
											forceRender();
										}}
										onChange={(event) => {
											rotationDraft.current = event.target.value;
											forceRender();
											if (initialRotationRef.current === null) {
												initialRotationRef.current = element.transform.rotate;
											}
											const parsed = Number.parseFloat(event.target.value);
											if (!Number.isNaN(parsed)) {
												if (keyframeEditor.writesKeyframes("transform.rotate")) {
													beginKeyframeEdit();
													keyframeEditor.setScalarValue({
														property: "transform.rotate",
														value: parsed,
														pushHistory: false,
													});
													return;
												}
												updateTransform({
													updates: { rotate: parsed },
													pushHistory: false,
												});
											}
										}}
										onBlur={() => {
											if (
												commitKeyframeEdit({
													apply: (baseKeyframes) => {
														const parsed = Number.parseFloat(
															rotationDraft.current,
														);
														const value = Number.isNaN(parsed)
															? keyframeEditor.resolvedTransform.rotate
															: parsed;
														keyframeEditor.setScalarValue({
															property: "transform.rotate",
															value,
															pushHistory: true,
															baseKeyframes,
															useBaseKeyframes: true,
														});
													},
												})
											) {
												initialRotationRef.current = null;
												isEditingRotation.current = false;
												rotationDraft.current = "";
												forceRender();
												return;
											}
											commitNumberField({
												draft: rotationDraft.current,
												initial: initialRotationRef,
												apply: (value) => {
													updateTransform({
														updates: {
															rotate: initialRotationRef.current ?? 0,
														},
														pushHistory: false,
													});
													updateTransform({
														updates: { rotate: value },
														pushHistory: true,
													});
												},
											});
											isEditingRotation.current = false;
											rotationDraft.current = "";
											forceRender();
										}}
										className="bg-accent h-7 w-14 [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
									/>
								</div>
							</PropertyItemValue>
						</PropertyItem>
					</div>
				</PropertyGroup>

				<PropertyGroup title={t("Appearance")} collapsible={false}>
					<div className="space-y-6">
						<PropertyItem direction="column">
							<PropertyItemLabel className="flex items-center gap-1.5">
								<KeyframeToggle
									label="Toggle opacity keyframe"
									pressed={keyframeEditor.isActive("opacity")}
									disabled={!keyframeEditor.canEditAtPlayhead}
									onClick={() => keyframeEditor.toggle("opacity")}
								/>
								{t("Opacity")}
							</PropertyItemLabel>
							<PropertyItemValue>
								<div className="flex items-center gap-2">
									<Slider
										value={[keyframeEditor.resolvedOpacity * 100]}
										min={0}
										max={100}
										step={1}
										disabled={keyframeEditor.isDisabled("opacity")}
										onValueChange={([value]) => {
											if (keyframeEditor.writesKeyframes("opacity")) {
												beginKeyframeEdit();
												keyframeEditor.setScalarValue({
													property: "opacity",
													value: value / 100,
													pushHistory: false,
												});
												return;
											}
											if (initialOpacityRef.current === null) {
												initialOpacityRef.current = element.opacity;
											}
											updateElement({
												updates: { opacity: value / 100 },
												pushHistory: false,
											});
										}}
										onValueCommit={([value]) => {
											if (
												commitKeyframeEdit({
													apply: (baseKeyframes) =>
														keyframeEditor.setScalarValue({
															property: "opacity",
															value: value / 100,
															pushHistory: true,
															baseKeyframes,
															useBaseKeyframes: true,
														}),
												})
											) {
												initialOpacityRef.current = null;
												return;
											}
											if (initialOpacityRef.current !== null) {
												updateElement({
													updates: {
														opacity: initialOpacityRef.current,
													},
													pushHistory: false,
												});
												updateElement({
													updates: { opacity: value / 100 },
													pushHistory: true,
												});
												initialOpacityRef.current = null;
											}
										}}
										className="w-full"
									/>
									<Input
										type="number"
										value={opacityDisplay}
										min={0}
										max={100}
										aria-label="Opacity percentage"
										disabled={keyframeEditor.isDisabled("opacity")}
										onFocus={() => {
											isEditingOpacity.current = true;
											opacityDraft.current = Math.round(
												keyframeEditor.resolvedOpacity * 100,
											).toString();
											forceRender();
										}}
										onChange={(event) => {
											opacityDraft.current = event.target.value;
											forceRender();
											if (initialOpacityRef.current === null) {
												initialOpacityRef.current = element.opacity;
											}
											const parsed = Number.parseInt(
												event.target.value,
												10,
											);
											if (!Number.isNaN(parsed)) {
												const opacityPercent = clamp({
													value: parsed,
													min: 0,
													max: 100,
												});
												if (keyframeEditor.writesKeyframes("opacity")) {
													beginKeyframeEdit();
													keyframeEditor.setScalarValue({
														property: "opacity",
														value: opacityPercent / 100,
														pushHistory: false,
													});
													return;
												}
												updateElement({
													updates: {
														opacity: opacityPercent / 100,
													},
													pushHistory: false,
												});
											}
										}}
										onBlur={() => {
											if (
												commitKeyframeEdit({
													apply: (baseKeyframes) => {
														const parsed = Number.parseInt(
															opacityDraft.current,
															10,
														);
														const opacityPercent = Number.isNaN(parsed)
															? Math.round(keyframeEditor.resolvedOpacity * 100)
															: clamp({
																	value: parsed,
																	min: 0,
																	max: 100,
																});
														keyframeEditor.setScalarValue({
															property: "opacity",
															value: opacityPercent / 100,
															pushHistory: true,
															baseKeyframes,
															useBaseKeyframes: true,
														});
													},
												})
											) {
												initialOpacityRef.current = null;
												isEditingOpacity.current = false;
												opacityDraft.current = "";
												forceRender();
												return;
											}
											if (initialOpacityRef.current !== null) {
												const parsed = Number.parseInt(
													opacityDraft.current,
													10,
												);
												const opacityPercent = Number.isNaN(parsed)
													? Math.round(element.opacity * 100)
													: clamp({
															value: parsed,
															min: 0,
															max: 100,
														});
												updateElement({
													updates: {
														opacity: initialOpacityRef.current,
													},
													pushHistory: false,
												});
												updateElement({
													updates: {
														opacity: opacityPercent / 100,
													},
													pushHistory: true,
												});
												initialOpacityRef.current = null;
											}
											isEditingOpacity.current = false;
											opacityDraft.current = "";
											forceRender();
										}}
										className="bg-accent h-7 w-14 [appearance:textfield] rounded-sm px-2 text-center !text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
									/>
								</div>
							</PropertyItemValue>
						</PropertyItem>

						<PropertyItem>
							<PropertyItemLabel>{t("Color")}</PropertyItemLabel>
							<PropertyItemValue>
								<ColorPicker
									value={element.color ?? "#000000"}
									onChange={(value) => {
										if (initialColorRef.current === null) {
											initialColorRef.current = element.color ?? "#000000";
										}
										updateElement({
											updates: { color: value },
											pushHistory: false,
										});
									}}
									onChangeEnd={(value) => {
										if (initialColorRef.current !== null) {
											updateElement({
												updates: { color: initialColorRef.current },
												pushHistory: false,
											});
											updateElement({
												updates: { color: value },
												pushHistory: true,
											});
											initialColorRef.current = null;
										}
									}}
								/>
							</PropertyItemValue>
						</PropertyItem>
					</div>
				</PropertyGroup>
			</PanelBaseView>
		</div>
	);
}
