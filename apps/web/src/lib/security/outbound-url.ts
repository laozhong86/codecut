export class UnsafeOutboundUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UnsafeOutboundUrlError";
	}
}

function parseHttpsUrl({ value }: { value: string }): URL {
	const url = new URL(value);
	if (url.protocol !== "https:") {
		throw new UnsafeOutboundUrlError("Outbound URL must use https.");
	}
	if (url.username || url.password) {
		throw new UnsafeOutboundUrlError("Outbound URL must not include credentials.");
	}
	return url;
}

export function requireAllowedHttpsUrl({
	value,
	allowedExactUrls,
	allowedPrefixes = [],
}: {
	value: string;
	allowedExactUrls: string[];
	allowedPrefixes?: string[];
}): URL {
	const url = parseHttpsUrl({ value });
	const href = url.href;
	if (
		!allowedExactUrls.includes(href) &&
		!allowedPrefixes.some((prefix) => href.startsWith(prefix))
	) {
		throw new UnsafeOutboundUrlError(
			"Outbound URL is not an allowed provider endpoint.",
		);
	}
	return url;
}
