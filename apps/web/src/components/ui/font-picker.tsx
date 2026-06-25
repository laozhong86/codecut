import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	getFontOptionsForText,
	resolveFontFamily,
	type FontFamily,
} from "@/constants/font-constants";
import { cn } from "@/utils/ui";
import { i18next } from "@/lib/i18n";

interface FontPickerProps {
	value?: string;
	content: string;
	onValueChange?: (value: FontFamily) => void;
	className?: string;
}

export function FontPicker({
	value,
	content,
	onValueChange,
	className,
}: FontPickerProps) {
	const fontOptions = getFontOptionsForText({ content });

	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger
				className={cn("w-full", className)}
			>
				<SelectValue placeholder={i18next.t("Select a font")} />
			</SelectTrigger>
			<SelectContent>
				{fontOptions.map((font) => (
					<SelectItem
						key={font.value}
						value={font.value}
						disabled={font.disabled}
						style={{
							fontFamily: resolveFontFamily({
								fontFamily: font.value,
								content,
							}),
						}}
					>
						{font.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
