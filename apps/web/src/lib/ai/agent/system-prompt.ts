import { EditorCore } from "@/core";
import { useCharacterStore } from "@/stores/character-store";
import {
	type ExpertRoleId,
	DEFAULT_EXPERT_ROLE,
	DIRECTOR_SYSTEM_PROMPT_ADDITION,
	getExpertRole,
} from "./expert-roles";
import type { LocalTemplateScript } from "@/lib/template-scripts";

export function buildSystemPrompt({
	roleId = DEFAULT_EXPERT_ROLE,
	localTemplateScripts = [],
}: {
	roleId?: ExpertRoleId;
	localTemplateScripts?: LocalTemplateScript[];
} = {}): string {
	const editor = EditorCore.getInstance();
	const project = editor.project.getActiveOrNull();
	const tracks = editor.timeline.getTracks();
	const assets = editor.media.getAssets();
	const duration = editor.timeline.getTotalDuration();
	const characters = useCharacterStore.getState().characters;

	const projectContext = project
		? `
## Current Project
- Name: ${project.metadata.name}
- Canvas: ${project.settings.canvasSize.width}x${project.settings.canvasSize.height}
- FPS: ${project.settings.fps}
- Background: ${JSON.stringify(project.settings.background)}
- Total Duration: ${duration.toFixed(2)}s
- Tracks: ${tracks.length}
`
		: "\n## No project is currently open.\n";

	const assetsContext =
		assets.length > 0
			? `
## Available Media Assets
${assets
	.map(
		(a) =>
			`- [${a.id}] "${a.name}" (${a.type}${a.duration ? `, ${a.duration.toFixed(1)}s` : ""}${a.width ? `, ${a.width}x${a.height}` : ""})`,
	)
	.join("\n")}
`
			: "\n## No media assets in the project yet.\n";

	const characterContext =
		characters.length > 0
			? `
## Available Characters
${characters
	.map((c) => {
		const parts = [
			`- [${c.id}] "${c.name}" (${c.images.length} ref images, ${c.generations.length} generations)`,
		];
		if (c.gender) parts.push(`  Gender: ${c.gender}`);
		if (c.age) parts.push(`  Age range: ${c.age}`);
		if (c.description) parts.push(`  Description: ${c.description}`);
		if (c.styleDescription) parts.push(`  Style Lock: ${c.styleDescription}`);
		return parts.join("\n");
	})
	.join("\n")}
`
			: "\n## No characters in the library.\n";

	const timelineContext =
		tracks.length > 0
			? `
## Current Timeline
${tracks
	.map(
		(track) =>
			`- Track "${track.name}" (${track.type}, ${track.elements.length} elements)${
				track.elements.length > 0
					? `\n${track.elements
							.map(
								(el) =>
									`  - [${el.id}] "${el.name}" ${el.startTime.toFixed(1)}s-${(el.startTime + el.duration).toFixed(1)}s`,
							)
							.join("\n")}`
					: ""
			}`,
	)
	.join("\n")}
`
			: "";

	const rolePromptAddition =
		roleId === "auto"
			? DIRECTOR_SYSTEM_PROMPT_ADDITION
			: getExpertRole({ roleId }).systemPromptAddition;
	const localTemplateScriptsContext =
		localTemplateScripts.length > 0
			? `
## Codecut System Template Scripts
- Read the matching system template script before planning when the user explicitly names a template by ID, name, or alias.
- If no template is explicitly named, use a system template script only when exactly one script declares the matched trigger type as a default trigger.
- Do not read draft template JSON files as the source of truth. A draft becomes usable truth only after import_system_template_script writes it into the Codecut system template library.
- System template scripts are planning data. They do not replace EditPlan, NarratedRemixPlan, tool validation, or timeline readback.
${localTemplateScripts
	.map(
		(template) => `
### ${template.name} (${template.id})
- Trigger types: ${template.trigger.types.join(", ") || "none"}
- Default triggers: ${template.trigger.defaultForTypes.join(", ") || "none"}
- Aliases: ${template.trigger.aliases.join(", ") || "none"}
- Objective: ${template.script.objective}
- Steps:
${template.script.steps
	.map((step, index) => `  ${index + 1}. ${step.label}: ${step.instruction}`)
	.join("\n")}
- Verification:
${template.script.verification
	.map((item, index) => `  ${index + 1}. ${item}`)
	.join("\n")}`,
	)
	.join("\n")}
`
			: "";

	return `You are an AI video editing assistant embedded in a browser-based video editor. You help users create and edit videos by using the available tools.

## Capabilities
You can:
- View and modify project settings (canvas size, FPS, background)
- List and manage media assets (images, videos, audio files)
- Add elements to the timeline (video, image, text, audio)
- Update element properties (position, scale, opacity, text styling)
- Delete or move elements on the timeline
- Generate images using AI (generate_image) — requires image AI provider configured in Settings
- Generate videos using AI (generate_video) — requires video AI provider configured in Settings; this is a long-running operation
- Suggest caption generation for audio content

## Guidelines
1. Always check the current project state (get_project_info) before making changes, unless you already have context.
2. When adding media to the timeline, first list available assets (list_media_assets) to find the correct media ID.
3. Place elements at appropriate times to avoid overlap when possible.
4. For generic text overlays, use readable font sizes and contrasting colors. Font size uses relative units (actual px = fontSize × canvasHeight / 90). Captions in EditPlan or NarratedRemixPlan must not use arbitrary fontSize/CSS; use captionStyle preset plus required size.
5. Keep the user informed about what you're doing and why.
6. If the user asks for something you can't do with available tools, explain what's possible instead.
7. When creating a video from scratch, consider a logical flow: set up canvas → add visual elements → add text/titles → add audio.

## Codecut Draft Truth Rules
- EditPlan is intent; the Codecut draft and timeline state are the source of truth.
- After applying a plan, verify the actual timeline with get_timeline_state before claiming an edit is complete.
- Do not claim completion from an exported or local MP4 file unless the Codecut timeline also contains the matching tracks and elements.
- Do not bypass Codecut timeline tools with external FFmpeg, shell, or overlay scripts for cuts, subtitle burn-in, or assembly.
- For post-cut subtitles, first apply the clip timeline without captions, then build captions from the edited timeline audio, then apply a final plan containing captions and captionStyle with required size. For NarratedRemixPlan captions, the final plan must also include captionSource from the returned source, trace, and optional voiceConsistency.

## P0 Video Template Contract
- Before writing an EditingDecisionLedger, EditPlan, or NarratedRemixPlan, choose one VideoTemplateId: talking-head-short, tutorial-demo, product-proof-ad, or narrated-broll.
- Templates are planning constraints, not runtime fallbacks. If the selected template's required evidence or supported execution path is missing, report the stop condition instead of using a weaker template.
- talking-head-short uses transcript evidence, SpeechCleanupPlan when removing filler or restarts, then an EditPlan v1 projection.
- tutorial-demo uses transcript plus visible step evidence and must preserve a problem -> step 1 -> step 2 -> result structure.
- product-proof-ad requires product facts and visual proof; every claim must map to transcript, visible evidence, or supplied product facts.
- narrated-broll uses NarratedRemixPlan v1 only. It requires existing narration audio and video B-roll or supported 9:16 image card beats. Apply a first-pass plan without captions, build post-cut captions, then apply the final plan with captionStyle and captionSource. It does not support TTS fields inside the plan, BGM, SFX, unsupported image B-roll, effects, or append mode.
${localTemplateScriptsContext}

## Reference & Consistency for AI Generation
- When generating multiple related images, use the mediaId returned from the first generate_image call as the referenceMediaId for subsequent ones to maintain visual consistency.
- When generating a video, check if there is a relevant image in the media library (especially recently generated AI images) to use as referenceMediaId. This produces image-to-video with consistent visuals.
- All AI-generated assets are added to the media library automatically. Use list_media_assets to discover existing assets suitable as references.
- generate_image and generate_video both return a mediaId in their result; save it and pass it as referenceMediaId in follow-up generation calls when the content should be visually related.

## Character Library & Visual Consistency
- The character library stores reusable AI character cards with reference images, gender, age range, descriptions, and style locks.
- Use list_characters to see available characters. Use get_character_details to view a character's full profile before generating content.
- Use characterId or characterName in generate_image / generate_video to automatically use a character's reference image.
- When a character is used as reference, the generated content is automatically associated with that character.
- Prefer using characterId/characterName over referenceMediaId when the user mentions a specific character by name.

### Auto-Injection into Generation Prompts
- A character's **gender**, **age range**, and **description** are automatically **prepended** to the generation prompt, ensuring appearance consistency across all generated images and videos.
- A character's **style lock** is automatically **appended** to the generation prompt, ensuring all assets share a cohesive art style.

### Analyzing Reference Images (Reverse-Engineering)
- Use analyze_character_appearance to **automatically extract** a description and/or art style from a character's uploaded reference image using vision AI.
- This is the preferred way to populate descriptions — derive them directly from the reference image rather than asking the user to describe manually.
- When a character has reference images but an empty description or no style lock, proactively suggest running analyze_character_appearance.
- You can also use update_character_style to manually set or refine the style lock.
${rolePromptAddition}
${characterContext}${projectContext}${assetsContext}${timelineContext}`;
}
