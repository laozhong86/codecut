"use client";

import { useTranslation } from "@i18next-toolkit/nextjs-approuter";
import { Link } from "@/lib/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { CharacterCard } from "@/components/characters/character-card";
import { CharacterCreatorDialog } from "@/components/characters/character-creator";
import { CharacterDetailDialog } from "@/components/characters/character-detail";
import { useCharacterStore } from "@/stores/character-store";
import { useAISettingsStore } from "@/stores/ai-settings-store";
import { useGeneratedVoicesStore } from "@/stores/generated-voices-store";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import type { AICharacter } from "@/types/character";
import type { GeneratedVoice } from "@/types/voice";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	PlusSignIcon,
	Search01Icon,
	UserIcon,
} from "@hugeicons/core-free-icons";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function CharactersPage() {
	const { t } = useTranslation();
	const { characters, deleteCharacter } = useCharacterStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [isCreateVoiceOpen, setIsCreateVoiceOpen] = useState(false);
	const [editingCharacter, setEditingCharacter] =
		useState<AICharacter | null>(null);
	const [viewingCharacter, setViewingCharacter] =
		useState<AICharacter | null>(null);
	const [deletingCharacter, setDeletingCharacter] =
		useState<AICharacter | null>(null);

	const filteredCharacters = searchQuery.trim()
		? characters.filter(
				(character) =>
					character.name
						.toLowerCase()
						.includes(searchQuery.toLowerCase()) ||
					character.description
						.toLowerCase()
						.includes(searchQuery.toLowerCase()),
			)
		: characters;

	useEffect(() => {
		void useGeneratedVoicesStore.getState().loadVoices();
	}, []);

	const handleDeleteConfirm = () => {
		if (deletingCharacter) {
			deleteCharacter({ id: deletingCharacter.id });
			if (viewingCharacter?.id === deletingCharacter.id) {
				setViewingCharacter(null);
			}
			setDeletingCharacter(null);
		}
	};

	const handleEditFromDetail = () => {
		if (viewingCharacter) {
			setEditingCharacter(viewingCharacter);
			setViewingCharacter(null);
		}
	};

	return (
		<div className="bg-background min-h-screen">
			<header className="sticky top-0 z-20 px-8 bg-background flex flex-col gap-2">
				<div className="flex items-center justify-between h-16 pt-2">
					<Breadcrumb>
						<BreadcrumbList>
							<BreadcrumbItem>
								<BreadcrumbLink asChild>
									<Link
										href="/projects"
										className="text-sm sm:text-base"
									>
										{t("All projects")}
									</Link>
								</BreadcrumbLink>
							</BreadcrumbItem>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage className="text-sm sm:text-base font-medium">
									{t("Characters")}
								</BreadcrumbPage>
							</BreadcrumbItem>
						</BreadcrumbList>
					</Breadcrumb>

					<div className="flex items-center gap-3 md:gap-4">
						<LanguageToggle />
						<ThemeToggle />
						<div className="relative hidden md:block">
							<HugeiconsIcon
								icon={Search01Icon}
								className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
								aria-hidden="true"
							/>
							<Input
								placeholder={t("Search...")}
								value={searchQuery}
								onChange={(event) =>
									setSearchQuery(event.target.value)
								}
								size="lg"
								className="pl-9"
							/>
						</div>
						<Button
							size="lg"
							variant="outline"
							className="flex px-5 md:px-6"
							onClick={() => setIsCreateVoiceOpen(true)}
						>
							<span className="text-sm font-medium hidden md:block">
								{t("Create Voice")}
							</span>
							<span className="text-sm font-medium block md:hidden">
								{t("Voice")}
							</span>
						</Button>
						<Button
							size="lg"
							className="flex px-5 md:px-6"
							onClick={() => setIsCreateOpen(true)}
							onKeyDown={(event) => {
								if (event.key === "Enter")
									setIsCreateOpen(true);
							}}
						>
							<span className="text-sm font-medium hidden md:block">
								{t("New Character")}
							</span>
							<span className="text-sm font-medium block md:hidden">
								{t("New")}
							</span>
						</Button>
					</div>
				</div>

				<div className="relative block md:hidden mb-4">
					<HugeiconsIcon
						icon={Search01Icon}
						className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
						aria-hidden="true"
					/>
					<Input
						placeholder={t("Search...")}
						value={searchQuery}
						onChange={(event) => setSearchQuery(event.target.value)}
						size="lg"
						className="pl-9"
					/>
				</div>
			</header>

			<main className="mx-auto px-4 pt-2 pb-6 flex flex-col gap-4">
				{filteredCharacters.length === 0 ? (
					<EmptyState
						hasSearch={searchQuery.trim().length > 0}
						searchQuery={searchQuery}
						onClearSearch={() => setSearchQuery("")}
						onCreateNew={() => setIsCreateOpen(true)}
					/>
				) : (
					<div className="xs:grid-cols-2 grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-4 px-4">
						{filteredCharacters.map((character) => (
							<CharacterCard
								key={character.id}
								character={character}
								onClick={() => setViewingCharacter(character)}
								onEdit={() => setEditingCharacter(character)}
								onDelete={() =>
									setDeletingCharacter(character)
								}
							/>
						))}
					</div>
				)}
				<GeneratedVoicesSection />
			</main>

			<CharacterCreatorDialog
				isOpen={isCreateOpen}
				onOpenChange={setIsCreateOpen}
			/>

			<VoiceCreatorDialog
				isOpen={isCreateVoiceOpen}
				onOpenChange={setIsCreateVoiceOpen}
			/>

			<CharacterCreatorDialog
				key={editingCharacter?.id}
				isOpen={editingCharacter !== null}
				onOpenChange={(open) => {
					if (!open) setEditingCharacter(null);
				}}
				editCharacter={editingCharacter}
			/>

			<CharacterDetailDialog
				character={viewingCharacter}
				isOpen={viewingCharacter !== null}
				onOpenChange={(open) => {
					if (!open) setViewingCharacter(null);
				}}
				onEdit={handleEditFromDetail}
			/>

			<AlertDialog
				open={deletingCharacter !== null}
				onOpenChange={(open) => {
					if (!open) setDeletingCharacter(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("Delete Character")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t(
								'Are you sure you want to delete "{{name}}"? This will remove all reference images and generation history for this character.',
								{ name: deletingCharacter?.name },
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
						<AlertDialogAction onClick={handleDeleteConfirm}>
							{t("Delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function VoiceCreatorDialog({
	isOpen,
	onOpenChange,
}: {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useTranslation();
	const { runningHubApiKey } = useAISettingsStore();
	const {
		generateNewVoice,
		cloneVoiceFromReference,
		isGenerating,
		currentTaskStatus,
	} =
		useGeneratedVoicesStore();
	const [mode, setMode] = useState<"new" | "reference">("new");
	const [text, setText] = useState("");
	const [emotionPrompt, setEmotionPrompt] = useState("");
	const [referenceAudioFile, setReferenceAudioFile] = useState<File | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	const hasRunningHubKey = runningHubApiKey.trim().length > 0;
	const hasReferenceAudio =
		mode === "new" || (referenceAudioFile !== null && referenceAudioFile.size > 0);
	const hasRequiredPrompt =
		mode === "new" ? emotionPrompt.trim().length > 0 : true;
	const canGenerate =
		hasRunningHubKey &&
		text.trim().length > 0 &&
		hasRequiredPrompt &&
		hasReferenceAudio &&
		!isGenerating;

	const handleModeChange = (nextMode: "new" | "reference") => {
		setMode(nextMode);
		setError(null);
	};

	const handleSubmit = async () => {
		if (!canGenerate) return;
		setError(null);
		try {
			if (mode === "reference") {
				if (!referenceAudioFile) {
					throw new Error("Reference audio is required");
				}
				await cloneVoiceFromReference({
					text,
					referenceAudioFile,
				});
			} else {
				await generateNewVoice({ text, emotionPrompt });
			}
			setText("");
			setEmotionPrompt("");
			setReferenceAudioFile(null);
			onOpenChange(false);
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: t("Voice design generation failed"),
			);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("Create Voice")}</DialogTitle>
					<DialogDescription>
						{t("Generate a reusable character voice with RunningHub.")}
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						<Button
							type="button"
							variant={mode === "new" ? "secondary" : "outline"}
							onClick={() => handleModeChange("new")}
							aria-pressed={mode === "new"}
							disabled={isGenerating}
							className="min-h-10 whitespace-normal"
						>
							{t("Generate new voice")}
						</Button>
						<Button
							type="button"
							variant={mode === "reference" ? "secondary" : "outline"}
							onClick={() => handleModeChange("reference")}
							aria-pressed={mode === "reference"}
							disabled={isGenerating}
							className="min-h-10 whitespace-normal"
						>
							{t("Clone from reference audio")}
						</Button>
					</div>
					{mode === "reference" && (
						<div className="flex flex-col gap-2">
							<label
								className="text-sm font-medium"
								htmlFor="voice-reference-audio"
							>
								{t("Reference audio")}
							</label>
							<Input
								id="voice-reference-audio"
								type="file"
								accept="audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/*"
								onChange={(event) => {
									setReferenceAudioFile(event.target.files?.[0] ?? null);
								}}
								disabled={isGenerating}
							/>
							{referenceAudioFile && (
								<p className="text-muted-foreground truncate text-xs">
									{referenceAudioFile.name}
								</p>
							)}
						</div>
					)}
					<div className="flex flex-col gap-2">
						<label className="text-sm font-medium" htmlFor="voice-text">
							{t("Voice text")}
						</label>
						<Textarea
							id="voice-text"
							value={text}
							onChange={(event) => setText(event.target.value)}
							disabled={isGenerating}
							rows={5}
						/>
					</div>
					{mode === "new" && (
						<div className="flex flex-col gap-2">
							<label className="text-sm font-medium" htmlFor="voice-emotion">
								{t("Emotion / voice description")}
							</label>
							<Textarea
								id="voice-emotion"
								value={emotionPrompt}
								onChange={(event) => setEmotionPrompt(event.target.value)}
								disabled={isGenerating}
								rows={3}
							/>
						</div>
					)}
					{!hasRunningHubKey && (
						<p className="text-destructive text-sm">
							{t("Configure RunningHub API Key in AI Settings first.")}
						</p>
					)}
					{isGenerating && currentTaskStatus && (
						<p className="text-muted-foreground text-sm">
							{t("Task status")}: {currentTaskStatus}
						</p>
					)}
					{error && <p className="text-destructive text-sm">{error}</p>}
				</DialogBody>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isGenerating}
					>
						{t("Cancel")}
					</Button>
					<Button type="button" onClick={handleSubmit} disabled={!canGenerate}>
						{isGenerating ? t("Generating...") : t("Create Voice")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function GeneratedVoicesSection() {
	const { t } = useTranslation();
	const { voices, isLoading } = useGeneratedVoicesStore();

	return (
		<section className="px-4 pt-2">
			<div className="mb-3 flex items-center justify-between">
				<h2 className="text-base font-medium">{t("Generated Voices")}</h2>
				{isLoading && (
					<span className="text-muted-foreground text-xs">
						{t("Loading...")}
					</span>
				)}
			</div>
			{voices.length === 0 ? (
				<div className="border-border bg-muted/20 rounded-md border p-6 text-sm text-muted-foreground">
					{t("No generated voices yet")}
				</div>
			) : (
				<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
					{voices.map((voice) => (
						<GeneratedVoiceCard key={voice.id} voice={voice} />
					))}
				</div>
			)}
		</section>
	);
}

function GeneratedVoiceCard({ voice }: { voice: GeneratedVoice }) {
	const { t } = useTranslation();
	const { loadVoiceAudio, removeVoice } = useGeneratedVoicesStore();
	const [audioUrl, setAudioUrl] = useState<string | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		let isMounted = true;
		let objectUrl: string | null = null;

		void loadVoiceAudio({ audioBlobId: voice.audioBlobId })
			.then((blob) => {
				if (!isMounted || !blob) return;
				objectUrl = URL.createObjectURL(blob);
				setAudioUrl(objectUrl);
			})
			.catch((error) => {
				if (!isMounted) return;
				setLoadError(
					error instanceof Error ? error.message : t("Failed to load voice"),
				);
			});

		return () => {
			isMounted = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [loadVoiceAudio, t, voice.audioBlobId]);

	return (
		<div className="bg-card flex flex-col gap-3 rounded-md border p-4">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="truncate text-sm font-medium">{voice.name}</h3>
					<p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
						{voice.text}
					</p>
				</div>
				<Button
					type="button"
					variant="destructive-foreground"
					size="sm"
					onClick={() => {
						void removeVoice({ voiceId: voice.id });
					}}
				>
					{t("Delete")}
				</Button>
			</div>
			{voice.emotionPrompt && (
				<Badge variant="secondary" className="w-fit max-w-full truncate">
					{voice.emotionPrompt}
				</Badge>
			)}
			{audioUrl ? (
				<audio className="w-full" controls src={audioUrl}>
					<track kind="captions" />
				</audio>
			) : (
				<p className="text-muted-foreground text-xs">
					{loadError ?? t("Loading audio...")}
				</p>
			)}
			<div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
				<span>{voice.mimeType}</span>
				<span>{new Date(voice.createdAt).toLocaleDateString()}</span>
			</div>
		</div>
	);
}

function EmptyState({
	hasSearch,
	searchQuery,
	onClearSearch,
	onCreateNew,
}: {
	hasSearch: boolean;
	searchQuery: string;
	onClearSearch: () => void;
	onCreateNew: () => void;
}) {
	const { t } = useTranslation();

	if (hasSearch) {
		return (
			<div className="flex flex-col items-center justify-center gap-5 py-16 text-center">
				<HugeiconsIcon
					icon={Search01Icon}
					className="text-muted-foreground size-16 bg-accent/35 border rounded-md p-4"
				/>
				<div className="flex flex-col items-center gap-3">
					<h3 className="text-lg font-medium">
						{t("No results found")}
					</h3>
					<p className="text-muted-foreground max-w-md">
						{t(
							'Your search for "{{query}}" did not return any results.',
							{ query: searchQuery },
						)}
					</p>
				</div>
				<Button onClick={onClearSearch} variant="outline" size="lg">
					{t("Clear search")}
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
			<div className="flex flex-col items-center gap-2">
				<div className="bg-muted/30 flex size-16 items-center justify-center rounded-full">
					<HugeiconsIcon
						icon={UserIcon}
						className="text-muted-foreground size-8"
					/>
				</div>
				<h3 className="text-lg font-medium">
					{t("No characters yet")}
				</h3>
				<p className="text-muted-foreground max-w-md">
					{t(
						"Create AI character cards with front-facing portraits. Use them as reference images for consistent AI generation.",
					)}
				</p>
			</div>
			<Button size="lg" className="gap-2" onClick={onCreateNew}>
				<HugeiconsIcon icon={PlusSignIcon} />
				{t("Create your first character")}
			</Button>
		</div>
	);
}
