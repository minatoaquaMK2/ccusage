export type TokenUsageDelta = {
	inputTokens: number;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	outputTokens: number;
	totalTokens: number;
};

export type TokenUsageEvent = TokenUsageDelta & {
	timestamp: string;
	sessionId: string;
	title: string;
	workingDirectory: string;
	model: string;
	credits: number;
	requestId: string;
};

export type CreditUsageEvent = {
	requestId: string;
	timestamp: string;
	sessionId: string;
	title: string;
	workingDirectory: string;
	model: string;
	credits: number;
};

export type ModelUsage = TokenUsageDelta & {
	credits: number;
	requests: number;
};

export type SessionInfo = {
	id: string;
	title: string;
	workingDirectory: string;
	model: string;
	createdAt: string;
	lastActivityAt: string;
};

export type UsageTotals = TokenUsageDelta & {
	credits: number;
	requests: number;
};
