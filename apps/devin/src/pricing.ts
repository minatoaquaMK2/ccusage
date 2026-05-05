import type { LiteLLMModelPricing } from '@ccusage/internal/pricing';
import type { TokenUsageDelta } from './_types.ts';
import { LiteLLMPricingFetcher } from '@ccusage/internal/pricing';
import { Result } from '@praha/byethrow';
import { prefetchDevinPricing } from './_macro.ts' with { type: 'macro' };
import { logger } from './logger.ts';

const FREE_MODEL_PRICING_ID = '__free__';
const PREFETCHED_DEVIN_PRICING = prefetchDevinPricing();
const DEVIN_PROVIDER_PREFIXES = [
	'anthropic/',
	'openai/',
	'azure/',
	'openrouter/openai/',
	'google/',
	'vertex_ai/',
];

// Display names taken from the current Devin CLI model cache. In particular,
// MODEL_PRIVATE_11 resolves to Claude Haiku 4.5 rather than an internal SWE model.
const DEVIN_MODEL_NAMES: Record<string, string> = {
	'claude-opus-4-7-medium': 'Claude Opus 4.7 Medium',
	'claude-opus-4-7-low': 'Claude Opus 4.7 Low',
	'claude-opus-4-7-high': 'Claude Opus 4.7 High',
	'claude-opus-4-7-xhigh': 'Claude Opus 4.7 XHigh',
	'claude-opus-4-7-max': 'Claude Opus 4.7 Max',
	'claude-opus-4-6-thinking': 'Claude Opus 4.6 Thinking',
	'claude-opus-4-6': 'Claude Opus 4.6',
	'claude-opus-4-6-1m': 'Claude Opus 4.6 1M',
	'claude-opus-4-6-thinking-1m': 'Claude Opus 4.6 Thinking 1M',
	MODEL_CLAUDE_4_5_OPUS: 'Claude Opus 4.5',
	MODEL_CLAUDE_4_5_OPUS_THINKING: 'Claude Opus 4.5 Thinking',
	'claude-sonnet-4-6-thinking': 'Claude Sonnet 4.6 Thinking',
	'claude-sonnet-4-6': 'Claude Sonnet 4.6',
	'claude-sonnet-4-6-1m': 'Claude Sonnet 4.6 1M',
	'claude-sonnet-4-6-thinking-1m': 'Claude Sonnet 4.6 Thinking 1M',
	MODEL_PRIVATE_11: 'Claude Haiku 4.5',
	MODEL_PRIVATE_2: 'Claude Sonnet 4.5',
	MODEL_PRIVATE_3: 'Claude Sonnet 4.5 Thinking',
	MODEL_CLAUDE_4_SONNET: 'Claude Sonnet 4',
	MODEL_CLAUDE_4_SONNET_THINKING: 'Claude Sonnet 4 Thinking',
	'swe-1-6': 'SWE-1.6',
	'swe-1-6-fast': 'SWE-1.6 Fast',
	MODEL_SWE_1_5_SLOW: 'SWE-1.5',
	MODEL_SWE_1_5: 'SWE-1.5 Fast',
	'gpt-5-4-none': 'GPT-5.4 No Thinking',
	'gpt-5-4-low': 'GPT-5.4 Low Thinking',
	'gpt-5-4-medium': 'GPT-5.4 Medium Thinking',
	'gpt-5-4-high': 'GPT-5.4 High Thinking',
	'gpt-5-4-xhigh': 'GPT-5.4 XHigh Thinking',
	'gpt-5-4-none-priority': 'GPT-5.4 No Thinking Fast',
	'gpt-5-4-low-priority': 'GPT-5.4 Low Thinking Fast',
	'gpt-5-4-medium-priority': 'GPT-5.4 Medium Thinking Fast',
	'gpt-5-4-high-priority': 'GPT-5.4 High Thinking Fast',
	'gpt-5-4-xhigh-priority': 'GPT-5.4 XHigh Thinking Fast',
	'gpt-5-4-mini-low': 'GPT-5.4 Mini Low Thinking',
	'gpt-5-4-mini-medium': 'GPT-5.4 Mini Medium Thinking',
	'gpt-5-4-mini-high': 'GPT-5.4 Mini High Thinking',
	'gpt-5-4-mini-xhigh': 'GPT-5.4 Mini XHigh Thinking',
	'gpt-5-3-codex-low': 'GPT-5.3-Codex Low',
	'gpt-5-3-codex-medium': 'GPT-5.3-Codex Medium',
	'gpt-5-3-codex-high': 'GPT-5.3-Codex High',
	'gpt-5-3-codex-xhigh': 'GPT-5.3-Codex X-High',
	'gpt-5-3-codex-low-priority': 'GPT-5.3-Codex Low Fast',
	'gpt-5-3-codex-medium-priority': 'GPT-5.3-Codex Medium Fast',
	'gpt-5-3-codex-high-priority': 'GPT-5.3-Codex High Fast',
	'gpt-5-3-codex-xhigh-priority': 'GPT-5.3-Codex XHigh Fast',
	MODEL_GPT_5_2_NONE: 'GPT-5.2 No Thinking',
	MODEL_GPT_5_2_LOW: 'GPT-5.2 Low Thinking',
	MODEL_GPT_5_2_MEDIUM: 'GPT-5.2 Medium Thinking',
	MODEL_GPT_5_2_HIGH: 'GPT-5.2 High Thinking',
	MODEL_GPT_5_2_XHIGH: 'GPT-5.2 XHigh Thinking',
	'gemini-3-1-pro-low': 'Gemini 3.1 Pro Low Thinking',
	'gemini-3-1-pro-high': 'Gemini 3.1 Pro High Thinking',
	MODEL_GOOGLE_GEMINI_3_0_FLASH_MINIMAL: 'Gemini 3 Flash Minimal',
	MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW: 'Gemini 3 Flash Low',
	MODEL_GOOGLE_GEMINI_3_0_FLASH_MEDIUM: 'Gemini 3 Flash Medium',
	MODEL_GOOGLE_GEMINI_3_0_FLASH_HIGH: 'Gemini 3 Flash High',
};
const KNOWN_DEVIN_MODEL_IDS = Object.keys(DEVIN_MODEL_NAMES);

