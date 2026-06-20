const CHARACTER_PORTRAIT_MODEL = "gpt-5.4-mini";
const CHARACTER_PORTRAIT_REASONING_EFFORT = "low";

export function buildGenerateCharacterPortraitRequest({
	name,
	gender,
	age,
	description,
	styleDescription,
}: {
	name?: string;
	gender?: string;
	age?: string;
	description: string;
	styleDescription?: string;
}) {
	return {
		action: "generate_character_portrait",
		input: {
			model: CHARACTER_PORTRAIT_MODEL,
			reasoningEffort: CHARACTER_PORTRAIT_REASONING_EFFORT,
			name: name?.trim() || undefined,
			gender: gender?.trim() || undefined,
			age: age?.trim() || undefined,
			description: description.trim(),
			styleDescription: styleDescription?.trim() || undefined,
		},
	};
}

export async function generateCharacterPortrait({
	name,
	gender,
	age,
	description,
	styleDescription,
}: {
	name?: string;
	gender?: string;
	age?: string;
	description: string;
	styleDescription?: string;
}): Promise<{ url: string; prompt: string }> {
	const response = await fetch("/api/agent-action", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(
			buildGenerateCharacterPortraitRequest({
				name,
				gender,
				age,
				description,
				styleDescription,
			}),
		),
	});
	const result = (await response.json()) as {
		ok?: boolean;
		error?: string;
		prompt?: string;
		assets?: Array<{ type: string; url: string }>;
	};

	if (!response.ok || !result.ok) {
		throw new Error(result.error ?? `Portrait generation failed (${response.status})`);
	}

	const imageAsset = result.assets?.find((asset) => asset.type === "image");
	if (!imageAsset) {
		throw new Error("Codex did not return a generated portrait image");
	}

	return {
		url: imageAsset.url,
		prompt: result.prompt ?? description.trim(),
	};
}
