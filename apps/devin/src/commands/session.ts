import type { CreditUsageEvent, TokenUsageEvent, UsageTotals } from '../_types.ts';
import type { UsageCostCalculator } from '../command-utils.ts';
import process from 'node:process';
import { addEmptySeparatorRow, formatNumber, ResponsiveTable } from '@ccusage/terminal/table';
import { define } from 'gunshi';
import pc from 'picocolors';
import { DEFAULT_TIMEZONE } from '../_consts.ts';
import { sharedArgs } from '../_shared-args.ts';
import {
	addCreditEventToSummary,
	addEventToSummary,
	createEmptySummary,
	formatEstimatedCost,
	formatModelSummary,
	modelsToRecord,
} from '../command-utils.ts';
import { loadDevinUsageEvents } from '../data-loader.ts';
import {
	filterTimestampedByDateRange,
	formatDisplayDateTime,
	normalizeFilterDate,
} from '../date-utils.ts';
import { log, logger } from '../logger.ts';
import { DevinPricingSource } from '../pricing.ts';

const TABLE_COLUMN_COUNT = 10;

type SessionSummary = ReturnType<typeof createEmptySummary> & {
	sessionId: string;
	title: string;
	workingDirectory: string;
	lastActivity: string;
	modelsUsed: string[];
};

function getSessionSummary(
	grouped: Map<string, SessionSummary>,
	event: TokenUsageEvent | CreditUsageEvent,
): SessionSummary {
	return (
		grouped.get(event.sessionId) ?? {
			...createEmptySummary(),
			sessionId: event.sessionId,
			title: event.title,
			workingDirectory: event.workingDirectory,
			lastActivity: event.timestamp,
			modelsUsed: [],
		}
	);
}

async function buildSessionSummaries(
	events: TokenUsageEvent[],
	creditEvents: CreditUsageEvent[],
	calculateCost: UsageCostCalculator,
): Promise<SessionSummary[]> {
	const grouped = new Map<string, SessionSummary>();

	return build();

	async function build(): Promise<SessionSummary[]> {
		for (const event of events) {
			const summary = getSessionSummary(grouped, event);

			addEventToSummary(summary, event, await calculateCost(event.model, event));
			if (event.timestamp > summary.lastActivity) {
				summary.lastActivity = event.timestamp;
			}
			summary.modelsUsed = Array.from(summary.models.keys());
			grouped.set(event.sessionId, summary);
		}

		for (const event of creditEvents) {
			const summary = getSessionSummary(grouped, event);

			addCreditEventToSummary(summary, event);
			if (event.timestamp > summary.lastActivity) {
				summary.lastActivity = event.timestamp;
			}
			grouped.set(event.sessionId, summary);
		}

		return Array.from(grouped.values());
	}
}

function calculateSessionTotals(rows: SessionSummary[]): UsageTotals {
	return rows.reduce(
		(totals, row) => {
			totals.inputTokens += row.inputTokens;
			totals.cacheCreationInputTokens += row.cacheCreationInputTokens;
			totals.cacheReadInputTokens += row.cacheReadInputTokens;
			totals.outputTokens += row.outputTokens;
			totals.totalTokens += row.totalTokens;
			totals.credits += row.credits;
			totals.costUSD += row.costUSD;
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
			costUSD: 0,
			requests: 0,
		},
	);
}

