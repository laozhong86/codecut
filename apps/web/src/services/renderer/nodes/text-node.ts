import { FONT_SIZE_SCALE_REFERENCE } from "@/constants/text-constants";
import type { TextElement, TextShadow } from "@/types/timeline";
import type { CanvasRenderer } from "../canvas-renderer";
import { BaseNode } from "./base-node";
import {
	createTextLayout,
	type TextLayoutLine,
	type TextLayoutRun,
	type TextRunStyle,
} from "./text-layout";

type RenderContext =
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D;

function scaleFontSize({
	fontSize,
	canvasHeight,
}: {
	fontSize: number;
	canvasHeight: number;
}): number {
	return fontSize * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
}

export function scaleBoxWidth({
	boxWidth,
	canvasHeight,
}: {
	boxWidth: number;
	canvasHeight: number;
}): number {
	return boxWidth * (canvasHeight / FONT_SIZE_SCALE_REFERENCE);
}

export type TextNodeParams = TextElement & {
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

function getRunFont({
	params,
	runStyle,
	scaledFontSize,
}: {
	params: TextNodeParams;
	runStyle: TextRunStyle;
	scaledFontSize: number;
}): string {
	const fontWeight =
		runStyle.fontWeight ?? (params.fontWeight === "bold" ? "bold" : "normal");
	const fontStyle =
		runStyle.fontStyle ?? (params.fontStyle === "italic" ? "italic" : "normal");
	const fontSize = scaledFontSize * (runStyle.fontScale ?? 1);
	return `${fontStyle} ${fontWeight} ${fontSize}px ${params.fontFamily}`;
}

function resetShadow({ context }: { context: RenderContext }) {
	context.shadowColor = "transparent";
	context.shadowBlur = 0;
	context.shadowOffsetX = 0;
	context.shadowOffsetY = 0;
}

export class TextNode extends BaseNode<TextNodeParams> {
	isInRange({ time }: { time: number }) {
		return (
			time >= this.params.startTime &&
			time < this.params.startTime + this.params.duration
		);
	}

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		if (!this.isInRange({ time })) {
			return;
		}

		const context = renderer.context;
		context.save();

		const x = this.params.transform.position.x + this.params.canvasCenter.x;
		const y = this.params.transform.position.y + this.params.canvasCenter.y;

		context.translate(x, y);
		if (this.params.transform.rotate) {
			context.rotate((this.params.transform.rotate * Math.PI) / 180);
		}
		if (this.params.transform.scale !== 1) {
			context.scale(this.params.transform.scale, this.params.transform.scale);
		}

		const scaledFontSize = scaleFontSize({
			fontSize: this.params.fontSize,
			canvasHeight: this.params.canvasHeight,
		});
		const boxWidth = this.params.boxWidth;
		const hasBoxWidth = boxWidth !== undefined && boxWidth > 0;
		const scaledBoxWidth = hasBoxWidth
			? scaleBoxWidth({
					boxWidth,
					canvasHeight: this.params.canvasHeight,
				})
			: undefined;
		const layout = createTextLayout({
			content: this.params.content,
			richSpans: this.params.richSpans,
			maxWidth: scaledBoxWidth,
			measureText: (text, style) => {
				context.font = getRunFont({
					params: this.params,
					runStyle: style,
					scaledFontSize,
				});
				return context.measureText(text).width;
			},
		});
		const lineHeight = scaledFontSize * 1.3;
		const textBaseline = this.params.textBaseline || "middle";

		const prevAlpha = context.globalAlpha;
		context.globalAlpha = this.params.opacity;

		this.renderBackground({
			context,
			layoutLines: layout.lines,
			scaledBoxWidth,
			lineHeight,
			textBaseline,
		});

		context.textAlign = "left";
		context.textBaseline = "middle";

		const totalHeight = layout.lines.length * lineHeight;
		const startY =
			textBaseline === "bottom"
				? -totalHeight + lineHeight / 2
				: -totalHeight / 2 + lineHeight / 2;

		for (let lineIndex = 0; lineIndex < layout.lines.length; lineIndex += 1) {
			const line = layout.lines[lineIndex];
			const lineY = startY + lineIndex * lineHeight;
			let runX = this.getLineStartX({
				line,
				scaledBoxWidth,
			});

			for (const run of line.runs) {
				const runWidth = this.renderRun({
					context,
					run,
					x: runX,
					y: lineY,
					scaledFontSize,
				});
				runX += runWidth;
			}
		}

		context.globalAlpha = prevAlpha;
		context.restore();
	}

	private renderBackground({
		context,
		layoutLines,
		scaledBoxWidth,
		lineHeight,
		textBaseline,
	}: {
		context: RenderContext;
		layoutLines: TextLayoutLine[];
		scaledBoxWidth: number | undefined;
		lineHeight: number;
		textBaseline: CanvasTextBaseline;
	}) {
		if (
			!this.params.backgroundColor ||
			this.params.backgroundColor === "transparent"
		) {
			return;
		}

		const maxLineWidth = Math.max(
			...layoutLines.map((line) => line.width),
			lineHeight,
		);
		const textWidth = scaledBoxWidth ?? maxLineWidth;
		const textHeight = layoutLines.length * lineHeight;
		const padX = this.params.backgroundPaddingX ?? 8;
		const padY = this.params.backgroundPaddingY ?? 4;
		const borderRadius = this.params.backgroundBorderRadius ?? 0;
		const bgW = textWidth + padX * 2;
		const bgH = textHeight + padY * 2;
		const bgX = this.getBackgroundX({ textWidth, padX, scaledBoxWidth });
		const bgY =
			textBaseline === "bottom"
				? -textHeight - padY
				: -textHeight / 2 - padY;

		const prevAlpha = context.globalAlpha;
		context.globalAlpha = prevAlpha * (this.params.backgroundOpacity ?? 1);
		context.fillStyle = this.params.backgroundColor;

		if (borderRadius > 0 && context.roundRect) {
			context.beginPath();
			context.roundRect(bgX, bgY, bgW, bgH, borderRadius);
			context.fill();
		} else {
			context.fillRect(bgX, bgY, bgW, bgH);
		}

		context.globalAlpha = prevAlpha;
	}

	private getBackgroundX({
		textWidth,
		padX,
		scaledBoxWidth,
	}: {
		textWidth: number;
		padX: number;
		scaledBoxWidth: number | undefined;
	}): number {
		if (scaledBoxWidth !== undefined) return -scaledBoxWidth / 2 - padX;
		if (this.params.textAlign === "left") return -padX;
		if (this.params.textAlign === "right") return -textWidth - padX;
		return -textWidth / 2 - padX;
	}

	private getLineStartX({
		line,
		scaledBoxWidth,
	}: {
		line: TextLayoutLine;
		scaledBoxWidth: number | undefined;
	}): number {
		if (this.params.textAlign === "left") {
			return scaledBoxWidth !== undefined ? -scaledBoxWidth / 2 : 0;
		}
		if (this.params.textAlign === "right") {
			return scaledBoxWidth !== undefined
				? scaledBoxWidth / 2 - line.width
				: -line.width;
		}
		return -line.width / 2;
	}

	private renderRun({
		context,
		run,
		x,
		y,
		scaledFontSize,
	}: {
		context: RenderContext;
		run: TextLayoutRun;
		x: number;
		y: number;
		scaledFontSize: number;
	}): number {
		context.font = getRunFont({
			params: this.params,
			runStyle: run.style,
			scaledFontSize,
		});
		const width = context.measureText(run.text).width;
		const shadow = this.params.shadow;
		if (shadow) {
			this.applyShadow({ context, shadow });
		}

		const stroke = run.style.stroke ?? this.params.stroke;
		if (stroke && stroke.width > 0) {
			context.strokeStyle = stroke.color;
			context.lineWidth = stroke.width * 2;
			context.lineJoin = "round";
			context.strokeText(run.text, x, y);
		}

		if (shadow) {
			resetShadow({ context });
		}

		context.fillStyle = run.style.color ?? this.params.color;
		context.fillText(run.text, x, y);
		return width;
	}

	private applyShadow({
		context,
		shadow,
	}: {
		context: RenderContext;
		shadow: TextShadow;
	}) {
		context.shadowColor = shadow.color;
		context.shadowOffsetX = shadow.offsetX;
		context.shadowOffsetY = shadow.offsetY;
		context.shadowBlur = shadow.blur;
	}
}
