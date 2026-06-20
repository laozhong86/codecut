import { EditorCore } from "@/core";
import {
	EXPORT_FORMAT_VALUES,
	EXPORT_QUALITY_VALUES,
	type ExportFormat,
	type ExportQuality,
} from "@/types/export";
import { getExportFileExtension, getExportMimeType } from "@/lib/export";
import type { AgentTool } from "./types";

type ParseResult<T> =
	| { success: true; value: T }
	| { success: false; message: string };

function parseFormat(value: unknown): ParseResult<ExportFormat> {
	if (typeof value !== "string") {
		return { success: false, message: "format must be one of: mp4, webm" };
	}
	if (!EXPORT_FORMAT_VALUES.includes(value as ExportFormat)) {
		return { success: false, message: "format must be one of: mp4, webm" };
	}
	return { success: true, value: value as ExportFormat };
}

function parseQuality(value: unknown): ParseResult<ExportQuality> {
	if (typeof value !== "string") {
		return {
			success: false,
			message: "quality must be one of: low, medium, high, very_high",
		};
	}
	if (!EXPORT_QUALITY_VALUES.includes(value as ExportQuality)) {
		return {
			success: false,
			message: "quality must be one of: low, medium, high, very_high",
		};
	}
	return { success: true, value: value as ExportQuality };
}

function parseBooleanArg({
	value,
	name,
}: {
	value: unknown;
	name: string;
}): ParseResult<boolean> {
	if (typeof value !== "boolean") {
		return { success: false, message: `${name} must be true or false` };
	}
	return { success: true, value };
}

export const exportProjectTool: AgentTool = {
	name: "export_project",
	description:
		"Export the current browser editor project. This runs inside the open editor page and can trigger a browser download.",
	parameters: {
		type: "object",
		properties: {
			format: {
				type: "string",
				enum: EXPORT_FORMAT_VALUES,
				description: "Export file format.",
			},
			quality: {
				type: "string",
				enum: EXPORT_QUALITY_VALUES,
				description: "Export render quality.",
			},
			includeAudio: {
				type: "boolean",
				description: "Whether audio should be mixed into the export.",
			},
			download: {
				type: "boolean",
				description: "Whether to trigger a browser download for the exported file.",
			},
			fileName: {
				type: "string",
				description:
					"Optional download filename without extension. Uses the project name when omitted.",
			},
		},
		required: ["format", "quality", "includeAudio", "download"],
	},
	async execute(args) {
		const parsedFormat = parseFormat(args.format);
		if (!parsedFormat.success) {
			return { success: false, message: parsedFormat.message };
		}
		const format = parsedFormat.value;

		const parsedQuality = parseQuality(args.quality);
		if (!parsedQuality.success) {
			return { success: false, message: parsedQuality.message };
		}
		const quality = parsedQuality.value;

		const parsedIncludeAudio = parseBooleanArg({
			value: args.includeAudio,
			name: "includeAudio",
		});
		if (!parsedIncludeAudio.success) {
			return { success: false, message: parsedIncludeAudio.message };
		}
		const includeAudio = parsedIncludeAudio.value;

		const parsedDownload = parseBooleanArg({
			value: args.download,
			name: "download",
		});
		if (!parsedDownload.success) {
			return { success: false, message: parsedDownload.message };
		}
		const download = parsedDownload.value;

		const fileName =
			typeof args.fileName === "string" && args.fileName.trim()
				? args.fileName.trim()
				: undefined;

		const editor = EditorCore.getInstance();
		const activeProject = editor.project.getActiveOrNull();
		if (!activeProject) {
			return { success: false, message: "No active project" };
		}

		const result = await editor.project.export({
			options: {
				format,
				quality,
				fps: activeProject.settings.fps,
				includeAudio,
			},
		});

		if (!result.success || !result.buffer) {
			return {
				success: false,
				message: result.error ?? "Export failed to produce buffer",
			};
		}

		const extension = getExportFileExtension({ format });
		const downloadName = `${fileName ?? activeProject.metadata.name}${extension}`;

		if (download) {
			const blob = new Blob([result.buffer], {
				type: getExportMimeType({ format }),
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = downloadName;
			document.body.appendChild(anchor);
			anchor.click();
			document.body.removeChild(anchor);
			URL.revokeObjectURL(url);
		}

		return {
			success: true,
			message: download
				? `Exported and downloaded ${downloadName}`
				: `Exported ${downloadName}`,
			data: {
				fileName: downloadName,
				format,
				quality,
				includeAudio,
				downloadTriggered: download,
				byteLength: result.buffer.byteLength,
			},
		};
	},
};

export const exportTools: AgentTool[] = [exportProjectTool];
