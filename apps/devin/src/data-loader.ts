import type { CreditUsageEvent, SessionInfo, TokenUsageEvent } from './_types.ts';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Result } from '@praha/byethrow';
import * as v from 'valibot';
import {
	DEFAULT_DEVIN_DIR,
	DEVIN_CLI_DIR_NAME,
	DEVIN_DATA_DIR_ENV,
	DEVIN_SESSIONS_DB_NAME,
} from './_consts.ts';
import { logger } from './logger.ts';

const execFileAsync = promisify(execFile);

const devinUsageRowSchema = v.object({
	requestId: v.string(),
	sessionId: v.string(),
	title: v.nullable(v.string()),
	workingDirectory: v.string(),
	sessionModel: v.string(),
	timestampSeconds: v.number(),
	model: v.nullable(v.string()),
	inputTokens: v.number(),
	outputTokens: v.number(),
	cacheCreationInputTokens: v.number(),
	cacheReadInputTokens: v.number(),
	credits: v.number(),
});

type DevinUsageRow = v.InferOutput<typeof devinUsageRowSchema>;

const devinSessionRowSchema = v.object({
	id: v.string(),
	title: v.nullable(v.string()),
	workingDirectory: v.string(),
	model: v.string(),
	createdAtSeconds: v.number(),
	lastActivityAtSeconds: v.number(),
});

type DevinSessionRow = v.InferOutput<typeof devinSessionRowSchema>;

const devinCreditRowSchema = v.object({
	requestId: v.string(),
	sessionId: v.string(),
	title: v.nullable(v.string()),
	workingDirectory: v.string(),
	model: v.string(),
	timestampSeconds: v.number(),
	credits: v.number(),
});

type DevinCreditRow = v.InferOutput<typeof devinCreditRowSchema>;

const DEVIN_USAGE_SQL = `
WITH metric_rows AS (
	SELECT
		json_extract(message_nodes.chat_message, '$.metadata.request_id') AS requestId,
		message_nodes.session_id AS sessionId,
		sessions.title AS title,
		sessions.working_directory AS workingDirectory,
		sessions.model AS sessionModel,
		message_nodes.created_at AS timestampSeconds,
		json_extract(message_nodes.chat_message, '$.metadata.generation_model') AS model,
		json_extract(message_nodes.chat_message, '$.metadata.metrics.input_tokens') AS inputTokens,
		json_extract(message_nodes.chat_message, '$.metadata.metrics.output_tokens') AS outputTokens,
		coalesce(json_extract(message_nodes.chat_message, '$.metadata.metrics.cache_creation_tokens'), 0) AS cacheCreationInputTokens,
		coalesce(json_extract(message_nodes.chat_message, '$.metadata.metrics.cache_read_tokens'), 0) AS cacheReadInputTokens,
		0 AS credits
	FROM message_nodes
	INNER JOIN sessions ON sessions.id = message_nodes.session_id
	WHERE json_extract(message_nodes.chat_message, '$.metadata.request_id') IS NOT NULL
		AND json_extract(message_nodes.chat_message, '$.metadata.metrics.input_tokens') IS NOT NULL
),
deduped AS (
	SELECT
		requestId,
		max(sessionId) AS sessionId,
		max(title) AS title,
		max(workingDirectory) AS workingDirectory,
		max(sessionModel) AS sessionModel,
		max(timestampSeconds) AS timestampSeconds,
		max(model) AS model,
		max(inputTokens) AS inputTokens,
		max(outputTokens) AS outputTokens,
		max(cacheCreationInputTokens) AS cacheCreationInputTokens,
		max(cacheReadInputTokens) AS cacheReadInputTokens,
		max(credits) AS credits
	FROM metric_rows
	GROUP BY requestId
)
SELECT
	requestId,
	sessionId,
	title,
	workingDirectory,
	sessionModel,
	timestampSeconds,
	model,
	inputTokens,
	outputTokens,
	cacheCreationInputTokens,
	cacheReadInputTokens,
	credits
FROM deduped
ORDER BY timestampSeconds ASC;
`;

