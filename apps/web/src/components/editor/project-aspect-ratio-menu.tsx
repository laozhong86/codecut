"use client";

import { Check, Square } from "lucide-react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "@/hooks/use-editor";
import {
	getCanvasSizeForAspectRatioPreset,
	getProjectAspectRatioValue,
	PROJECT_ASPECT_RATIO_PRESETS,
	type ProjectAspectRatioMenuValue,
} from "@/lib/project/aspect-ratio-presets";
import type { TCanvasSize } from "@/types/project";
import { cn } from "@/utils/ui";

export function ProjectAspectRatioMenu() {
	const { t } = useTranslation();
	const editor = useEditor();
	const activeProject = editor.project.getActive();

	if (!activeProject) return null;

	const canvasSize = activeProject.settings.canvasSize;
	const originalCanvasSize = activeProject.settings.originalCanvasSize ?? null;
	const selectedValue = getProjectAspectRatioValue({
		canvasSize,
		originalCanvasSize,
	});

	const applyPreset = ({ value }: { value: ProjectAspectRatioMenuValue }) => {
		const nextCanvasSize = getCanvasSizeForAspectRatioPreset({
			value,
			originalCanvasSize,
		});
		editor.project.updateSettings({ settings: { canvasSize: nextCanvasSize } });
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="text"
					size="icon"
					type="button"
					className="size-7 rounded-sm"
					onMouseDown={(event) => event.preventDefault()}
					aria-label={t("Aspect ratio")}
					title={t("Aspect ratio")}
				>
					<Square className="size-3.5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="top" className="w-60">
				<DropdownMenuLabel>{t("Aspect ratio")}</DropdownMenuLabel>
				{originalCanvasSize ? (
					<>
						<AspectRatioMenuItem
							label={t("Fit (original)")}
							description={`${originalCanvasSize.width}×${originalCanvasSize.height}`}
							canvasSize={originalCanvasSize}
							selected={selectedValue === "original"}
							onSelect={() => applyPreset({ value: "original" })}
						/>
						<DropdownMenuSeparator />
					</>
				) : null}
				{PROJECT_ASPECT_RATIO_PRESETS.map((preset) => (
					<AspectRatioMenuItem
						key={preset.value}
						label={preset.label}
						description={`${preset.canvasSize.width}×${preset.canvasSize.height}`}
						canvasSize={preset.canvasSize}
						selected={selectedValue === preset.value}
						onSelect={() => applyPreset({ value: preset.value })}
					/>
				))}
				{selectedValue === "custom" ? (
					<>
						<DropdownMenuSeparator />
						<AspectRatioMenuItem
							label={t("Custom")}
							description={`${canvasSize.width}×${canvasSize.height}`}
							canvasSize={canvasSize}
							selected
						/>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function AspectRatioMenuItem({
	label,
	description,
	canvasSize,
	selected,
	onSelect,
}: {
	label: string;
	description: string;
	canvasSize: TCanvasSize;
	selected: boolean;
	onSelect?: () => void;
}) {
	return (
		<DropdownMenuItem
			onClick={onSelect}
			className={cn(!onSelect && "pointer-events-none")}
		>
			<RatioSwatch canvasSize={canvasSize} selected={selected} />
			<div className="min-w-0 flex-1">
				<div className="truncate font-medium">{label}</div>
				<div className="text-muted-foreground truncate text-xs">
					{description}
				</div>
			</div>
			<Check
				className={cn(
					"text-primary size-4",
					selected ? "opacity-100" : "opacity-0",
				)}
			/>
		</DropdownMenuItem>
	);
}

function RatioSwatch({
	canvasSize,
	selected,
}: {
	canvasSize: TCanvasSize;
	selected: boolean;
}) {
	const max = 20;
	const min = 8;
	const aspectRatio = canvasSize.width / canvasSize.height;
	const width =
		aspectRatio >= 1 ? max : Math.max(min, Math.round(max * aspectRatio));
	const height =
		aspectRatio >= 1 ? Math.max(min, Math.round(max / aspectRatio)) : max;

	return (
		<span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-border/70">
			<span
				className={cn(
					"rounded-[2px] border",
					selected
						? "border-primary bg-primary/15"
						: "border-muted-foreground/70",
				)}
				style={{ width, height }}
			/>
		</span>
	);
}