export const sessionCommand = define({
	name: 'session',
	description: 'Show Devin token usage grouped by session',
	args: sharedArgs,
	async run(ctx) {
		const jsonOutput = Boolean(ctx.values.json);
		if (jsonOutput) {
			logger.level = 0;
		}

		let since: string | undefined;
		let until: string | undefined;

		try {
			since = normalizeFilterDate(ctx.values.since);
			until = normalizeFilterDate(ctx.values.until);
		} catch (error) {
			logger.error(String(error));
			process.exit(1);
		}

		const loadResult = await loadDevinUsageEvents({
			devinPath: ctx.values.devinPath,
		});

		if (loadResult.queryError != null) {
			const message = `Failed to read Devin usage data: ${loadResult.queryError}`;
			log(jsonOutput ? JSON.stringify({ sessions: [], totals: null, error: message }) : message);
			return;
		}

		if (loadResult.events.length === 0 && loadResult.creditEvents.length === 0) {
			const message = loadResult.missingDatabase
				? 'No Devin sessions.db found.'
				: 'No Devin usage data found.';
			log(jsonOutput ? JSON.stringify({ sessions: [], totals: null }) : message);
			return;
		}

		const filteredEvents = filterTimestampedByDateRange(
			loadResult.events,
			ctx.values.timezone,
			since,
			until,
		);
		const filteredCreditEvents = filterTimestampedByDateRange(
			loadResult.creditEvents,
			ctx.values.timezone,
			since,
			until,
		);

		if (filteredEvents.length === 0 && filteredCreditEvents.length === 0) {
			const message = 'No Devin usage data found for provided filters.';
			log(jsonOutput ? JSON.stringify({ sessions: [], totals: null }) : message);
			return;
		}

		const pricingSource = new DevinPricingSource({
			offline: ctx.values.offline,
		});
		try {
			const sessionData = await buildSessionSummaries(
				filteredEvents,
				filteredCreditEvents,
				async (model, usage) => pricingSource.calculateCost(model, usage),
			);
			sessionData.sort((a, b) => a.lastActivity.localeCompare(b.lastActivity));

			const totals = calculateSessionTotals(sessionData);

			if (jsonOutput) {
				log(
					JSON.stringify(
						{
							sessions: sessionData.map((row) => ({
								sessionId: row.sessionId,
								title: row.title,
								workingDirectory: row.workingDirectory,
								lastActivity: row.lastActivity,
								inputTokens: row.inputTokens,
								outputTokens: row.outputTokens,
								cacheCreationInputTokens: row.cacheCreationInputTokens,
								cacheReadInputTokens: row.cacheReadInputTokens,
								totalTokens: row.totalTokens,
								credits: row.credits,
								costUSD: row.costUSD,
								requests: row.requests,
								models: modelsToRecord(row.models),
							})),
							totals,
						},
						null,
						2,
					),
				);
				return;
			}

			logger.box(
				`Devin Token Usage Report - Sessions (Timezone: ${ctx.values.timezone ?? DEFAULT_TIMEZONE})`,
			);

			const table: ResponsiveTable = new ResponsiveTable({
				head: [
					'Session',
					'Models',
					'Input',
					'Output',
					'Cache Create',
					'Cache Read',
					'Total Tokens',
					'Credits',
					'Cost (USD)',
					'Last Activity',
				],
				colAligns: [
					'left',
					'left',
					'right',
					'right',
					'right',
					'right',
					'right',
					'right',
					'right',
					'left',
				],
				compactHead: ['Session', 'Models', 'Input', 'Output', 'Credits', 'Cost (USD)'],
				compactColAligns: ['left', 'left', 'right', 'right', 'right', 'right'],
				compactThreshold: 100,
				forceCompact: Boolean(ctx.values.compact),
				style: { head: ['cyan'] },
			});

			for (const data of sessionData) {
				const displayTitle = data.title.length > 30 ? `${data.title.slice(0, 27)}...` : data.title;

				table.push([
					displayTitle,
					formatModelSummary(data.models),
					formatNumber(data.inputTokens),
					formatNumber(data.outputTokens),
					formatNumber(data.cacheCreationInputTokens),
					formatNumber(data.cacheReadInputTokens),
					formatNumber(data.totalTokens),
					formatNumber(data.credits),
					formatEstimatedCost(data.costUSD),
					formatDisplayDateTime(data.lastActivity, ctx.values.locale, ctx.values.timezone),
				]);
			}

			addEmptySeparatorRow(table, TABLE_COLUMN_COUNT);
			table.push([
				pc.yellow('Total'),
				'',
				pc.yellow(formatNumber(totals.inputTokens)),
				pc.yellow(formatNumber(totals.outputTokens)),
				pc.yellow(formatNumber(totals.cacheCreationInputTokens)),
				pc.yellow(formatNumber(totals.cacheReadInputTokens)),
				pc.yellow(formatNumber(totals.totalTokens)),
				pc.yellow(formatNumber(totals.credits)),
				pc.yellow(formatEstimatedCost(totals.costUSD)),
				'',
			]);

			log(table.toString());

			if (table.isCompactMode()) {
				logger.info('\nRunning in Compact Mode');
				logger.info('Expand terminal width to see cache metrics and full session fields');
			}
		} finally {
			pricingSource[Symbol.dispose]();
		}
	},
});
