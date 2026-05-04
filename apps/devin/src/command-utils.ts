import type { CreditUsageEvent, ModelUsage, TokenUsageEvent, UsageTotals } from './_types.ts';
import { formatNumber } from '@ccusage/terminal/table';

export type UsageSummary = UsageTotals & {
	models: Map<string, ModelUsage>;
};

export type SummaryRow = UsageSummary & {
	key: string;
	modelsUsed: string[];
};

export function createEmptySummary(): UsageSummary {
	return {
		inputTokens: 0,
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
		credits: 0,
		requests: 0,
		models: new Map(),
	};
}

export function addEventToSummary(summary: UsageSummary, event: TokenUsageEvent): void {
	summary.inputTokens += event.inputTokens;
	summary.cacheCreationInputTokens += event.cacheCreationInputTokens;
	summary.cacheReadInputTokens += event.cacheReadInputTokens;
	summary.outputTokens += event.outputTokens;
	summary.totalTokens += event.totalTokens;
	summary.requests += 1;

	const existing = summary.models.get(event.model) ?? {
		inputTokens: 0,
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
		credits: 0,
		requests: 0,
	};

	existing.inputTokens += event.inputTokens;
	existing.cacheCreationInputTokens += event.cacheCreationInputTokens;
	existing.cacheReadInputTokens += event.cacheReadInputTokens;
	existing.outputTokens += event.outputTokens;
	existing.totalTokens += event.totalTokens;
	existing.requests += 1;

	summary.models.set(event.model, existing);
}

export function addCreditEventToSummary(summary: UsageSummary, event: CreditUsageEvent): void {
	summary.credits += event.credits;
}

export function groupUsage(
	events: TokenUsageEvent[],
	creditEvents: CreditUsageEvent[],
	getKey: (event: TokenUsageEvent) => string,
	getCreditKey: (event: CreditUsageEvent) => string,
): SummaryRow[] {
	const grouped = new Map<string, UsageSummary>();

	for (const event of events) {
		const key = getKey(event);
		const summary = grouped.get(key) ?? createEmptySummary();
		addEventToSummary(summary, event);
		grouped.set(key, summary);
	}

	for (const event of creditEvents) {
		const key = getCreditKey(event);
		const summary = grouped.get(key) ?? createEmptySummary();
		addCreditEventToSummary(summary, event);
		grouped.set(key, summary);
	}

	return Array.from(grouped.entries()).map(([key, summary]) => ({
		key,
		...summary,
		modelsUsed: Array.from(summary.models.keys()),
	}));
}

export function calculateTotals(rows: UsageSummary[]): UsageTotals {
	return rows.reduce(
		(totals, row) => {
			totals.inputTokens += row.inputTokens;
			totals.cacheCreationInputTokens += row.cacheCreationInputTokens;
			totals.cacheReadInputTokens += row.cacheReadInputTokens;
			totals.outputTokens += row.outputTokens;
			totals.totalTokens += row.totalTokens;
			totals.credits += row.credits;
			totals.requests += row.requests;
			return totals;
		},
		{
			inputTokens: 0,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
			credits: 0,
			requests: 0,
		},
	);
}

export function modelsToRecord(models: Map<string, ModelUsage>): Record<string, ModelUsage> {
	return Object.fromEntries(models.entries());
}

function formatModelName(modelName: string): string {
	const claudeMatch = modelName.match(/^claude-(\w+)-(.+)$/);
	if (claudeMatch?.[1] != null && claudeMatch[2] != null) {
		return `${claudeMatch[1]}-${claudeMatch[2]}`;
	}
	return modelName;
}

export function formatModelSummary(models: Map<string, ModelUsage>): string {
	const sortedModels = Array.from(models.entries()).sort(
		([, a], [, b]) => b.totalTokens - a.totalTokens,
	);
	return sortedModels.map(([model]) => `- ${formatModelName(model)}`).join('\n');
}

export function formatTokenCount(value: number): string {
	const absoluteValue = Math.abs(value);
	if (absoluteValue >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(2)}B`;
	}
	if (absoluteValue >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(2)}M`;
	}
	return formatNumber(value);
}

export function cacheTokens(row: {
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
}): number {
	return row.cacheCreationInputTokens + row.cacheReadInputTokens;
}

export function formatLocalDate(timestamp: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date(timestamp));
}

export function formatLocalMonth(timestamp: string): string {
	return formatLocalDate(timestamp).slice(0, 7);
}

if (import.meta.vitest != null) {
	describe('groupUsage', () => {
		it('counts credits from user prompt events instead of token requests', () => {
			const rows = groupUsage(
				[
					{
						requestId: 'request-1',
						sessionId: 'session-1',
						title: 'Session',
						workingDirectory: '/repo',
						timestamp: '2026-05-01T00:00:00.000Z',
						model: 'swe-1-6',
						inputTokens: 100,
						outputTokens: 50,
						cacheCreationInputTokens: 10,
						cacheReadInputTokens: 20,
						totalTokens: 150,
						credits: 999,
					},
				],
				[
					{
						requestId: 'credit-request-1',
						sessionId: 'session-1',
						title: 'Session',
						workingDirectory: '/repo',
						model: 'swe-1-6',
						timestamp: '2026-05-01T00:00:00.000Z',
						credits: 8,
					},
					{
						requestId: 'credit-request-2',
						sessionId: 'session-1',
						title: 'Session',
						workingDirectory: '/repo',
						model: 'swe-1-6',
						timestamp: '2026-05-01T00:01:00.000Z',
						credits: 40,
					},
				],
				() => '2026-05',
				() => '2026-05',
			);

			expect(rows).toHaveLength(1);
			expect(rows[0]?.credits).toBe(48);
			expect(rows[0]?.requests).toBe(1);
			expect(rows[0]?.totalTokens).toBe(150);
		});
	});
}
