import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";

export function RenameProjectDialog({
	isOpen,
	onOpenChange,
	onConfirm,
	projectName,
	title,
	description,
	nameLabel,
	confirmLabel,
	placeholder,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (newName: string) => void;
	projectName: string;
	title?: string;
	description?: string;
	nameLabel?: string;
	confirmLabel?: string;
	placeholder?: string;
}) {
	const { t } = useTranslation();
	const [name, setName] = useState(projectName);
	const trimmedName = name.trim();

	useEffect(() => {
		if (isOpen) {
			setName(projectName);
		}
	}, [isOpen, projectName]);

	const handleConfirm = () => {
		if (!trimmedName) return;
		onConfirm(trimmedName);
	};

	const handleOpenChange = (open: boolean) => {
		if (open) {
			setName(projectName);
		}
		onOpenChange(open);
	};

	return (
		<Dialog open={isOpen} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title ?? t("Rename project")}</DialogTitle>
					<DialogDescription className="sr-only">
						{description ?? t("Enter the project name to save.")}
					</DialogDescription>
				</DialogHeader>

				<DialogBody className="gap-3">
					<Label>{nameLabel ?? t("New name")}</Label>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								handleConfirm();
							}
						}}
						placeholder={placeholder ?? t("Enter a new name")}
					/>
				</DialogBody>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={(e) => {
							e.preventDefault();
							e.stopPropagation();
							onOpenChange(false);
						}}
					>
						{t("Cancel")}
					</Button>
					<Button disabled={!trimmedName} onClick={handleConfirm}>
						{confirmLabel ?? t("Rename")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
