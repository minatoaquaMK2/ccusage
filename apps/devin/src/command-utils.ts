import type { CreditUsageEvent, ModelUsage, TokenUsageEvent, UsageTotals } from './_types.ts';
import { formatCurrency } from '@ccusage/terminal/table';
import { calculateEstimatedCostUSD, formatDevinModelName } from './pricing.ts';

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
		estimatedCostUSD: 0,
		requests: 0,
		models: new Map(),
	};
}

export function addEventToSummary(summary: UsageSummary, event: TokenUsageEvent): void {
	const estimatedCostUSD = calculateEstimatedCostUSD(event.model, event);

	summary.inputTokens += event.inputTokens;
	summary.cacheCreationInputTokens += event.cacheCreationInputTokens;
	summary.cacheReadInputTokens += event.cacheReadInputTokens;
	summary.outputTokens += event.outputTokens;
	summary.totalTokens += event.totalTokens;
	summary.estimatedCostUSD += estimatedCostUSD;
	summary.requests += 1;

	const existing = summary.models.get(event.model) ?? {
		inputTokens: 0,
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		outputTokens: 0,
		totalTokens: 0,
		credits: 0,
		estimatedCostUSD: 0,
		requests: 0,
	};

	existing.inputTokens += event.inputTokens;
	existing.cacheCreationInputTokens += event.cacheCreationInputTokens;
	existing.cacheReadInputTokens += event.cacheReadInputTokens;
	existing.outputTokens += event.outputTokens;
	existing.totalTokens += event.totalTokens;
	existing.estimatedCostUSD += estimatedCostUSD;
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
			totals.estimatedCostUSD += row.estimatedCostUSD;
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
			estimatedCostUSD: 0,
			requests: 0,
		},
	);
}

export function modelsToRecord(models: Map<string, ModelUsage>): Record<string, ModelUsage> {
	return Object.fromEntries(models.entries());
}

export function formatModelSummary(models: Map<string, ModelUsage>): string {
	const sortedModels = Array.from(models.entries()).sort(
		([modelA, a], [modelB, b]) =>
			getTotalUsageTokens(b) - getTotalUsageTokens(a) ||
			formatDevinModelName(modelA).localeCompare(formatDevinModelName(modelB)),
	);
	return sortedModels.map(([model]) => `- ${formatDevinModelName(model)}`).join('\n');
}

function getTotalUsageTokens(usage: ModelUsage): number {
	return (
		usage.inputTokens +
		usage.outputTokens +
		usage.cacheCreationInputTokens +
		usage.cacheReadInputTokens
	);
}

export function formatEstimatedCost(value: number): string {
	return formatCurrency(value);
}

export function getLocalTimezone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
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

export function formatDisplayMonth(monthKey: string): string {
	const [yearStr = '0', monthStr = '1'] = monthKey.split('-');
	const year = Number.parseInt(yearStr, 10);
	const month = Number.parseInt(monthStr, 10);
	const date = new Date(Date.UTC(year, month - 1, 1));

	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	}).format(date);
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
			expect(rows[0]?.estimatedCostUSD).toBe(0);
			expect(rows[0]?.requests).toBe(1);
			expect(rows[0]?.totalTokens).toBe(150);
		});

		it('adds estimated token cost from usage events', () => {
			const rows = groupUsage(
				[
					{
						requestId: 'request-1',
						sessionId: 'session-1',
						title: 'Session',
						workingDirectory: '/repo',
						timestamp: '2026-05-01T00:00:00.000Z',
						model: 'claude-opus-4-7-medium',
						inputTokens: 1_000_000,
						outputTokens: 1_000_000,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0,
						totalTokens: 2_000_000,
						credits: 0,
					},
				],
				[],
				() => '2026-05',
				() => '2026-05',
			);

			expect(rows[0]?.estimatedCostUSD).toBe(30);
			expect(rows[0]?.models.get('claude-opus-4-7-medium')?.estimatedCostUSD).toBe(30);
		});
	});

	describe('formatModelSummary', () => {
		it('sorts models by total token usage including cache tokens', () => {
			const models = new Map<string, ModelUsage>([
				[
					'smaller-visible-total',
					{
						inputTokens: 100,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 10_000,
						outputTokens: 100,
						totalTokens: 200,
						credits: 0,
						estimatedCostUSD: 0,
						requests: 1,
					},
				],
				[
					'larger-visible-total',
					{
						inputTokens: 1_000,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0,
						outputTokens: 1_000,
						totalTokens: 2_000,
						credits: 0,
						estimatedCostUSD: 0,
						requests: 1,
					},
				],
			]);

			expect(formatModelSummary(models)).toBe('- smaller-visible-total\n- larger-visible-total');
		});
	});

	describe('formatDisplayMonth', () => {
		it('formats month keys for display without timezone shifts', () => {
			expect(formatDisplayMonth('2026-05')).toBe('May 2026');
		});
	});
}
