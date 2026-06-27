export type ControlledSubtitleFormat = "srt" | "ass";

export interface ControlledSubtitleCaption {
	text: string;
	startTime: number;
	duration: number;
}

const SRT_TIME_RE =
	/^(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})$/;
const ASS_TIME_RE = /^(\d+):(\d{2}):(\d{2})\.(\d{2})$/;
const ASS_ALLOWED_EVENT_FIELDS = new Set([
	"Layer",
	"Start",
	"End",
	"Style",
	"Name",
	"MarginL",
	"MarginR",
	"MarginV",
	"Effect",
	"Text",
]);
const ASS_REQUIRED_EVENT_FIELDS = [
	"Start",
	"End",
	"Style",
	"MarginL",
	"MarginR",
	"MarginV",
	"Effect",
	"Text",
];

function normalizeContent(content: string): string {
	return content.replace(/^\uFEFF/u, "").replace(/\r\n?/g, "\n");
}

function roundSeconds(value: number): number {
	return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function parseSrtTimestamp(value: string, cueNumber: number): number {
	const match = value.match(/^(\d{2}):(\d{2}):(\d{2}),(\d{3})$/);
	if (!match) {
		throw new Error(`Invalid SRT timestamp at cue ${cueNumber}.`);
	}
	const [, hours, minutes, seconds, milliseconds] = match;
	return (
		Number(hours) * 3600 +
		Number(minutes) * 60 +
		Number(seconds) +
		Number(milliseconds) / 1000
	);
}

function parseAssTimestamp(value: string, dialogueNumber: number): number {
	const match = value.match(ASS_TIME_RE);
	if (!match) {
		throw new Error(`Invalid ASS timestamp at dialogue ${dialogueNumber}.`);
	}
	const [, hours, minutes, seconds, centiseconds] = match;
	return (
		Number(hours) * 3600 +
		Number(minutes) * 60 +
		Number(seconds) +
		Number(centiseconds) / 100
	);
}

function normalizePlainText({
	text,
	label,
	markupError,
}: {
	text: string;
	label: string;
	markupError: string;
}): string {
	if (/<\/?[A-Za-z][^>]*>/u.test(text)) {
		throw new Error(markupError);
	}
	const normalized = text
		.split("\n")
		.map((line) => line.trim().replace(/\s+/g, " "))
		.filter(Boolean)
		.join("\n")
		.trim();
	if (!normalized) {
		throw new Error(`Empty subtitle text at ${label}.`);
	}
	return normalized;
}

function assertTiming({
	captions,
	format,
}: {
	captions: ControlledSubtitleCaption[];
	format: ControlledSubtitleFormat;
}): void {
	if (captions.length === 0) {
		throw new Error("Subtitle file contains no cues.");
	}
	for (let index = 0; index < captions.length; index += 1) {
		const caption = captions[index];
		if (caption.duration <= 0) {
			throw new Error(`Subtitle cue ${index + 1} must have positive duration.`);
		}
		if (index === 0) continue;
		const previous = captions[index - 1];
		if (previous.startTime + previous.duration > caption.startTime) {
			throw new Error(
				format === "srt" ? "SRT cues must not overlap." : "ASS cues must not overlap.",
			);
		}
	}
}

function parseSrt(content: string): ControlledSubtitleCaption[] {
	const blocks = normalizeContent(content)
		.split(/\n{2,}/u)
		.map((block) => block.trim())
		.filter(Boolean);
	const captions = blocks.map((block, index) => {
		const cueNumber = index + 1;
		const lines = block.split("\n");
		if (lines.length < 3) {
			throw new Error(`Invalid SRT cue ${cueNumber}.`);
		}
		if (lines[0] !== String(cueNumber)) {
			throw new Error(`SRT cue ${cueNumber} must use a sequential numeric block.`);
		}
		const match = lines[1].match(SRT_TIME_RE);
		if (!match) {
			throw new Error(`Invalid SRT timing at cue ${cueNumber}.`);
		}
		const startTime = parseSrtTimestamp(
			`${match[1]}:${match[2]}:${match[3]},${match[4]}`,
			cueNumber,
		);
		const endTime = parseSrtTimestamp(
			`${match[5]}:${match[6]}:${match[7]},${match[8]}`,
			cueNumber,
		);
		if (endTime <= startTime) {
			throw new Error(`SRT cue ${cueNumber} end time must be after start time.`);
		}
		return {
			text: normalizePlainText({
				text: lines.slice(2).join("\n"),
				label: `cue ${cueNumber}`,
				markupError: "SRT subtitle text cannot contain HTML-like tags.",
			}),
			startTime,
			duration: roundSeconds(endTime - startTime),
		};
	});
	assertTiming({ captions, format: "srt" });
	return captions;
}

function splitAssValues({
	line,
	fieldCount,
	dialogueNumber,
}: {
	line: string;
	fieldCount: number;
	dialogueNumber: number;
}): string[] {
	const values = line.split(",", fieldCount - 1);
	const consumedPrefix = values.join(",");
	const textStart = consumedPrefix.length + (values.length > 0 ? 1 : 0);
	const result = [...values, line.slice(textStart)];
	if (result.length !== fieldCount || result.some((value) => value === undefined)) {
		throw new Error(`Invalid ASS dialogue ${dialogueNumber}.`);
	}
	return result;
}

function requireAssField({
	values,
	fields,
	name,
	dialogueNumber,
}: {
	values: Record<string, string>;
	fields: string[];
	name: string;
	dialogueNumber: number;
}): string {
	if (!fields.includes(name)) {
		throw new Error(`ASS Format is missing ${name}.`);
	}
	const value = values[name];
	if (value === undefined) {
		throw new Error(`ASS dialogue ${dialogueNumber} is missing ${name}.`);
	}
	return value.trim();
}

function normalizeAssText({
	text,
	dialogueNumber,
}: {
	text: string;
	dialogueNumber: number;
}): string {
	if (/[{}]/u.test(text)) {
		throw new Error("ASS override blocks are not supported.");
	}
	if (/\\(?![Nnh])/u.test(text)) {
		throw new Error(`Unsupported ASS escape at dialogue ${dialogueNumber}.`);
	}
	const withLineBreaks = text.replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ");
	return normalizePlainText({
		text: withLineBreaks,
		label: `dialogue ${dialogueNumber}`,
		markupError: "ASS subtitle text cannot contain HTML-like tags.",
	});
}

function parseAss(content: string): ControlledSubtitleCaption[] {
	let fields: string[] | null = null;
	let dialogueNumber = 0;
	let section = "";
	const captions: ControlledSubtitleCaption[] = [];

	for (const rawLine of normalizeContent(content).split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith(";")) continue;
		const sectionMatch = line.match(/^\[([^\]]+)\]$/u);
		if (sectionMatch) {
			section = sectionMatch[1].trim().toLowerCase();
			continue;
		}
		if (line.startsWith("Style:")) {
			const styleName = line.slice("Style:".length).split(",", 1)[0]?.trim();
			if (styleName !== "Default") {
				throw new Error(`Unsupported ASS style definition "${styleName}".`);
			}
			continue;
		}
		if (line.startsWith("Format:")) {
			if (section !== "events") continue;
			fields = line
				.slice("Format:".length)
				.split(",")
				.map((field) => field.trim());
			for (const field of fields) {
				if (!ASS_ALLOWED_EVENT_FIELDS.has(field)) {
					throw new Error(`Unsupported ASS event field "${field}".`);
				}
			}
			for (const field of ASS_REQUIRED_EVENT_FIELDS) {
				if (!fields.includes(field)) {
					throw new Error(`ASS Format is missing ${field}.`);
				}
			}
			continue;
		}
		if (!line.startsWith("Dialogue:")) continue;
		if (section !== "events") {
			throw new Error("ASS Dialogue requires an Events section.");
		}
		dialogueNumber += 1;
		if (!fields) {
			throw new Error("ASS Dialogue requires an Events Format line.");
		}
		const values = splitAssValues({
			line: line.slice("Dialogue:".length).trimStart(),
			fieldCount: fields.length,
			dialogueNumber,
		});
		const mapped = Object.fromEntries(
			fields.map((field, index) => [field, values[index] ?? ""]),
		);
		const style = requireAssField({
			values: mapped,
			fields,
			name: "Style",
			dialogueNumber,
		});
		if (style !== "Default") {
			throw new Error("ASS dialogue style must be Default.");
		}
		for (const margin of ["MarginL", "MarginR", "MarginV"] as const) {
			const value = requireAssField({
				values: mapped,
				fields,
				name: margin,
				dialogueNumber,
			});
			if (!/^0+$/u.test(value)) {
				throw new Error(`Unsupported ASS margin at dialogue ${dialogueNumber}.`);
			}
		}
		const effect = requireAssField({
			values: mapped,
			fields,
			name: "Effect",
			dialogueNumber,
		});
		if (effect) {
			throw new Error(`Unsupported ASS effect at dialogue ${dialogueNumber}.`);
		}
		const startTime = parseAssTimestamp(
			requireAssField({
				values: mapped,
				fields,
				name: "Start",
				dialogueNumber,
			}),
			dialogueNumber,
		);
		const endTime = parseAssTimestamp(
			requireAssField({
				values: mapped,
				fields,
				name: "End",
				dialogueNumber,
			}),
			dialogueNumber,
		);
		if (endTime <= startTime) {
			throw new Error(
				`ASS dialogue ${dialogueNumber} end time must be after start time.`,
			);
		}
		captions.push({
			text: normalizeAssText({
				text: requireAssField({
					values: mapped,
					fields,
					name: "Text",
					dialogueNumber,
				}),
				dialogueNumber,
			}),
			startTime,
			duration: roundSeconds(endTime - startTime),
		});
	}

	assertTiming({ captions, format: "ass" });
	return captions;
}

export function parseControlledSubtitles({
	format,
	content,
}: {
	format: ControlledSubtitleFormat;
	content: string;
}): ControlledSubtitleCaption[] {
	return format === "srt" ? parseSrt(content) : parseAss(content);
}
