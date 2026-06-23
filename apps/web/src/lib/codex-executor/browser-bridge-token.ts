export const EXECUTOR_BROWSER_BRIDGE_TOKEN_HEADER =
	"x-codecut-editor-bridge-token";

export function executorBrowserBridgeHeaders({
	bridgeToken,
	contentType,
}: {
	bridgeToken: string;
	contentType?: string;
}): Record<string, string> {
	return {
		...(contentType ? { "Content-Type": contentType } : {}),
		[EXECUTOR_BROWSER_BRIDGE_TOKEN_HEADER]: bridgeToken,
	};
}

export function readExecutorBrowserBridgeTokenFromLocation(): string | null {
	if (typeof window === "undefined") {
		return null;
	}

	const hash = window.location.hash.replace(/^#/, "");
	const params = new URLSearchParams(hash);
	return params.get("bridgeToken");
}
