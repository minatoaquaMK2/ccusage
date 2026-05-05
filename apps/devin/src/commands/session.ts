import type { CreditUsageEvent, TokenUsageEvent, UsageTotals } from '../_types.ts';
import { addEmptySeparatorRow, formatNumber, ResponsiveTable } from '@ccusage/terminal/table';
import { define } from 'gunshi';
import pc from 'picocolors';
import {
	addCreditEventToSummary,
	addEventToSummary,
	createEmptySummary,
	formatEstimatedCost,
	formatModelSummary,
	getLocalTimezone,
	modelsToRecord,
} from '../command-utils.ts';
import { loadDevinUsageEvents } from '../data-loader.ts';
import { log, logger } from '../logger.ts';

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

function buildSessionSummaries(
	events: TokenUsageEvent[],
	creditEvents: CreditUsageEvent[],
): SessionSummary[] {
	const grouped = new Map<string, SessionSummary>();

	for (const event of events) {
		const summary = getSessionSummary(grouped, event);

		addEventToSummary(summary, event);
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

function calculateSessionTotals(rows: SessionSummary[]): UsageTotals {
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

export const sessionCommand = define({
	name: 'session',
	description: 'Show Devin token usage grouped by session',
	args: {
		json: {
			type: 'boolean',
			short: 'j',
			description: 'Output in JSON format',
		},
		compact: {
			type: 'boolean',
			description: 'Force compact table mode',
		},
		devinPath: {
			type: 'string',
			description: 'Path to Devin data directory, cli directory, or sessions.db',
		},
	},
	async run(ctx) {
		const jsonOutput = Boolean(ctx.values.json);
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

		const sessionData = buildSessionSummaries(loadResult.events, loadResult.creditEvents);
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
							estimatedCostUSD: row.estimatedCostUSD,
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

		logger.box(`Devin Token Usage Report - Sessions (Timezone: ${getLocalTimezone()})`);

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
				formatEstimatedCost(data.estimatedCostUSD),
				data.lastActivity.split('T')[0] ?? data.lastActivity,
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
			pc.yellow(formatEstimatedCost(totals.estimatedCostUSD)),
			'',
		]);

		log(table.toString());

		if (table.isCompactMode()) {
			logger.info('\nRunning in Compact Mode');
			logger.info('Expand terminal width to see cache metrics and full session fields');
		}
	},
});
