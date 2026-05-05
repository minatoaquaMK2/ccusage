import {
	addEmptySeparatorRow,
	formatDateCompact,
	formatNumber,
	ResponsiveTable,
} from '@ccusage/terminal/table';
import { define } from 'gunshi';
import pc from 'picocolors';
import {
	calculateTotals,
	formatEstimatedCost,
	formatLocalDate,
	formatModelSummary,
	getLocalTimezone,
	groupUsage,
	modelsToRecord,
} from '../command-utils.ts';
import { loadDevinUsageEvents } from '../data-loader.ts';
import { log, logger } from '../logger.ts';

const TABLE_COLUMN_COUNT = 9;

export const dailyCommand = define({
	name: 'daily',
	description: 'Show Devin token usage grouped by day',
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
			log(jsonOutput ? JSON.stringify({ daily: [], totals: null, error: message }) : message);
			return;
		}

		if (loadResult.events.length === 0 && loadResult.creditEvents.length === 0) {
			const message = loadResult.missingDatabase
				? 'No Devin sessions.db found.'
				: 'No Devin usage data found.';
			log(jsonOutput ? JSON.stringify({ daily: [], totals: null }) : message);
			return;
		}

		const dailyData = groupUsage(
			loadResult.events,
			loadResult.creditEvents,
			(event) => formatLocalDate(event.timestamp),
			(event) => formatLocalDate(event.timestamp),
		);
		dailyData.sort((a, b) => a.key.localeCompare(b.key));

		const totals = calculateTotals(dailyData);

		if (jsonOutput) {
			log(
				JSON.stringify(
					{
						daily: dailyData.map((row) => ({
							date: row.key,
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

		logger.box(`Devin Token Usage Report - Daily (Timezone: ${getLocalTimezone()})`);

		const table: ResponsiveTable = new ResponsiveTable({
			head: [
				'Date',
				'Models',
				'Input',
				'Output',
				'Cache Create',
				'Cache Read',
				'Total Tokens',
				'Credits',
				'Cost (USD)',
			],
			colAligns: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
			compactHead: ['Date', 'Models', 'Input', 'Output', 'Credits', 'Cost (USD)'],
			compactColAligns: ['left', 'left', 'right', 'right', 'right', 'right'],
			compactThreshold: 100,
			forceCompact: Boolean(ctx.values.compact),
			style: { head: ['cyan'] },
			dateFormatter: (dateStr: string) => formatDateCompact(dateStr),
		});

		for (const data of dailyData) {
			table.push([
				data.key,
				formatModelSummary(data.models),
				formatNumber(data.inputTokens),
				formatNumber(data.outputTokens),
				formatNumber(data.cacheCreationInputTokens),
				formatNumber(data.cacheReadInputTokens),
				formatNumber(data.totalTokens),
				formatNumber(data.credits),
				formatEstimatedCost(data.estimatedCostUSD),
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
		]);

		log(table.toString());

		if (table.isCompactMode()) {
			logger.info('\nRunning in Compact Mode');
			logger.info('Expand terminal width to see cache metrics and total tokens');
		}
	},
});
