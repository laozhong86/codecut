"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	Edit03Icon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
	createLocalTemplateScript,
	localTemplateScriptService,
	type LocalTemplateScriptRecord,
	type LocalTemplateTriggerType,
} from "@/lib/template-scripts";

const TRIGGER_OPTIONS: LocalTemplateTriggerType[] = [
	"product-proof-ad",
	"talking-head-short",
	"tutorial-demo",
	"narrated-broll",
	"subtitle-pass",
	"timeline-inspection",
	"custom",
];

function getTriggerOptionLabel({
	type,
	t,
}: {
	type: LocalTemplateTriggerType;
	t: (key: string) => string;
}) {
	switch (type) {
		case "product-proof-ad":
			return t("Product proof ad");
		case "talking-head-short":
			return t("Talking-head short");
		case "tutorial-demo":
			return t("Tutorial / demo");
		case "narrated-broll":
			return t("Narrated B-roll");
		case "subtitle-pass":
			return t("Subtitle pass");
		case "timeline-inspection":
			return t("Timeline inspection");
		case "custom":
			return t("Custom");
	}
}

interface TemplateFormState {
	id: string;
	name: string;
	description: string;
	triggerType: LocalTemplateTriggerType;
	isDefaultForTrigger: boolean;
	aliases: string;
	objective: string;
	steps: string;
	verification: string;
}

const EMPTY_FORM: TemplateFormState = {
	id: "",
	name: "",
	description: "",
	triggerType: "custom",
	isDefaultForTrigger: false,
	aliases: "",
	objective: "",
	steps: "",
	verification: "",
};

