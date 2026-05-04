import {
	addEmptySeparatorRow,
	formatDateCompact,
	formatNumber,
	ResponsiveTable,
} from '@ccusage/terminal/table';
import { define } from 'gunshi';
import pc from 'picocolors';
import {
	cacheTokens,
	calculateTotals,
	formatLocalMonth,
	formatModelSummary,
	formatTokenCount,
	groupUsage,
	modelsToRecord,
} from '../command-utils.ts';
import { loadDevinUsageEvents } from '../data-loader.ts';
import { log } from '../logger.ts';

const TABLE_COLUMN_COUNT = 8;

export const monthlyCommand = define({
	name: 'monthly',
	description: 'Show Devin token usage grouped by month',
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
			log(jsonOutput ? JSON.stringify({ monthly: [], totals: null, error: message }) : message);
			return;
		}

		if (loadResult.events.length === 0 && loadResult.creditEvents.length === 0) {
			const message = loadResult.missingDatabase
				? 'No Devin sessions.db found.'
				: 'No Devin usage data found.';
			log(jsonOutput ? JSON.stringify({ monthly: [], totals: null }) : message);
			return;
		}

		const monthlyData = groupUsage(
			loadResult.events,
			loadResult.creditEvents,
			(event) => formatLocalMonth(event.timestamp),
			(event) => formatLocalMonth(event.timestamp),
		);
		monthlyData.sort((a, b) => a.key.localeCompare(b.key));

		const totals = calculateTotals(monthlyData);

		if (jsonOutput) {
			log(
				JSON.stringify(
					{
						monthly: monthlyData.map((row) => ({
							month: row.key,
							inputTokens: row.inputTokens,
							outputTokens: row.outputTokens,
							cacheCreationInputTokens: row.cacheCreationInputTokens,
							cacheReadInputTokens: row.cacheReadInputTokens,
							totalTokens: row.totalTokens,
							credits: row.credits,
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

		log('\nDevin Token Usage Report - Monthly\n');

		const table: ResponsiveTable = new ResponsiveTable({
			head: ['Month', 'Models', 'In', 'Out', 'Cache', 'Total', 'Credits', 'Reqs'],
			colAligns: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
			compactHead: ['Month', 'Models', 'Total', 'Credits', 'Reqs'],
			compactColAligns: ['left', 'left', 'right', 'right', 'right'],
			compactThreshold: 140,
			forceCompact: Boolean(ctx.values.compact),
			style: { head: ['cyan'] },
			dateFormatter: (dateStr: string) => formatDateCompact(dateStr),
		});

		for (const data of monthlyData) {
			table.push([
				data.key,
				formatModelSummary(data.models),
				formatTokenCount(data.inputTokens),
				formatTokenCount(data.outputTokens),
				formatTokenCount(cacheTokens(data)),
				formatTokenCount(data.totalTokens),
				formatNumber(data.credits),
				formatNumber(data.requests),
			]);
		}

		addEmptySeparatorRow(table, TABLE_COLUMN_COUNT);
		table.push([
			pc.yellow('Total'),
			'',
			pc.yellow(formatTokenCount(totals.inputTokens)),
			pc.yellow(formatTokenCount(totals.outputTokens)),
			pc.yellow(formatTokenCount(cacheTokens(totals))),
			pc.yellow(formatTokenCount(totals.totalTokens)),
			pc.yellow(formatNumber(totals.credits)),
			pc.yellow(formatNumber(totals.requests)),
		]);

		log(table.toString());

		if (table.isCompactMode()) {
			log('\nRunning in Compact Mode');
			log('Use --json to see separate cache creation/read metrics');
		}
	},
});