const DEVIN_CREDITS_SQL = `
WITH credit_rows AS (
	SELECT
		json_extract(message_nodes.chat_message, '$.metadata.request_id') AS requestId,
		message_nodes.session_id AS sessionId,
		coalesce(sessions.title, message_nodes.session_id) AS title,
		coalesce(sessions.working_directory, '') AS workingDirectory,
		coalesce(
			json_extract(message_nodes.chat_message, '$.metadata.generation_model'),
			sessions.model,
			'unknown'
		) AS model,
		message_nodes.created_at AS timestampSeconds,
		json_extract(message_nodes.chat_message, '$.metadata.committed_credit_cost') / 100.0 AS credits
	FROM message_nodes
	LEFT JOIN sessions ON sessions.id = message_nodes.session_id
	WHERE json_extract(message_nodes.chat_message, '$.metadata.request_id') IS NOT NULL
		AND coalesce(json_extract(message_nodes.chat_message, '$.metadata.committed_credit_cost'), 0) > 0
),
deduped AS (
	SELECT
		requestId,
		max(sessionId) AS sessionId,
		max(title) AS title,
		max(workingDirectory) AS workingDirectory,
		max(model) AS model,
		max(timestampSeconds) AS timestampSeconds,
		max(credits) AS credits
	FROM credit_rows
	GROUP BY requestId
)
SELECT
	requestId,
	sessionId,
	title,
	workingDirectory,
	model,
	timestampSeconds,
	credits
FROM deduped
ORDER BY timestampSeconds ASC;
`;

const DEVIN_SESSIONS_SQL = `
SELECT
	id,
	title,
	working_directory AS workingDirectory,
	model,
	created_at AS createdAtSeconds,
	last_activity_at AS lastActivityAtSeconds
FROM sessions
ORDER BY last_activity_at DESC;
`;

export type QueryRows = (dbPath: string, sql: string) => Promise<unknown>;

export type LoadOptions = {
	devinPath?: string;
	queryRows?: QueryRows;
};

export type LoadResult = {
	events: TokenUsageEvent[];
	creditEvents: CreditUsageEvent[];
	sessions: Map<string, SessionInfo>;
	databasePath: string | null;
	missingDatabase: boolean;
	queryError: string | null;
};

function secondsToIsoString(timestampSeconds: number): string {
	return new Date(timestampSeconds * 1000).toISOString();
}