const MODEL_PRICING_ALIASES: Record<string, string[]> = {
	MODEL_CLAUDE_4_5_OPUS: ['claude-opus-4.5', 'claude-opus-4-5'],
	MODEL_CLAUDE_4_5_OPUS_THINKING: ['claude-opus-4.5', 'claude-opus-4-5'],
	MODEL_PRIVATE_11: ['claude-haiku-4.5', 'claude-haiku-4-5'],
	MODEL_PRIVATE_2: ['claude-sonnet-4.5', 'claude-sonnet-4-5'],
	MODEL_PRIVATE_3: ['claude-sonnet-4.5', 'claude-sonnet-4-5'],
	MODEL_CLAUDE_4_SONNET: ['claude-sonnet-4', 'claude-sonnet-4-20250514'],
	MODEL_CLAUDE_4_SONNET_THINKING: ['claude-sonnet-4', 'claude-sonnet-4-20250514'],
	MODEL_GPT_5_2_NONE: ['gpt-5.2', 'gpt-5-2'],
	MODEL_GPT_5_2_LOW: ['gpt-5.2', 'gpt-5-2'],
	MODEL_GPT_5_2_MEDIUM: ['gpt-5.2', 'gpt-5-2'],
	MODEL_GPT_5_2_HIGH: ['gpt-5.2', 'gpt-5-2'],
	MODEL_GPT_5_2_XHIGH: ['gpt-5.2', 'gpt-5-2'],
	MODEL_GOOGLE_GEMINI_3_0_FLASH_MINIMAL: ['gemini-3-flash', 'gemini-3.0-flash'],
	MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW: ['gemini-3-flash', 'gemini-3.0-flash'],
	MODEL_GOOGLE_GEMINI_3_0_FLASH_MEDIUM: ['gemini-3-flash', 'gemini-3.0-flash'],
	MODEL_GOOGLE_GEMINI_3_0_FLASH_HIGH: ['gemini-3-flash', 'gemini-3.0-flash'],
};

export type DevinPricingSourceOptions = {
	offline?: boolean;
	offlineLoader?: () => Promise<Record<string, LiteLLMModelPricing>>;
};

function uniq(values: string[]): string[] {
	return Array.from(new Set(values.filter((value) => value.trim() !== '')));
}

function isFreeDevinModel(modelName: string): boolean {
	const normalized = modelName.toLowerCase();
	return normalized.startsWith('swe-') || normalized.startsWith('model_swe_');
}

function hasNonZeroTokenPricing(pricing: LiteLLMModelPricing): boolean {
	return (
		(pricing.input_cost_per_token ?? 0) > 0 ||
		(pricing.output_cost_per_token ?? 0) > 0 ||
		(pricing.cache_creation_input_token_cost ?? 0) > 0 ||
		(pricing.cache_read_input_token_cost ?? 0) > 0
	);
}

function createClaudePricingCandidates(modelName: string): string[] {
	const match = modelName.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-.+)?$/);
	if (match?.[1] == null || match[2] == null || match[3] == null) {
		return [];
	}

	const family = match[1];
	const major = match[2];
	const minor = match[3];
	const candidates = [`claude-${family}-${major}.${minor}`, `claude-${family}-${major}-${minor}`];

	if (family === 'opus') {
		candidates.push('claude-opus-4.5', 'claude-opus-4-5');
	}
	if (family === 'sonnet') {
		candidates.push('claude-sonnet-4.5', 'claude-sonnet-4-5');
	}
	if (family === 'haiku') {
		candidates.push('claude-haiku-4.5', 'claude-haiku-4-5');
	}

	return candidates;
}