function slugify(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function lines(value: string): string[] {
	return value
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

function buildSteps(value: string) {
	return lines(value).map((line, index) => {
		const [rawLabel, ...rest] = line.split(":");
		const label = rest.length > 0 ? rawLabel.trim() : `Step ${index + 1}`;
		const instruction = rest.length > 0 ? rest.join(":").trim() : line;
		const stepId = slugify(label) || `step-${index + 1}`;
		return {
			id: stepId,
			label,
			instruction,
		};
	});
}

function formFromTemplate(
	template: LocalTemplateScriptRecord,
): TemplateFormState {
	const triggerType = template.trigger.types[0] ?? "custom";
	return {
		id: template.id,
		name: template.name,
		description: template.description ?? "",
		triggerType,
		isDefaultForTrigger: template.trigger.defaultForTypes.includes(triggerType),
		aliases: template.trigger.aliases.join(", "),
		objective: template.script.objective,
		steps: template.script.steps
			.map((step) => `${step.label}: ${step.instruction}`)
			.join("\n"),
		verification: template.script.verification.join("\n"),
	};
}

function templateFromForm({
	form,
	now,
}: {
	form: TemplateFormState;
	now: Date;
}): LocalTemplateScriptRecord {
	const id = form.id.trim() || slugify(form.name);
	if (!id) {
		throw new Error("Template ID is required.");
	}
	return createLocalTemplateScript({
		id,
		name: form.name.trim(),
		description: form.description.trim() || undefined,
		trigger: {
			types: [form.triggerType],
			defaultForTypes: form.isDefaultForTrigger ? [form.triggerType] : [],
			aliases: form.aliases
				.split(",")
				.map((alias) => alias.trim())
				.filter(Boolean),
		},
		script: {
			objective: form.objective.trim(),
			steps: buildSteps(form.steps),
			verification: lines(form.verification),
		},
		now,
	});
}

function TemplateScriptsDialogContent() {
	const { t } = useTranslation();
	const [templates, setTemplates] = useState<LocalTemplateScriptRecord[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
	const [isLoading, setIsLoading] = useState(false);

	const selectedTemplate = useMemo(
		() => templates.find((template) => template.id === selectedId) ?? null,
		[templates, selectedId],
	);

	const loadTemplates = useCallback(async () => {
		setIsLoading(true);
		try {
			const records = await localTemplateScriptService.listTemplates();
			setTemplates(records);
			if (
				selectedId &&
				!records.some((template) => template.id === selectedId)
			) {
				setSelectedId(null);
				setForm(EMPTY_FORM);
			}
		} catch (error) {
			toast.error(t("Failed to load template scripts"), {
				description:
					error instanceof Error ? error.message : t("Please try again"),
			});
		} finally {
			setIsLoading(false);
		}
	}, [selectedId, t]);

	useEffect(() => {
		loadTemplates();
	}, [loadTemplates]);

	const updateForm = <K extends keyof TemplateFormState>(
		key: K,
		value: TemplateFormState[K],
	) => {
		setForm((current) => ({ ...current, [key]: value }));
	};

	const resetForm = () => {
		setSelectedId(null);
		setForm(EMPTY_FORM);
	};

	const selectTemplate = (template: LocalTemplateScriptRecord) => {
		setSelectedId(template.id);
		setForm(formFromTemplate(template));
	};

	const saveTemplate = async () => {
		try {
			const nextTemplate = templateFromForm({ form, now: new Date() });
			if (selectedTemplate) {
				await localTemplateScriptService.updateTemplate({
					id: selectedTemplate.id,
					updates: {
						name: nextTemplate.name,
						description: nextTemplate.description,
						trigger: nextTemplate.trigger,
						script: nextTemplate.script,
					},
				});
			} else {
				await localTemplateScriptService.registerTemplate({
					template: nextTemplate,
				});
				setSelectedId(nextTemplate.id);
			}
			await loadTemplates();
			toast.success(t("Template script saved"));
		} catch (error) {
			toast.error(t("Failed to save template script"), {
				description:
					error instanceof Error ? error.message : t("Please try again"),
			});
		}
	};

	const deleteTemplate = async () => {
		if (!selectedTemplate) return;
		try {
			await localTemplateScriptService.deleteTemplate({
				id: selectedTemplate.id,
			});
			resetForm();
			await loadTemplates();
			toast.success(t("Template script deleted"));
		} catch (error) {
			toast.error(t("Failed to delete template script"), {
				description:
					error instanceof Error ? error.message : t("Please try again"),
			});
		}
	};

	return (
		<DialogContent className="max-w-5xl">
			<DialogHeader>
				<DialogTitle>{t("Template scripts")}</DialogTitle>
				<DialogDescription>
					{t("Local editing scripts for named or trigger-based cuts.")}
				</DialogDescription>
			</DialogHeader>
			<DialogBody className="grid max-h-[70vh] grid-cols-1 gap-5 overflow-y-auto md:grid-cols-[260px_1fr]">
				<div className="flex flex-col gap-3">
					<Button type="button" variant="outline" onClick={resetForm}>
						<HugeiconsIcon icon={PlusSignIcon} className="size-4" />
						{t("New script")}
					</Button>
					<div className="flex flex-col gap-2">
						{templates.length === 0 ? (
							<div className="text-muted-foreground rounded-md border p-3 text-sm">
								{t("No template scripts")}
							</div>
						) : (
							templates.map((template) => (
								<Button
									key={template.id}
									type="button"
									variant={selectedId === template.id ? "secondary" : "outline"}
									className="h-auto justify-start px-3 py-2 text-left"
									onClick={() => selectTemplate(template)}
								>
									<div className="flex min-w-0 flex-col items-start">
										<span className="truncate font-medium">
											{template.name}
										</span>
										<span className="text-muted-foreground truncate text-xs">
											{template.id}
										</span>
									</div>
								</Button>
							))
						)}
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="template-script-id">{t("ID")}</Label>
						<Input
							id="template-script-id"
							value={form.id}
							disabled={Boolean(selectedTemplate)}
							onChange={(event) => updateForm("id", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="template-script-name">{t("Name")}</Label>
						<Input
							id="template-script-name"
							value={form.name}
							onChange={(event) => updateForm("name", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-script-description">
							{t("Description")}
						</Label>
						<Input
							id="template-script-description"
							value={form.description}
							onChange={(event) =>
								updateForm("description", event.target.value)
							}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>{t("Trigger type")}</Label>
						<Select
							value={form.triggerType}
							onValueChange={(value) =>
								updateForm("triggerType", value as LocalTemplateTriggerType)
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TRIGGER_OPTIONS.map((option) => (
									<SelectItem key={option} value={option}>
										{getTriggerOptionLabel({ type: option, t })}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<Label className="flex items-center gap-3 self-end pb-2">
						<Checkbox
							checked={form.isDefaultForTrigger}
							onCheckedChange={(checked) =>
								updateForm("isDefaultForTrigger", checked === true)
							}
						/>
						{t("Default for trigger")}
					</Label>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-script-aliases">{t("Aliases")}</Label>
						<Input
							id="template-script-aliases"
							value={form.aliases}
							onChange={(event) => updateForm("aliases", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-script-objective">
							{t("Objective")}
						</Label>
						<Textarea
							id="template-script-objective"
							value={form.objective}
							onChange={(event) => updateForm("objective", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-script-steps">{t("Steps")}</Label>
						<Textarea
							id="template-script-steps"
							className="min-h-32"
							value={form.steps}
							onChange={(event) => updateForm("steps", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-script-verification">
							{t("Verification")}
						</Label>
						<Textarea
							id="template-script-verification"
							value={form.verification}
							onChange={(event) =>
								updateForm("verification", event.target.value)
							}
						/>
					</div>
				</div>
			</DialogBody>
			<DialogFooter>
				{selectedTemplate ? (
					<Button type="button" variant="destructive" onClick={deleteTemplate}>
						<HugeiconsIcon icon={Delete02Icon} className="size-4" />
						{t("Delete")}
					</Button>
				) : null}
				<Button type="button" onClick={saveTemplate} disabled={isLoading}>
					<HugeiconsIcon icon={Edit03Icon} className="size-4" />
					{t("Save script")}
				</Button>
			</DialogFooter>
		</DialogContent>
	);
}

export function TemplateScriptsDialog() {
	const { t } = useTranslation();

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" type="button" className="gap-1.5">
					<HugeiconsIcon icon={Edit03Icon} className="size-4" />
					<span className="hidden sm:inline">{t("Templates")}</span>
				</Button>
			</DialogTrigger>
			<TemplateScriptsDialogContent />
		</Dialog>
	);
}
