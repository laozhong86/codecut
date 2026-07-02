"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import builtinCharacterOptions from "@/lib/codex-executor/builtin-character-options.json";
import type { RequirementDraft } from "@/lib/codex-executor/requirement-confirmation";
import {
	buildRequirementConfirmationPatch,
	formStateFromRequirementDraft,
	type RequirementConfirmationFormState,
} from "@/lib/codex-executor/requirement-confirmation-patch";
import { builtInTemplates } from "@/lib/templates/registry";

const NETWORK_MATERIAL_PROVIDER_OPTIONS = [
	"pexels",
	"pixabay",
	"coverr",
] as const;
const NETWORK_MATERIAL_PLACEMENT_OPTIONS = [
	"background",
	"top",
	"bottom",
] as const;
const BUILT_IN_TEMPLATE_OPTIONS = builtInTemplates.map((template) => {
	const chineseAlias = template.trigger.aliases.find((alias) =>
		/[\u4e00-\u9fa5]/.test(alias),
	);
	return {
		id: template.id,
		label: chineseAlias
			? `${chineseAlias}（${template.id}）`
			: `${template.name}（${template.id}）`,
	};
});

type RequirementReadback =
	| {
			status: "awaiting_user_confirmation";
			draft: RequirementDraft;
	  }
	| {
			status: "confirmed";
			draft: RequirementDraft;
			confirmed: unknown;
	  }
	| {
			status: "cancelled";
			draft: RequirementDraft;
			cancelled: unknown;
	  };

function mediaSourceLabel(source: RequirementDraft["mediaSources"][number]) {
	if (source.kind === "filePath") return source.filePath;
	if (source.kind === "directoryPath") return source.directoryPath;
	return source.url;
}

function networkMaterialPlacementLabel(
	placement: RequirementConfirmationFormState["networkMaterialPlacement"],
	t: (key: string) => string,
) {
	if (placement === "background") return t("背景");
	if (placement === "top") return t("靠上");
	return t("靠下");
}

function mediaSourceKey(source: RequirementDraft["mediaSources"][number]) {
	return `${source.kind}:${mediaSourceLabel(source)}:${source.mimeType ?? ""}`;
}