function createGptPricingCandidates(modelName: string): string[] {
	const match = modelName.match(
		/^gpt-(\d+)-(\d+)(?:-(mini|codex))?-(?:none|low|medium|high|xhigh)(?:-priority)?$/,
	);
	if (match?.[1] == null || match[2] == null) {
		return [];
	}

	const major = match[1];
	const minor = match[2];
	const variant = match[3];
	const suffix = variant == null ? '' : `-${variant}`;
	const candidates = [`gpt-${major}.${minor}${suffix}`, `gpt-${major}-${minor}${suffix}`];

	if (variant === 'codex' && major === '5' && minor === '3') {
		candidates.push('gpt-5.2-codex', 'gpt-5-2-codex');
	}

	if (variant == null) {
		candidates.push(`gpt-${major}.${minor}`, `gpt-${major}-${minor}`);
	}

	return candidates;
}

function createGeminiPricingCandidates(modelName: string): string[] {
	const proMatch = modelName.match(/^gemini-(\d+)-(\d+)-pro-(?:low|medium|high)$/);
	if (proMatch?.[1] != null && proMatch[2] != null) {
		return [
			`gemini-${proMatch[1]}.${proMatch[2]}-pro`,
			`gemini-${proMatch[1]}-${proMatch[2]}-pro`,
			'gemini-3-pro-preview',
		];
	}

	return [];
}

export function resolveDevinPricingCandidates(modelName: string): string[] {
	return uniq([
		modelName,
		...(MODEL_PRICING_ALIASES[modelName] ?? []),
		...createClaudePricingCandidates(modelName),
		...createGptPricingCandidates(modelName),
		...createGeminiPricingCandidates(modelName),
	]);
}

export function formatDevinModelName(modelName: string): string {
	return DEVIN_MODEL_NAMES[modelName] ?? modelName;
}

export class DevinPricingSource implements Disposable {
	private readonly fetcher: LiteLLMPricingFetcher;
	private readonly resolvedModels = new Map<string, string | null>();
	private readonly warnedMissingModels = new Set<string>();

	constructor(options: DevinPricingSourceOptions = {}) {
		this.fetcher = new LiteLLMPricingFetcher({
			offline: options.offline ?? false,
			offlineLoader: options.offlineLoader ?? (async () => PREFETCHED_DEVIN_PRICING),
			logger,
			providerPrefixes: DEVIN_PROVIDER_PREFIXES,
		});
	}

	[Symbol.dispose](): void {
		this.fetcher[Symbol.dispose]();
	}

	private async resolvePricingModel(modelName: string): Promise<string | null> {
		if (isFreeDevinModel(modelName)) {
			return FREE_MODEL_PRICING_ID;
		}

		if (this.resolvedModels.has(modelName)) {
			return this.resolvedModels.get(modelName) ?? null;
		}

		for (const candidate of resolveDevinPricingCandidates(modelName)) {
			const lookup = await this.fetcher.getModelPricing(candidate);
			if (Result.isFailure(lookup)) {
				logger.warn(`Failed to resolve pricing for model ${modelName}:`, lookup.error);
				this.resolvedModels.set(modelName, null);
				return null;
			}

			if (lookup.value != null && hasNonZeroTokenPricing(lookup.value)) {
				this.resolvedModels.set(modelName, candidate);
				return candidate;
			}
		}

		if (!this.warnedMissingModels.has(modelName)) {
			logger.warn(`Pricing not found for model ${modelName}; defaulting to zero-cost pricing.`);
			this.warnedMissingModels.add(modelName);
		}
		this.resolvedModels.set(modelName, null);
		return null;
	}

	async calculateCost(modelName: string, usage: TokenUsageDelta): Promise<number> {
		const resolvedModel = await this.resolvePricingModel(modelName);
		if (resolvedModel == null || resolvedModel === FREE_MODEL_PRICING_ID) {
			return 0;
		}

		const result = await this.fetcher.calculateCostFromTokens(
			{
				input_tokens: usage.inputTokens,
				output_tokens: usage.outputTokens,
				cache_creation_input_tokens: usage.cacheCreationInputTokens,
				cache_read_input_tokens: usage.cacheReadInputTokens,
			},
			resolvedModel,
		);

		if (Result.isFailure(result)) {
			logger.warn(`Failed to calculate cost for model ${modelName}:`, result.error);
			return 0;
		}

		return result.value;
	}
}