export function getDevinDatabasePath(devinPath?: string): string | null {
	const configuredPath = devinPath ?? process.env[DEVIN_DATA_DIR_ENV] ?? DEFAULT_DEVIN_DIR;
	const normalizedPath = path.resolve(configuredPath);
	const candidates = [
		normalizedPath,
		path.join(normalizedPath, DEVIN_SESSIONS_DB_NAME),
		path.join(normalizedPath, DEVIN_CLI_DIR_NAME, DEVIN_SESSIONS_DB_NAME),
	];

	for (const candidate of candidates) {
		if (path.basename(candidate) === DEVIN_SESSIONS_DB_NAME && existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

async function querySqliteRows(dbPath: string, sql: string): Promise<unknown> {
	const dbUri = `${pathToFileURL(dbPath).href}?mode=ro&immutable=1`;
	const result = await execFileAsync('sqlite3', ['-json', dbUri, sql], {
		maxBuffer: 1024 * 1024 * 200,
	});
	return JSON.parse(result.stdout) as unknown;
}

async function safeQueryRows(
	queryRows: QueryRows,
	dbPath: string,
	sql: string,
): Promise<unknown[] | string> {
	const result = await Result.try({
		try: queryRows(dbPath, sql),
		catch: (error) => error,
	});

	if (Result.isFailure(result)) {
		return result.error instanceof Error ? result.error.message : String(result.error);
	}

	if (!Array.isArray(result.value)) {
		return 'sqlite3 returned a non-array JSON payload.';
	}

	const rows: unknown[] = result.value;
	return rows;
}

function convertUsageRow(row: DevinUsageRow): TokenUsageEvent {
	const model = row.model ?? row.sessionModel;

	return {
		requestId: row.requestId,
		sessionId: row.sessionId,
		title: row.title ?? row.sessionId,
		workingDirectory: row.workingDirectory,
		timestamp: secondsToIsoString(row.timestampSeconds),
		model: model.trim() === '' ? 'unknown' : model,
		inputTokens: row.inputTokens,
		outputTokens: row.outputTokens,
		cacheCreationInputTokens: row.cacheCreationInputTokens,
		cacheReadInputTokens: row.cacheReadInputTokens,
		totalTokens: row.inputTokens + row.outputTokens,
		credits: row.credits,
	};
}

function convertCreditRow(row: DevinCreditRow): CreditUsageEvent {
	return {
		requestId: row.requestId,
		sessionId: row.sessionId,
		title: row.title ?? row.sessionId,
		workingDirectory: row.workingDirectory,
		timestamp: secondsToIsoString(row.timestampSeconds),
		model: row.model.trim() === '' ? 'unknown' : row.model,
		credits: row.credits,
	};
}

function convertSessionRow(row: DevinSessionRow): SessionInfo {
	return {
		id: row.id,
		title: row.title ?? row.id,
		workingDirectory: row.workingDirectory,
		model: row.model,
		createdAt: secondsToIsoString(row.createdAtSeconds),
		lastActivityAt: secondsToIsoString(row.lastActivityAtSeconds),
	};
}

export async function loadDevinUsageEvents(options: LoadOptions = {}): Promise<LoadResult> {
	const databasePath = getDevinDatabasePath(options.devinPath);
	if (databasePath == null) {
		return {
			events: [],
			creditEvents: [],
			sessions: new Map(),
			databasePath,
			missingDatabase: true,
			queryError: null,
		};
	}

	const queryRows = options.queryRows ?? querySqliteRows;
	const usageRows = await safeQueryRows(queryRows, databasePath, DEVIN_USAGE_SQL);
	if (typeof usageRows === 'string') {
		logger.debug('Failed to load Devin usage rows', { databasePath, error: usageRows });
		return {
			events: [],
			creditEvents: [],
			sessions: new Map(),
			databasePath,
			missingDatabase: false,
			queryError: usageRows,
		};
	}

	const creditRows = await safeQueryRows(queryRows, databasePath, DEVIN_CREDITS_SQL);
	if (typeof creditRows === 'string') {
		logger.debug('Failed to load Devin prompt credit rows', {
			databasePath,
			error: creditRows,
		});
		return {
			events: [],
			creditEvents: [],
			sessions: new Map(),
			databasePath,
			missingDatabase: false,
			queryError: creditRows,
		};
	}

	const sessionRows = await safeQueryRows(queryRows, databasePath, DEVIN_SESSIONS_SQL);
	if (typeof sessionRows === 'string') {
		logger.debug('Failed to load Devin session rows', { databasePath, error: sessionRows });
		return {
			events: [],
			creditEvents: [],
			sessions: new Map(),
			databasePath,
			missingDatabase: false,
			queryError: sessionRows,
		};
	}

	const events: TokenUsageEvent[] = [];
	for (const row of usageRows) {
		const result = v.safeParse(devinUsageRowSchema, row);
		if (result.success) {
			events.push(convertUsageRow(result.output));
		}
	}

	const creditEvents: CreditUsageEvent[] = [];
	for (const row of creditRows) {
		const result = v.safeParse(devinCreditRowSchema, row);
		if (result.success) {
			creditEvents.push(convertCreditRow(result.output));
		}
	}

	const sessions = new Map<string, SessionInfo>();
	for (const row of sessionRows) {
		const result = v.safeParse(devinSessionRowSchema, row);
		if (result.success) {
			const session = convertSessionRow(result.output);
			sessions.set(session.id, session);
		}
	}

	return {
		events,
		creditEvents,
		sessions,
		databasePath,
		missingDatabase: false,
		queryError: null,
	};
}

if (import.meta.vitest != null) {
	const { describe, expect, it } = import.meta.vitest;

	describe('getDevinDatabasePath', () => {
		it('returns null when the path does not exist', () => {
			const result = getDevinDatabasePath('/path/that/does/not/exist');

			expect(result).toBeNull();
		});
	});

	describe('loadDevinUsageEvents', () => {
		it('loads rows from an injected sqlite query function', async () => {
			const tempDir = mkdtempSync(path.join(tmpdir(), 'ccusage-devin-'));
			const cliDir = path.join(tempDir, DEVIN_CLI_DIR_NAME);
			const dbPath = path.join(cliDir, DEVIN_SESSIONS_DB_NAME);
			mkdirSync(cliDir, { recursive: true });
			writeFileSync(dbPath, '');

			const queryRows: QueryRows = async (_dbPath, sql) => {
				if (sql.includes('committed_credit_cost')) {
					return [
						{
							requestId: 'credit-request-1',
							sessionId: 'session-1',
							title: 'First session',
							workingDirectory: '/repo',
							model: 'swe-1-6',
							timestampSeconds: 1700000004,
							credits: 8,
						},
					];
				}

				if (sql.includes('FROM sessions')) {
					return [
						{
							id: 'session-1',
							title: 'First session',
							workingDirectory: '/repo',
							model: 'swe-1-6',
							createdAtSeconds: 1700000000,
							lastActivityAtSeconds: 1700000010,
						},
					];
				}

				return [
					{
						requestId: 'request-1',
						sessionId: 'session-1',
						title: 'First session',
						workingDirectory: '/repo',
						sessionModel: 'swe-1-6',
						timestampSeconds: 1700000005,
						model: 'swe-1-6',
						inputTokens: 100,
						outputTokens: 20,
						cacheCreationInputTokens: 5,
						cacheReadInputTokens: 10,
						credits: 2,
					},
				];
			};

			try {
				const result = await loadDevinUsageEvents({
					devinPath: tempDir,
					queryRows,
				});

				expect(result.events).toHaveLength(1);
				expect(result.events[0]?.inputTokens).toBe(100);
				expect(result.events[0]?.totalTokens).toBe(120);
				expect(result.creditEvents).toHaveLength(1);
				expect(result.creditEvents[0]?.credits).toBe(8);
				expect(result.sessions.get('session-1')?.title).toBe('First session');
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});
}
