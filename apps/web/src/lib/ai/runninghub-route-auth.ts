interface RunningHubApiKeyRequest {
	headers: Headers;
}

export function runningHubApiKeyFromRequest({
	request,
	runtimeApiKey = process.env.RUNNINGHUB_API_KEY,
}: {
	request: RunningHubApiKeyRequest;
	runtimeApiKey?: string;
}): string {
	const authorization = request.headers.get("authorization");
	const match = authorization?.match(/^Bearer\s+(.+)$/i);
	if (match?.[1]?.trim()) {
		return match[1].trim();
	}

	const trimmedRuntimeApiKey = runtimeApiKey?.trim();
	if (trimmedRuntimeApiKey) {
		return trimmedRuntimeApiKey;
	}

	throw new Error("Missing Authorization header");
}
