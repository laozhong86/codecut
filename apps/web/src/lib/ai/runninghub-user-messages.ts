export const RUNNINGHUB_API_KEY_MISSING_MESSAGE =
	"Please configure a RunningHub API key before generating voice audio.";

const RUNNINGHUB_API_KEY_MISSING_ERRORS = new Set([
	"RUNNINGHUB_API_KEY is required",
	"RUNNINGHUB_API_KEY is not configured",
	"Missing Authorization header",
]);

export function isRunningHubApiKeyMissingError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return RUNNINGHUB_API_KEY_MISSING_ERRORS.has(error.message);
}

export function runningHubVoiceErrorMessage({
	error,
	fallbackMessage,
}: {
	error: unknown;
	fallbackMessage: string;
}): string {
	if (isRunningHubApiKeyMissingError(error)) {
		return RUNNINGHUB_API_KEY_MISSING_MESSAGE;
	}
	return error instanceof Error ? error.message : fallbackMessage;
}
