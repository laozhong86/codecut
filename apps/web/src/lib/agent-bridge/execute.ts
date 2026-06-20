import { getToolByName } from "@/lib/ai/agent/tools";
import type { AgentTool } from "@/lib/ai/agent/tools/types";
import {
	BridgeEnvelopeSchema,
	type BridgeCommandResult,
	type BridgeEnvelope,
	type BridgeEnvelopeResult,
} from "./schema";

type ToolResolver = ({ name }: { name: string }) => AgentTool | undefined;

function skippedResult({
	commandId,
	tool,
}: {
	commandId: string;
	tool: BridgeCommandResult["tool"];
}): BridgeCommandResult {
	return {
		commandId,
		tool,
		success: false,
		message: "Skipped because a previous command failed.",
		skipped: true,
	};
}

export async function executeBridgeEnvelope({
	envelope,
	resolveTool = getToolByName,
}: {
	envelope: BridgeEnvelope;
	resolveTool?: ToolResolver;
}): Promise<BridgeEnvelopeResult> {
	const parsedEnvelope = BridgeEnvelopeSchema.parse(envelope);
	const results: BridgeCommandResult[] = [];
	let shouldSkipRemaining = false;

	for (const command of parsedEnvelope.commands) {
		if (shouldSkipRemaining) {
			results.push(skippedResult({ commandId: command.id, tool: command.tool }));
			continue;
		}

		const tool = resolveTool({ name: command.tool });
		if (!tool) {
			results.push({
				commandId: command.id,
				tool: command.tool,
				success: false,
				message: `Bridge tool "${command.tool}" is not implemented in Codecut.`,
			});
			shouldSkipRemaining = true;
			continue;
		}

		try {
			const result = await tool.execute(command.args);
			results.push({
				commandId: command.id,
				tool: command.tool,
				success: result.success,
				message: result.message,
				data: result.data,
			});
			if (!result.success) {
				shouldSkipRemaining = true;
			}
		} catch (error) {
			results.push({
				commandId: command.id,
				tool: command.tool,
				success: false,
				message:
					error instanceof Error
						? error.message
						: "Bridge command execution failed.",
			});
			shouldSkipRemaining = true;
		}
	}

	return {
		envelopeProjectId: parsedEnvelope.projectId,
		results,
	};
}
