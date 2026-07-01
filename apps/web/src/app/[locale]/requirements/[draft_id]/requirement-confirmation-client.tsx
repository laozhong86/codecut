"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RequirementDraft } from "@/lib/codex-executor/requirement-confirmation";
import {
	buildRequirementConfirmationPatch,
	formStateFromRequirementDraft,
	type RequirementConfirmationFormState,
} from "@/lib/codex-executor/requirement-confirmation-patch";

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
				setError(loadError instanceof Error ? loadError.message : "Load failed.");
			});
		return () => {
			active = false;
		};
	}, [draftId]);

	const draft = readback?.draft;
	const projectName = draft?.requestedProjectName || "";
	const mediaSources = draft?.mediaSources || [];
	const statusText = useMemo(() => {
		if (!readback) return t("加载中");
		if (readback.status === "confirmed") return t("已确认");
		if (readback.status === "cancelled") return t("已取消");
		return t("等待确认");
	}, [readback, t]);

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
						<p className="text-sm text-muted-foreground">{statusText}</p>
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

				<section className="grid gap-4 rounded-md border p-4 md:grid-cols-2">
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
						{t("预设样式")}
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
							<option value="none">{t("无配音")}</option>
							<option value="podcast-female">{t("女声")}</option>
							<option value="podcast-male">{t("男声")}</option>
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
					disabled={isSubmitting || readback.status !== "awaiting_user_confirmation"}
				>
					{t("取消")}
				</Button>
				<Button
					type="button"
					onClick={submitConfirmation}
					disabled={isSubmitting || readback.status !== "awaiting_user_confirmation"}
				>
					{t("确认需求")}
				</Button>
			</div>
		</main>
	);
}
