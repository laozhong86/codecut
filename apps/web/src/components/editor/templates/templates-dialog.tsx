"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	Edit03Icon,
	PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";
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
	BUILT_IN_TEMPLATE_IDS,
	createTemplate,
	getBuiltInTemplate,
	templateService,
	type BuiltInTemplateId,
	type Template,
	type TemplateExecution,
	type TemplateTriggerType,
} from "@/lib/templates";

const TRIGGER_OPTIONS: TemplateTriggerType[] = [
	"product-proof-ad",
	"talking-head-short",
	"tutorial-demo",
	"narrated-broll",
	"subtitle-pass",
	"timeline-inspection",
	"custom",
];

const EXECUTION_PROFILE_NONE = "__none";
const EXECUTION_PROFILE_CURRENT = "__current";

type ExecutionProfileId =
	| BuiltInTemplateId
	| typeof EXECUTION_PROFILE_NONE
	| typeof EXECUTION_PROFILE_CURRENT;

interface TemplateFormState {
	id: string;
	name: string;
	description: string;
	triggerType: TemplateTriggerType;
	isDefaultForTrigger: boolean;
	aliases: string;
	objective: string;
	steps: string;
	verification: string;
	executionProfileId: ExecutionProfileId;
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
	executionProfileId: EXECUTION_PROFILE_NONE,
};

function getTriggerOptionLabel({
	type,
	t,
}: {
	type: TemplateTriggerType;
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
		return {
			id: slugify(label) || `step-${index + 1}`,
			label,
			instruction,
		};
	});
}

function executionSignature(execution: TemplateExecution): string {
	return JSON.stringify({
		path: execution.path,
		requiredEvidence: execution.requiredEvidence,
		defaultStructure: execution.defaultStructure,
		captionPreset: execution.captionPreset,
		stopConditions: execution.stopConditions,
	});
}

function profileIdFromExecution(template: Template): BuiltInTemplateId | null {
	if ((BUILT_IN_TEMPLATE_IDS as readonly string[]).includes(template.id)) {
		return template.id as BuiltInTemplateId;
	}

	const signature = executionSignature(template.execution);
	return (
		BUILT_IN_TEMPLATE_IDS.find((id) => {
			const builtIn = getBuiltInTemplate(id);
			return builtIn
				? executionSignature(builtIn.execution) === signature
				: false;
		}) ?? null
	);
}

function formFromTemplate(template: Template): TemplateFormState {
	const triggerType = template.trigger.types[0] ?? "custom";
	return {
		id: template.id,
		name: template.name,
		description: template.description ?? "",
		triggerType,
		isDefaultForTrigger: template.trigger.defaultForTypes.includes(triggerType),
		aliases: template.trigger.aliases.join(", "),
		objective: template.plan.objective,
		steps: template.plan.steps
			.map((step) => `${step.label}: ${step.instruction}`)
			.join("\n"),
		verification: template.plan.verification.join("\n"),
		executionProfileId:
			profileIdFromExecution(template) ?? EXECUTION_PROFILE_CURRENT,
	};
}

function executionFromProfile({
	profileId,
	selectedTemplate,
}: {
	profileId: ExecutionProfileId;
	selectedTemplate: Template | null;
}): TemplateExecution {
	if (profileId === EXECUTION_PROFILE_CURRENT) {
		if (!selectedTemplate) {
			throw new Error("Select an execution profile before saving.");
		}
		return selectedTemplate.execution;
	}

	if (profileId === EXECUTION_PROFILE_NONE) {
		throw new Error("Select an execution profile before saving.");
	}

	const profile = getBuiltInTemplate(profileId);
	if (!profile) {
		throw new Error(`Unknown execution profile: ${profileId}`);
	}
	return profile.execution;
}

