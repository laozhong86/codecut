import type { OpenAIToolSchema } from "../types";
import { aiGenerationTools } from "./ai-generation-tools";
import { captionTools } from "./caption-tools";
import { characterTools } from "./character-tools";
import { editPlanTools } from "./edit-plan-tools";
import { exportTools } from "./export-tools";
import { maskedEffectTools } from "./masked-effect-tools";
import { mediaTools } from "./media-tools";
import { narratedRemixTools } from "./narrated-remix-tools";
import { projectTools } from "./project-tools";
import { systemTemplateTools } from "./system-template-tools";
import { timelineTools } from "./timeline-tools";
import { transcriptionTools } from "./transcription-tools";
import { ttsTools } from "./tts-tools";
import { type AgentTool, buildToolSchema } from "./types";

const ALL_TOOLS: AgentTool[] = [
	...projectTools,
	...mediaTools,
	...timelineTools,
	...transcriptionTools,
	...editPlanTools,
	...narratedRemixTools,
	...systemTemplateTools,
	...maskedEffectTools,
	...captionTools,
	...aiGenerationTools,
	...characterTools,
	...ttsTools,
	...exportTools,
];

const toolMap = new Map<string, AgentTool>(
	ALL_TOOLS.map((tool) => [tool.name, tool]),
);

export function getToolByName({
	name,
}: {
	name: string;
}): AgentTool | undefined {
	return toolMap.get(name);
}

export function getAllTools(): AgentTool[] {
	return ALL_TOOLS;
}

export function getAllToolSchemas(): OpenAIToolSchema[] {
	return ALL_TOOLS.map((tool) => buildToolSchema({ tool }));
}
