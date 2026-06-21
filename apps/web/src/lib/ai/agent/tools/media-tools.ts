import { EditorCore } from "@/core";
import {
	processMediaAssets,
	type ProcessedMediaAsset,
} from "@/lib/media/processing";
import type { MediaAsset } from "@/types/assets";
import type { AgentToolResult } from "../types";
import type { AgentTool } from "./types";

interface ImportMediaEditor {
	project: {
		getActive(): { metadata: { id: string } } | null;
	};
	media: {
		addMediaAsset({
			projectId,
			asset,
		}: {
			projectId: string;
			asset: Omit<MediaAsset, "id">;
		}): Promise<string> | string;
	};
}

type ProcessFiles = ({
	files,
}: {
	files: File[];
}) => Promise<ProcessedMediaAsset[]>;

export const listMediaAssetsTool: AgentTool = {
	name: "list_media_assets",
	description:
		"List all media assets available in the current project (images, videos, audio files) with their properties.",
	parameters: {
		type: "object",
		properties: {},
		required: [],
	},
	async execute() {
		const editor = EditorCore.getInstance();
		const assets = editor.media.getAssets();

		const assetList = assets.map((asset) => ({
			id: asset.id,
			name: asset.name,
			type: asset.type,
			duration: asset.duration,
			width: asset.width,
			height: asset.height,
		}));

		return {
			success: true,
			message: `Found ${assetList.length} media asset(s)`,
			data: { assets: assetList },
		};
	},
};

function requiredString({
	args,
	key,
}: {
	args: Record<string, unknown>;
	key: string;
}): string {
	const value = args[key];
	if (typeof value !== "string" || !value) {
		throw new Error(`${key} is required`);
	}
	return value;
}

function requiredNonNegativeNumber({
	args,
	key,
}: {
	args: Record<string, unknown>;
	key: string;
}): number {
	const value = args[key];
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
		throw new Error(`${key} must be a non-negative number`);
	}
	return value;
}

function decodeBase64({ base64 }: { base64: string }): Uint8Array {
	const binary = globalThis.atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes;
}

export async function executeImportMediaFileTool({
	args,
	editor,
	processFiles = ({ files }) => processMediaAssets({ files }),
}: {
	args: Record<string, unknown>;
	editor: ImportMediaEditor;
	processFiles?: ProcessFiles;
}): Promise<AgentToolResult> {
	let fileName: string;
	let mimeType: string;
	let base64: string;
	let size: number;
	let lastModified: number;
	try {
		fileName = requiredString({ args, key: "fileName" });
		mimeType = requiredString({ args, key: "mimeType" });
		base64 = requiredString({ args, key: "base64" });
		size = requiredNonNegativeNumber({ args, key: "size" });
		lastModified = requiredNonNegativeNumber({ args, key: "lastModified" });
	} catch (error) {
		return {
			success: false,
			message:
				error instanceof Error ? error.message : "Invalid media import args",
		};
	}

	let bytes: Uint8Array;
	try {
		bytes = decodeBase64({ base64 });
	} catch {
		return {
			success: false,
			message: "base64 must be a valid base64-encoded file payload",
		};
	}

	if (bytes.byteLength !== size) {
		return {
			success: false,
			message: "Imported file size does not match payload size.",
		};
	}

	const activeProject = editor.project.getActive();
	if (!activeProject?.metadata.id) {
		return { success: false, message: "Active project is required" };
	}

	const file = new File([bytes], fileName, { type: mimeType, lastModified });
	const assets = await processFiles({ files: [file] });
	if (assets.length === 0) {
		return {
			success: false,
			message: "File could not be processed as a supported media asset.",
		};
	}

	const importedAssets = [];
	for (const asset of assets) {
		const id = await editor.media.addMediaAsset({
			projectId: activeProject.metadata.id,
			asset,
		});
		importedAssets.push({
			id,
			name: asset.name,
			type: asset.type,
			duration: asset.duration,
			width: asset.width,
			height: asset.height,
			size: asset.file.size,
		});
	}

	return {
		success: true,
		message: `Imported ${importedAssets.length} media asset(s)`,
		data: { assets: importedAssets },
	};
}

export const importMediaFileTool: AgentTool = {
	name: "import_media_file",
	description:
		"Import one Codex-provided local file payload into the current Codecut media library. This tool does not call an LLM and does not modify the timeline.",
	parameters: {
		type: "object",
		properties: {
			fileName: {
				type: "string",
				description: "Original file name to use in the media library.",
			},
			mimeType: {
				type: "string",
				description: "MIME type detected by the local Codex CLI.",
			},
			base64: {
				type: "string",
				description: "Base64-encoded file payload read by the local Codex CLI.",
			},
			size: {
				type: "number",
				description: "Original file size in bytes.",
			},
			lastModified: {
				type: "number",
				description: "Original file last modified timestamp in milliseconds.",
			},
		},
		required: ["fileName", "mimeType", "base64", "size", "lastModified"],
	},
	async execute(args) {
		return executeImportMediaFileTool({
			args,
			editor: EditorCore.getInstance(),
		});
	},
};

export const mediaTools: AgentTool[] = [listMediaAssetsTool, importMediaFileTool];