function templateFromForm({
	form,
	selectedTemplate,
	now,
}: {
	form: TemplateFormState;
	selectedTemplate: Template | null;
	now: Date;
}): Template {
	if (selectedTemplate?.readOnly) {
		throw new Error("Built-in templates are read-only.");
	}

	const id = form.id.trim() || slugify(form.name);
	if (!id) {
		throw new Error("Template ID is required.");
	}

	return createTemplate({
		id,
		name: form.name.trim(),
		description: form.description.trim() || undefined,
		source: "user",
		readOnly: false,
		trigger: {
			types: [form.triggerType],
			defaultForTypes: form.isDefaultForTrigger ? [form.triggerType] : [],
			aliases: form.aliases
				.split(",")
				.map((alias) => alias.trim())
				.filter(Boolean),
		},
		plan: {
			objective: form.objective.trim(),
			steps: buildSteps(form.steps),
			verification: lines(form.verification),
		},
		execution: executionFromProfile({
			profileId: form.executionProfileId,
			selectedTemplate,
		}),
		now,
	});
}

function TemplateBadge({
	label,
}: {
	label: string;
}) {
	return (
		<span className="text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] uppercase">
			{label}
		</span>
	);
}

function TemplatesDialogContent() {
	const { t } = useTranslation();
	const [templates, setTemplates] = useState<Template[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [form, setForm] = useState<TemplateFormState>(EMPTY_FORM);
	const [isLoading, setIsLoading] = useState(false);

	const selectedTemplate = useMemo(
		() => templates.find((template) => template.id === selectedId) ?? null,
		[templates, selectedId],
	);
	const isReadOnly = selectedTemplate?.readOnly === true;
	const showCurrentExecutionOption =
		selectedTemplate &&
		selectedTemplate.source === "user" &&
		profileIdFromExecution(selectedTemplate) === null;

	const loadTemplates = useCallback(async () => {
		setIsLoading(true);
		try {
			const records = await templateService.listTemplates();
			setTemplates(records);
			if (
				selectedId &&
				!records.some((template) => template.id === selectedId)
			) {
				setSelectedId(null);
				setForm(EMPTY_FORM);
			}
		} catch (error) {
			toast.error(t("Failed to load templates"), {
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

	const selectTemplate = (template: Template) => {
		setSelectedId(template.id);
		setForm(formFromTemplate(template));
	};

	const saveTemplate = async () => {
		try {
			const nextTemplate = templateFromForm({
				form,
				selectedTemplate,
				now: new Date(),
			});
			if (selectedTemplate) {
				await templateService.updateTemplate({
					id: selectedTemplate.id,
					updates: {
						name: nextTemplate.name,
						description: nextTemplate.description,
						trigger: nextTemplate.trigger,
						plan: nextTemplate.plan,
						execution: nextTemplate.execution,
					},
				});
			} else {
				await templateService.registerTemplate({
					template: nextTemplate,
				});
				setSelectedId(nextTemplate.id);
			}
			await loadTemplates();
			toast.success(t("Template saved"));
		} catch (error) {
			toast.error(t("Failed to save template"), {
				description:
					error instanceof Error ? error.message : t("Please try again"),
			});
		}
	};

	const deleteTemplate = async () => {
		if (!selectedTemplate || selectedTemplate.source !== "user") return;
		try {
			await templateService.deleteTemplate({
				id: selectedTemplate.id,
			});
			resetForm();
			await loadTemplates();
			toast.success(t("Template deleted"));
		} catch (error) {
			toast.error(t("Failed to delete template"), {
				description:
					error instanceof Error ? error.message : t("Please try again"),
			});
		}
	};

	return (
		<DialogContent className="max-w-5xl">
			<DialogHeader>
				<DialogTitle>{t("Templates")}</DialogTitle>
				<DialogDescription>
					{t("Unified planning templates for Codecut edits.")}
				</DialogDescription>
			</DialogHeader>
			<DialogBody className="grid max-h-[70vh] grid-cols-1 gap-5 overflow-y-auto md:grid-cols-[280px_1fr]">
				<div className="flex flex-col gap-3">
					<Button type="button" variant="outline" onClick={resetForm}>
						<HugeiconsIcon icon={PlusSignIcon} className="size-4" />
						{t("New template")}
					</Button>
					<div className="flex flex-col gap-2">
						{templates.length === 0 ? (
							<div className="text-muted-foreground rounded-md border p-3 text-sm">
								{t("No templates")}
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
									<div className="flex min-w-0 flex-1 flex-col items-start gap-1">
											<div className="flex w-full items-center gap-2">
												<span className="truncate font-medium">
													{template.name}
												</span>
												<TemplateBadge
													label={
														template.source === "built-in"
															? t("Built-in")
															: t("User")
													}
												/>
											</div>
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
						<Label htmlFor="template-id">{t("ID")}</Label>
						<Input
							id="template-id"
							value={form.id}
							disabled={Boolean(selectedTemplate)}
							onChange={(event) => updateForm("id", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="template-name">{t("Name")}</Label>
						<Input
							id="template-name"
							value={form.name}
							disabled={isReadOnly}
							onChange={(event) => updateForm("name", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-description">{t("Description")}</Label>
						<Input
							id="template-description"
							value={form.description}
							disabled={isReadOnly}
							onChange={(event) =>
								updateForm("description", event.target.value)
							}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label>{t("Trigger type")}</Label>
						<Select
							value={form.triggerType}
							disabled={isReadOnly}
							onValueChange={(value) =>
								updateForm("triggerType", value as TemplateTriggerType)
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
					<div className="flex flex-col gap-2">
						<Label>{t("Execution profile")}</Label>
						<Select
							value={form.executionProfileId}
							disabled={isReadOnly}
							onValueChange={(value) =>
								updateForm("executionProfileId", value as ExecutionProfileId)
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={EXECUTION_PROFILE_NONE}>
									{t("Select profile")}
								</SelectItem>
								{showCurrentExecutionOption ? (
									<SelectItem value={EXECUTION_PROFILE_CURRENT}>
										{t("Current execution")}
									</SelectItem>
								) : null}
								{BUILT_IN_TEMPLATE_IDS.map((id) => {
									const profile = getBuiltInTemplate(id);
									return profile ? (
										<SelectItem key={id} value={id}>
											{profile.name}
										</SelectItem>
									) : null;
								})}
							</SelectContent>
						</Select>
					</div>
					<Label className="flex items-center gap-3 self-end pb-2">
						<Checkbox
							checked={form.isDefaultForTrigger}
							disabled={isReadOnly}
							onCheckedChange={(checked) =>
								updateForm("isDefaultForTrigger", checked === true)
							}
						/>
						{t("Default for trigger")}
					</Label>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-aliases">{t("Aliases")}</Label>
						<Input
							id="template-aliases"
							value={form.aliases}
							disabled={isReadOnly}
							onChange={(event) => updateForm("aliases", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-objective">{t("Objective")}</Label>
						<Textarea
							id="template-objective"
							value={form.objective}
							disabled={isReadOnly}
							onChange={(event) => updateForm("objective", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-steps">{t("Steps")}</Label>
						<Textarea
							id="template-steps"
							className="min-h-32"
							value={form.steps}
							disabled={isReadOnly}
							onChange={(event) => updateForm("steps", event.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-2 md:col-span-2">
						<Label htmlFor="template-verification">
							{t("Verification")}
						</Label>
						<Textarea
							id="template-verification"
							value={form.verification}
							disabled={isReadOnly}
							onChange={(event) =>
								updateForm("verification", event.target.value)
							}
						/>
					</div>
				</div>
			</DialogBody>
			<DialogFooter>
				{selectedTemplate?.source === "user" ? (
					<Button type="button" variant="destructive" onClick={deleteTemplate}>
						<HugeiconsIcon icon={Delete02Icon} className="size-4" />
						{t("Delete")}
					</Button>
				) : null}
				<Button
					type="button"
					onClick={saveTemplate}
					disabled={isLoading || isReadOnly}
				>
					<HugeiconsIcon icon={Edit03Icon} className="size-4" />
					{t("Save template")}
				</Button>
			</DialogFooter>
		</DialogContent>
	);
}

export function TemplatesDialog() {
	const { t } = useTranslation();

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" type="button" className="gap-1.5">
					<HugeiconsIcon icon={Edit03Icon} className="size-4" />
					<span className="hidden sm:inline">{t("Templates")}</span>
				</Button>
			</DialogTrigger>
			<TemplatesDialogContent />
		</Dialog>
	);
}
