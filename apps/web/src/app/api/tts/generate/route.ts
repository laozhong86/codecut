import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
	synthesizeVolcengineClonedVoice,
	VOLCENGINE_VOICE_CLONE_PROVIDER_ID,
} from "@/lib/ai/providers/volcengine-openspeech";

const TTS_API_BASE = "https://api.milorapart.top/apis/mbAIsc";

const requestSchema = z
	.object({
		text: z.string().min(1, "Text is required").max(2000, "Text too long"),
		voice: z.string().optional(),
		provider: z
			.enum(["legacy-tts", VOLCENGINE_VOICE_CLONE_PROVIDER_ID])
			.optional(),
		voiceType: z.string().trim().optional(),
		speedRatio: z.number().positive().optional(),
	})
	.superRefine((value, context) => {
		if (
			value.provider === VOLCENGINE_VOICE_CLONE_PROVIDER_ID &&
			!value.voiceType?.trim()
		) {
			context.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["voiceType"],
				message: "Volcengine voice_type is required",
			});
		}
	});

const upstreamResponseSchema = z.object({
	code: z.number(),
	url: z.string().url(),
});

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const validation = requestSchema.safeParse(body);

		if (!validation.success) {
			return NextResponse.json(
				{
					error: "Invalid request",
					details: validation.error.flatten().fieldErrors,
				},
				{ status: 400 },
			);
		}

		const { provider, text } = validation.data;
		if (provider === VOLCENGINE_VOICE_CLONE_PROVIDER_ID) {
			const apiKey = process.env.VOLCENGINE_OPEN_SPEECH_API_KEY?.trim();
			if (!apiKey) {
				return NextResponse.json(
					{ error: "VOLCENGINE_OPEN_SPEECH_API_KEY is required" },
					{ status: 503 },
				);
			}
			const result = await synthesizeVolcengineClonedVoice({
				apiKey,
				voiceType: validation.data.voiceType,
				text,
				speedRatio: validation.data.speedRatio,
			});
			return NextResponse.json({
				audio: result.audioBytes.toString("base64"),
				provider: VOLCENGINE_VOICE_CLONE_PROVIDER_ID,
				providerTaskId: result.taskId,
			});
		}

		const upstreamUrl = `${TTS_API_BASE}?${new URLSearchParams({ text, format: "mp3" })}`;
		const upstreamResponse = await fetch(upstreamUrl);

		if (!upstreamResponse.ok) {
			return NextResponse.json(
				{ error: `Upstream error: ${upstreamResponse.status}` },
				{ status: 502 },
			);
		}

		const upstreamData = await upstreamResponse.json();
		const parsed = upstreamResponseSchema.safeParse(upstreamData);

		if (!parsed.success || parsed.data.code !== 200) {
			return NextResponse.json(
				{ error: "TTS generation failed" },
				{ status: 502 },
			);
		}

		const audioResponse = await fetch(parsed.data.url);
		if (!audioResponse.ok) {
			return NextResponse.json(
				{ error: `Failed to download audio: ${audioResponse.status}` },
				{ status: 502 },
			);
		}

		const audioArrayBuffer = await audioResponse.arrayBuffer();
		const base64 = Buffer.from(audioArrayBuffer).toString("base64");

		return NextResponse.json({ audio: base64 });
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error("TTS generate error:", error);
		return NextResponse.json(
			{ error: "Internal server error", detail: message },
			{ status: 500 },
		);
	}
}
