import process from 'node:process';
import { cli } from 'gunshi';
import { description, name, version } from '../package.json';
import { dailyCommand, monthlyCommand, sessionCommand } from './commands/index.ts';

const subCommands = new Map([
	['daily', dailyCommand],
	['monthly', monthlyCommand],
	['session', sessionCommand],
]);

const mainCommand = dailyCommand;

export async function run(): Promise<void> {
	let args = process.argv.slice(2);
	if (args[0] === 'ccusage-devin') {
		args = args.slice(1);
	}

	await cli(args, mainCommand, {
		name,
		version,
		description,
		subCommands,
		renderHeader: null,
	});
}