if (import.meta.vitest != null) {
	describe('DevinPricingSource', () => {
		it('covers the 57 cached Devin model ids', () => {
			expect(KNOWN_DEVIN_MODEL_IDS).toHaveLength(57);
		});

		it('calculates cost from LiteLLM pricing for mapped Devin models', async () => {
			using source = new DevinPricingSource({
				offline: true,
				offlineLoader: async () => ({
					'claude-haiku-4.5': {
						max_input_tokens: 128_000,
					},
					'claude-haiku-4-5': {
						input_cost_per_token: 1e-6,
						output_cost_per_token: 5e-6,
						cache_creation_input_token_cost: 1.25e-6,
						cache_read_input_token_cost: 1e-7,
					},
				}),
			});

			const cost = await source.calculateCost('MODEL_PRIVATE_11', {
				inputTokens: 1_000,
				cacheCreationInputTokens: 100,
				cacheReadInputTokens: 200,
				outputTokens: 500,
				totalTokens: 1_800,
			});

			expect(cost).toBeCloseTo(1_000e-6 + 100 * 1.25e-6 + 200e-7 + 500 * 5e-6);
		});

		it('keeps MODEL_PRIVATE_11 billable while MODEL_SWE_* stays free', async () => {
			using source = new DevinPricingSource({
				offline: true,
			});

			const usage = {
				inputTokens: 1_000,
				cacheCreationInputTokens: 100,
				cacheReadInputTokens: 200,
				outputTokens: 500,
				totalTokens: 1_800,
			};

			expect(await source.calculateCost('MODEL_PRIVATE_11', usage)).toBeGreaterThan(0);
			expect(await source.calculateCost('MODEL_SWE_1_5', usage)).toBe(0);
		});

		it('treats SWE models as free', async () => {
			using source = new DevinPricingSource({
				offline: true,
				offlineLoader: async () => ({}),
			});

			const cost = await source.calculateCost('swe-1-6', {
				inputTokens: 1_000_000,
				cacheCreationInputTokens: 1_000_000,
				cacheReadInputTokens: 1_000_000,
				outputTokens: 1_000_000,
				totalTokens: 4_000_000,
			});

			expect(cost).toBe(0);
		});

		it('resolves every non-free cached Devin model from offline LiteLLM pricing', async () => {
			using source = new DevinPricingSource({
				offline: true,
			});

			const usage = {
				inputTokens: 1_000,
				cacheCreationInputTokens: 100,
				cacheReadInputTokens: 100,
				outputTokens: 500,
				totalTokens: 1_700,
			};
			const nonFreeModelIds = KNOWN_DEVIN_MODEL_IDS.filter((modelId) => !isFreeDevinModel(modelId));
			const costs = await Promise.all(
				nonFreeModelIds.map(async (modelId) => ({
					modelId,
					cost: await source.calculateCost(modelId, usage),
				})),
			);

			expect(nonFreeModelIds).toHaveLength(53);
			expect(costs.filter(({ cost }) => cost > 0)).toHaveLength(nonFreeModelIds.length);
		});

		it('falls back to zero pricing for unknown models', async () => {
			using source = new DevinPricingSource({
				offline: true,
				offlineLoader: async () => ({}),
			});

			const cost = await source.calculateCost('unknown-model', {
				inputTokens: 1_000,
				cacheCreationInputTokens: 0,
				cacheReadInputTokens: 0,
				outputTokens: 1_000,
				totalTokens: 2_000,
			});

			expect(cost).toBe(0);
		});
	});

	describe('formatDevinModelName', () => {
		it('uses Devin model labels from the model cache', () => {
			expect(formatDevinModelName('MODEL_PRIVATE_11')).toBe('Claude Haiku 4.5');
			expect(formatDevinModelName('MODEL_SWE_1_5')).toBe('SWE-1.5 Fast');
			expect(formatDevinModelName('gpt-5-3-codex-xhigh-priority')).toBe('GPT-5.3-Codex XHigh Fast');
			expect(formatDevinModelName('claude-opus-4-6-thinking-1m')).toBe(
				'Claude Opus 4.6 Thinking 1M',
			);
		});
	});

	describe('resolveDevinPricingCandidates', () => {
		it('strips Devin model suffixes for LiteLLM lookup candidates', () => {
			expect(resolveDevinPricingCandidates('gpt-5-3-codex-high-priority')).toContain(
				'gpt-5.3-codex',
			);
			expect(resolveDevinPricingCandidates('claude-opus-4-7-medium')).toContain('claude-opus-4.7');
			expect(resolveDevinPricingCandidates('MODEL_GOOGLE_GEMINI_3_0_FLASH_HIGH')).toContain(
				'gemini-3-flash',
			);
		});
	});
}
