"use client";

import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils/ui";
import { HugeiconsIcon } from "@hugeicons/react";
import { KeyframeIcon } from "@hugeicons/core-free-icons";

export function KeyframeToggle({
	label,
	pressed,
	disabled = false,
	onClick,
}: {
	label: string;
	pressed: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<Tooltip delayDuration={200}>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={label}
					aria-pressed={pressed}
					disabled={disabled}
					onClick={onClick}
					className={cn(
						"size-6 rounded-sm",
						pressed
							? "bg-primary/15 text-primary hover:bg-primary/20"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					<HugeiconsIcon icon={KeyframeIcon} className="size-3.5" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
