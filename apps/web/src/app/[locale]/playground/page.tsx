"use client";

import { notFound } from "next/navigation";
import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { IS_DEV } from "@/constants/editor-constants";
import { BasePage } from "@/app/base-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TranscriptionPlayground } from "./_components/transcription-playground";

if (!IS_DEV) {
	notFound();
}

export default function PlaygroundPage() {
	const { t } = useTranslation();

	return (
		<BasePage title={t("Dev Playground")} maxWidth="6xl">
			<Tabs defaultValue="transcription">
				<TabsList>
					<TabsTrigger value="transcription">
						{t("Transcription")}
					</TabsTrigger>
				</TabsList>

				<TabsContent value="transcription" className="mt-6">
					<TranscriptionPlayground />
				</TabsContent>
			</Tabs>
		</BasePage>
	);
}
