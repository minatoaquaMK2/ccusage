import process from 'node:process';
import {
	addEmptySeparatorRow,
	formatDateCompact,
	formatNumber,
	ResponsiveTable,
} from '@ccusage/terminal/table';
import { define } from 'gunshi';
import pc from 'picocolors';
import { DEFAULT_TIMEZONE } from '../_consts.ts';
import { sharedArgs } from '../_shared-args.ts';
import {
	calculateTotals,
	formatEstimatedCost,
	formatModelSummary,
	groupUsage,
	modelsToRecord,
} from '../command-utils.ts';
import { loadDevinUsageEvents } from '../data-loader.ts';
import {
	filterTimestampedByDateRange,
	formatDisplayDate,
	normalizeFilterDate,
	toDateKey,
} from '../date-utils.ts';
import { log, logger } from '../logger.ts';
import { DevinPricingSource } from '../pricing.ts';

const TABLE_COLUMN_COUNT = 9;

export const dailyCommand = define({
	name: 'daily',
	description: 'Show Devin token usage grouped by day',
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
			log(jsonOutput ? JSON.stringify({ daily: [], totals: null }) : message);
			return;
		}

		const pricingSource = new DevinPricingSource({
			offline: ctx.values.offline,
		});
		try {
			const dailyData = await groupUsage(
				filteredEvents,
				filteredCreditEvents,
				(event) => toDateKey(event.timestamp, ctx.values.timezone),
				(event) => toDateKey(event.timestamp, ctx.values.timezone),
				async (model, usage) => pricingSource.calculateCost(model, usage),
			);
			dailyData.sort((a, b) => a.key.localeCompare(b.key));

			const totals = calculateTotals(dailyData);

			if (jsonOutput) {
				log(
					JSON.stringify(
						{
							daily: dailyData.map((row) => ({
								date: formatDisplayDate(row.key, ctx.values.locale, ctx.values.timezone),
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
				`Devin Token Usage Report - Daily (Timezone: ${ctx.values.timezone ?? DEFAULT_TIMEZONE})`,
			);

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
					formatDisplayDate(data.key, ctx.values.locale, ctx.values.timezone),
					formatModelSummary(data.models),
					formatNumber(data.inputTokens),
					formatNumber(data.outputTokens),
					formatNumber(data.cacheCreationInputTokens),
					formatNumber(data.cacheReadInputTokens),
					formatNumber(data.totalTokens),
					formatNumber(data.credits),
					formatEstimatedCost(data.costUSD),
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
			]);

			log(table.toString());

			if (table.isCompactMode()) {
				logger.info('\nRunning in Compact Mode');
				logger.info('Expand terminal width to see cache metrics and total tokens');
			}
		} finally {
			pricingSource[Symbol.dispose]();
		}
	},
});