export function RequirementConfirmationClient({
	draftId,
}: {
	draftId: string;
}) {
	const { t } = useTranslation();
	const [readback, setReadback] = useState<RequirementReadback | null>(null);
	const [form, setForm] = useState<RequirementConfirmationFormState | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		let active = true;
		fetch(`/api/codex-requirements/${encodeURIComponent(draftId)}`)
			.then(async (response) => {
				const payload = await response.json();
				if (!response.ok) {
					throw new Error(payload.error || "Requirement draft not found.");
				}
				return payload as RequirementReadback;
			})
			.then((payload) => {
				if (!active) return;
				setReadback(payload);
				setForm(formStateFromRequirementDraft(payload.draft));
			})
			.catch((loadError) => {
				if (!active) return;
				setError(
					loadError instanceof Error ? loadError.message : "Load failed.",
				);
			});
		return () => {
			active = false;
		};
	}, [draftId]);

	const draft = readback?.draft;
	const projectName = draft?.requestedProjectName || "";
	const mediaSources = draft?.mediaSources || [];
	const networkMaterialProvidersMissing =
		form?.networkMaterialEnabled === true &&
		form.networkMaterialProviders.length === 0;
	const specifiedTemplateMissing =
		form?.templatePreferenceMode === "specified" &&
		!form.requestedTemplate.trim();
	const draftTemplateNameMissing =
		form?.templatePreferenceMode === "create" && !form.draftTemplateName.trim();

	function updateNetworkMaterialProvider(
		provider: RequirementConfirmationFormState["networkMaterialProviders"][number],
		checked: boolean,
	) {
		if (!form) return;
		setForm({
			...form,
			networkMaterialProviders: NETWORK_MATERIAL_PROVIDER_OPTIONS.filter(
				(option) =>
					option === provider
						? checked
						: form.networkMaterialProviders.includes(option),
			),
			});
		}

	async function submitConfirmation() {
		if (!draft || !form) return;
		setIsSubmitting(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/codex-requirements/${encodeURIComponent(draftId)}/confirm`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						patch: buildRequirementConfirmationPatch({ draft, form }),
					}),
				},
			);
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error || "Confirm failed.");
			}
			setReadback(payload);
		} catch (submitError) {
			setError(
				submitError instanceof Error ? submitError.message : "Confirm failed.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function cancelConfirmation() {
		setIsSubmitting(true);
		setError(null);
		try {
			const response = await fetch(
				`/api/codex-requirements/${encodeURIComponent(draftId)}/cancel`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ reason: "User cancelled in web page." }),
				},
			);
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error || "Cancel failed.");
			}
			setReadback(payload);
		} catch (submitError) {
			setError(
				submitError instanceof Error ? submitError.message : "Cancel failed.",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	if (error) {
		return (
			<main className="min-h-screen bg-background px-4 py-6 text-foreground">
				<p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
					{error}
				</p>
			</main>
		);
	}

	if (!draft || !form) {
		return (
			<main className="flex min-h-screen items-center justify-center bg-background text-foreground">
				{t("加载中")}
			</main>
		);
	}

	return (
		<main className="min-h-screen bg-background text-foreground">
			<div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5 pb-28">
				<header className="border-b pb-4">
					<div>
						<h1 className="text-2xl font-semibold">{projectName}</h1>
					</div>
				</header>

				<section className="rounded-md border p-4">
					<h2 className="mb-3 text-base font-semibold">{t("素材")}</h2>
					<div className="grid gap-2">
						{mediaSources.map((source) => (
							<div
								key={mediaSourceKey(source)}
								className="rounded-md bg-muted px-3 py-2 text-sm"
							>
								<span className="mr-2 text-muted-foreground">
									{source.kind}
								</span>
								<span className="break-all">{mediaSourceLabel(source)}</span>
							</div>
						))}
					</div>
				</section>

				<section className="rounded-md border p-4">
					<h2 className="mb-3 text-base font-semibold">{t("成品规格")}</h2>
					<div className="grid gap-4 md:grid-cols-2">
						<label className="grid gap-2 text-sm font-medium">
							{t("目标画幅")}
							<select
								className="h-10 rounded-md border bg-background px-3"
								value={form.aspectRatio}
								onChange={(event) =>
									setForm({
										...form,
										aspectRatio: event.target
											.value as RequirementConfirmationFormState["aspectRatio"],
									})
								}
							>
								<option value="9:16">{t("9:16 竖屏")}</option>
								<option value="16:9">{t("16:9 横屏")}</option>
								<option value="1:1">{t("1:1 方形")}</option>
							</select>
						</label>
						<label className="grid gap-2 text-sm font-medium">
							{t("目标时长")}
							<select
								className="h-10 rounded-md border bg-background px-3"
								value={form.durationMode}
								onChange={(event) =>
									setForm({
										...form,
										durationMode: event.target
											.value as RequirementConfirmationFormState["durationMode"],
									})
								}
							>
								<option value="auto">{t("自动")}</option>
								<option value="preserve_source">{t("保留原片时长")}</option>
								<option value="custom_range">{t("自定义范围")}</option>
							</select>
						</label>
						<label className="grid gap-2 text-sm font-medium">
							{t("质量")}
							<select
								className="h-10 rounded-md border bg-background px-3"
								value={form.outputQuality}
								onChange={(event) =>
									setForm({
										...form,
										outputQuality: event.target
											.value as RequirementConfirmationFormState["outputQuality"],
									})
								}
							>
								<option value="medium">{t("中")}</option>
								<option value="high">{t("高")}</option>
								<option value="very_high">{t("很高")}</option>
								<option value="low">{t("低")}</option>
							</select>
						</label>
						<div className="grid gap-2 text-sm font-medium">
							<span>{t("视频封面")}</span>
							<div className="flex h-10 items-center justify-between gap-4 rounded-md border bg-background px-3">
								<span className="text-muted-foreground">{t("开启")}</span>
								<Switch
									checked={form.generateIntroCover}
									onCheckedChange={(checked) =>
										setForm({ ...form, generateIntroCover: checked })
									}
								/>
							</div>
						</div>
					</div>
				</section>

				<section className="rounded-md border p-4">
					<h2 className="mb-3 text-base font-semibold">{t("模板")}</h2>
					<div className="grid gap-4 md:grid-cols-2">
						<label className="grid gap-2 text-sm font-medium">
							{t("模板匹配")}
							<select
								className="h-10 rounded-md border bg-background px-3"
								value={form.templatePreferenceMode}
								onChange={(event) =>
									setForm({
										...form,
										templatePreferenceMode: event.target
											.value as RequirementConfirmationFormState["templatePreferenceMode"],
									})
								}
							>
								<option value="auto">{t("Agent 自动匹配")}</option>
								<option value="specified">{t("指定模板")}</option>
								<option value="create">{t("创建模板")}</option>
							</select>
						</label>
						{form.templatePreferenceMode === "specified" && (
							<label className="grid gap-2 text-sm font-medium">
								{t("模板名称")}
								<select
									className="h-10 rounded-md border bg-background px-3"
									value={form.requestedTemplate}
									onChange={(event) =>
										setForm({
											...form,
											requestedTemplate: event.target
												.value as RequirementConfirmationFormState["requestedTemplate"],
										})
									}
								>
									<option value="">{t("请选择模板")}</option>
									{BUILT_IN_TEMPLATE_OPTIONS.map((template) => (
										<option key={template.id} value={template.id}>
											{template.label}
										</option>
									))}
								</select>
								{specifiedTemplateMissing && (
									<p className="text-sm text-destructive">
										{t("请选择内置模板")}
									</p>
								)}
							</label>
						)}
						{form.templatePreferenceMode === "create" && (
							<label className="grid gap-2 text-sm font-medium">
								{t("模板草稿名称")}
								<input
									className="h-10 rounded-md border bg-background px-3"
									value={form.draftTemplateName}
									onChange={(event) =>
										setForm({
											...form,
											draftTemplateName: event.target.value,
										})
									}
								/>
								{draftTemplateNameMissing && (
									<p className="text-sm text-destructive">
										{t("请输入模板草稿名称")}
									</p>
								)}
							</label>
						)}
					</div>
				</section>

				<section className="grid gap-4 rounded-md border p-4">
					<div className="flex items-center justify-between gap-4">
						<div>
							<h2 className="text-base font-semibold">{t("网络素材匹配")}</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								{draft.networkMaterialMatching.enabled
									? t("模板建议：开启网络素材匹配")
									: t("模板建议：关闭网络素材匹配")}
							</p>
						</div>
						<Switch
							checked={form.networkMaterialEnabled}
							onCheckedChange={(checked) =>
								setForm({ ...form, networkMaterialEnabled: checked })
							}
						/>
					</div>
					<div className="grid gap-4 md:grid-cols-2">
						<label className="grid gap-2 text-sm font-medium">
							{t("显示位置")}
							<select
								className="h-10 rounded-md border bg-background px-3"
								value={form.networkMaterialPlacement}
								disabled={!form.networkMaterialEnabled}
								onChange={(event) =>
									setForm({
										...form,
										networkMaterialPlacement: event.target
											.value as RequirementConfirmationFormState["networkMaterialPlacement"],
									})
								}
							>
								{NETWORK_MATERIAL_PLACEMENT_OPTIONS.map((placement) => (
									<option key={placement} value={placement}>
										{networkMaterialPlacementLabel(placement, t)}
									</option>
								))}
							</select>
						</label>
						<div className="grid gap-2 text-sm font-medium">
							<span>{t("素材渠道")}</span>
							<div className="flex min-h-10 flex-wrap items-center gap-4 rounded-md border bg-background px-3 py-2">
								{NETWORK_MATERIAL_PROVIDER_OPTIONS.map((provider) => (
									<label
										key={provider}
										className="flex items-center gap-2 text-sm capitalize"
									>
										<input
											type="checkbox"
											checked={form.networkMaterialProviders.includes(provider)}
											disabled={!form.networkMaterialEnabled}
											onChange={(event) =>
												updateNetworkMaterialProvider(
													provider,
													event.target.checked,
												)
											}
										/>
										{provider}
									</label>
								))}
							</div>
							{networkMaterialProvidersMissing && (
								<p className="text-sm text-destructive">
									{t("开启网络素材匹配时至少选择一个渠道")}
								</p>
							)}
						</div>
					</div>
				</section>

				<section className="grid gap-4 rounded-md border p-4">
					<div className="flex items-center justify-between gap-4">
						<h2 className="text-base font-semibold">{t("标题")}</h2>
						<Switch
							checked={form.titleEnabled}
							onCheckedChange={(checked) =>
								setForm({ ...form, titleEnabled: checked })
							}
						/>
					</div>
					{form.titleEnabled && (
						<div className="grid gap-4 md:grid-cols-2">
							<label className="grid gap-2 text-sm font-medium">
								{t("标题")}
								<select
									className="h-10 rounded-md border bg-background px-3"
									value={form.titleMode}
									onChange={(event) =>
										setForm({
											...form,
											titleMode: event.target
												.value as RequirementConfirmationFormState["titleMode"],
										})
									}
								>
									<option value="auto">{t("自动生成")}</option>
									<option value="custom">{t("自定义")}</option>
								</select>
							</label>
							{form.titleMode === "custom" && (
								<label className="grid gap-2 text-sm font-medium">
									{t("标题文本")}
									<input
										className="h-10 rounded-md border bg-background px-3"
										value={form.titleText}
										onChange={(event) =>
											setForm({ ...form, titleText: event.target.value })
										}
									/>
								</label>
							)}
							<label className="grid gap-2 text-sm font-medium">
								{t("标题样式")}
								<select
									className="h-10 rounded-md border bg-background px-3"
									value={form.titleStylePreset}
									onChange={(event) =>
										setForm({
											...form,
											titleStylePreset: event.target
												.value as RequirementConfirmationFormState["titleStylePreset"],
										})
									}
								>
									<option value="hook_title">{t("顶部醒目")}</option>
									<option value="lower_title">{t("下方标题")}</option>
									<option value="social_hook">{t("社媒钩子")}</option>
									<option value="product_badge">{t("产品标签")}</option>
									<option value="chapter_bumper">{t("章节提示")}</option>
								</select>
							</label>
						</div>
					)}
				</section>

				<section className="grid gap-4 rounded-md border p-4">
					<div className="flex items-center justify-between gap-4">
						<h2 className="text-base font-semibold">{t("字幕")}</h2>
						<Switch
							checked={form.captionEnabled}
							onCheckedChange={(checked) =>
								setForm({ ...form, captionEnabled: checked })
							}
						/>
					</div>
					{form.captionEnabled && (
						<div className="grid gap-4 md:grid-cols-2">
							<label className="grid gap-2 text-sm font-medium">
								{t("字幕语言")}
								<select
									className="h-10 rounded-md border bg-background px-3"
									value={form.captionLanguage}
									onChange={(event) =>
										setForm({ ...form, captionLanguage: event.target.value })
									}
								>
									<option value="zh-CN">{t("中文")}</option>
									<option value="en">{t("英文")}</option>
									<option value="auto">{t("自动")}</option>
								</select>
							</label>
							<label className="grid gap-2 text-sm font-medium">
								{t("字幕大小")}
								<select
									className="h-10 rounded-md border bg-background px-3"
									value={form.captionSize}
									onChange={(event) =>
										setForm({
											...form,
											captionSize: event.target
												.value as RequirementConfirmationFormState["captionSize"],
										})
									}
								>
									<option value="small">{t("小")}</option>
									<option value="medium">{t("中")}</option>
									<option value="large">{t("大")}</option>
								</select>
							</label>
							<label className="grid gap-2 text-sm font-medium">
								{t("字体样式")}
								<select
									className="h-10 rounded-md border bg-background px-3"
									value={form.captionStylePreset}
									onChange={(event) =>
										setForm({
											...form,
											captionStylePreset: event.target
												.value as RequirementConfirmationFormState["captionStylePreset"],
										})
									}
								>
									<option value="creator-clean">{t("口播醒目")}</option>
									<option value="short-form-bold">{t("短视频粗体")}</option>
									<option value="product-punch">{t("产品冲击")}</option>
									<option value="minimal-reel">{t("极简短片")}</option>
								</select>
							</label>
						</div>
					)}
				</section>

				<section className="grid gap-4 rounded-md border p-4">
					<h2 className="text-base font-semibold">{t("角色与声音")}</h2>
					<div className="grid gap-4 md:grid-cols-3">
						<label className="grid gap-2 text-sm font-medium">
							{t("角色")}
							<select
								className="h-10 rounded-md border bg-background px-3"
								value={form.characterId}
								onChange={(event) =>
									setForm({
										...form,
										characterId: event.target
											.value as RequirementConfirmationFormState["characterId"],
									})
								}
							>
								<option value="none">{t("无")}</option>
								{builtinCharacterOptions.map((character) => (
									<option key={character.id} value={character.id}>
										{t(character.name)}
									</option>
								))}
							</select>
						</label>
						<label className="grid gap-2 text-sm font-medium">
							{t("配音")}
							<select
								className="h-10 rounded-md border bg-background px-3"
								value={form.voicePackId}
								onChange={(event) =>
									setForm({
										...form,
										voicePackId: event.target
											.value as RequirementConfirmationFormState["voicePackId"],
									})
								}
							>
								<option value="none">{t("关闭")}</option>
								<option value="podcast-female">{t("女声")}</option>
								<option value="podcast-male">{t("男声")}</option>
							</select>
						</label>
						<label className="grid gap-2 text-sm font-medium">
							{t("BGM")}
							<select
								className="h-10 rounded-md border bg-background px-3"
								value={form.bgmMode}
								onChange={(event) =>
									setForm({
										...form,
										bgmMode: event.target
											.value as RequirementConfirmationFormState["bgmMode"],
									})
								}
							>
								<option value="none">{t("无")}</option>
								<option value="smart_match">{t("智能匹配")}</option>
							</select>
						</label>
					</div>
				</section>

				<div className="grid gap-2 rounded-md border p-4 text-sm font-medium">
					<label htmlFor="requirements">{t("需求")}</label>
					<Textarea
						id="requirements"
						className="min-h-36"
						value={form.requirements}
						onChange={(event) =>
							setForm({ ...form, requirements: event.target.value })
						}
					/>
				</div>
			</div>
			<div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 justify-center gap-3">
				<Button
					type="button"
					variant="outline"
					onClick={cancelConfirmation}
					disabled={
						isSubmitting || readback.status !== "awaiting_user_confirmation"
					}
				>
					{t("取消")}
				</Button>
				<Button
					type="button"
					onClick={submitConfirmation}
					disabled={
						isSubmitting ||
						readback.status !== "awaiting_user_confirmation" ||
						networkMaterialProvidersMissing ||
						specifiedTemplateMissing ||
						draftTemplateNameMissing
					}
				>
					{t("确认需求")}
				</Button>
			</div>
		</main>
	);
}
