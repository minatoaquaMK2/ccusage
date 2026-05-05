import type { TokenUsageDelta } from './_types.ts';

type ModelPricing = {
	inputTokens: number;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
	outputTokens: number;
};

const FREE_PRICING: ModelPricing = {
	inputTokens: 0,
	cacheCreationInputTokens: 0,
	cacheReadInputTokens: 0,
	outputTokens: 0,
};

const ANTHROPIC_OPUS_4_5_PLUS_PRICING: ModelPricing = {
	inputTokens: 5,
	cacheCreationInputTokens: 6.25,
	cacheReadInputTokens: 0.5,
	outputTokens: 25,
};

const ANTHROPIC_SONNET_4_PRICING: ModelPricing = {
	inputTokens: 3,
	cacheCreationInputTokens: 3.75,
	cacheReadInputTokens: 0.3,
	outputTokens: 15,
};

const ANTHROPIC_HAIKU_4_5_PRICING: ModelPricing = {
	inputTokens: 1,
	cacheCreationInputTokens: 1.25,
	cacheReadInputTokens: 0.1,
	outputTokens: 5,
};

const OPENAI_GPT_5_4_PRICING: ModelPricing = {
	inputTokens: 2.5,
	cacheCreationInputTokens: 2.5,
	cacheReadInputTokens: 0.25,
	outputTokens: 15,
};

const OPENAI_GPT_5_4_PRIORITY_PRICING: ModelPricing = {
	inputTokens: 5,
	cacheCreationInputTokens: 5,
	cacheReadInputTokens: 0.5,
	outputTokens: 30,
};

const OPENAI_GPT_5_4_MINI_PRICING: ModelPricing = {
	inputTokens: 0.75,
	cacheCreationInputTokens: 0.75,
	cacheReadInputTokens: 0.075,
	outputTokens: 4.5,
};

const OPENAI_GPT_5_4_MINI_PRIORITY_PRICING: ModelPricing = {
	inputTokens: 1.5,
	cacheCreationInputTokens: 1.5,
	cacheReadInputTokens: 0.15,
	outputTokens: 9,
};

const OPENAI_GPT_5_2_PRICING: ModelPricing = {
	inputTokens: 1.75,
	cacheCreationInputTokens: 1.75,
	cacheReadInputTokens: 0.175,
	outputTokens: 14,
};

const OPENAI_GPT_5_2_PRIORITY_PRICING: ModelPricing = {
	inputTokens: 3.5,
	cacheCreationInputTokens: 3.5,
	cacheReadInputTokens: 0.35,
	outputTokens: 28,
};

const OPENAI_GPT_5_3_CODEX_PRICING: ModelPricing = OPENAI_GPT_5_2_PRICING;

const OPENAI_GPT_5_3_CODEX_PRIORITY_PRICING: ModelPricing = OPENAI_GPT_5_2_PRIORITY_PRICING;

const GOOGLE_GEMINI_3_1_PRO_PRICING: ModelPricing = {
	inputTokens: 2,
	cacheCreationInputTokens: 2,
	cacheReadInputTokens: 0.5,
	outputTokens: 12,
};

const GOOGLE_GEMINI_3_FLASH_PRICING: ModelPricing = {
	inputTokens: 0.5,
	cacheCreationInputTokens: 0.5,
	cacheReadInputTokens: 0.05,
	outputTokens: 3,
};

const MODEL_NAME_OVERRIDES: Record<string, string> = {
	MODEL_CLAUDE_4_5_OPUS: 'Claude Opus 4.5',
	MODEL_CLAUDE_4_5_OPUS_THINKING: 'Claude Opus 4.5 Thinking',
	MODEL_CLAUDE_4_SONNET: 'Claude Sonnet 4',
	MODEL_CLAUDE_4_SONNET_THINKING: 'Claude Sonnet 4 Thinking',
	MODEL_GOOGLE_GEMINI_3_0_FLASH_HIGH: 'Gemini 3 Flash High Thinking',
	MODEL_GOOGLE_GEMINI_3_0_FLASH_LOW: 'Gemini 3 Flash Low Thinking',
	MODEL_GOOGLE_GEMINI_3_0_FLASH_MEDIUM: 'Gemini 3 Flash Medium Thinking',
	MODEL_GOOGLE_GEMINI_3_0_FLASH_MINIMAL: 'Gemini 3 Flash Minimal',
	MODEL_GPT_5_2_HIGH: 'GPT-5.2 High Thinking',
	MODEL_GPT_5_2_LOW: 'GPT-5.2 Low Thinking',
	MODEL_GPT_5_2_MEDIUM: 'GPT-5.2 Medium Thinking',
	MODEL_GPT_5_2_NONE: 'GPT-5.2 No Thinking',
	MODEL_GPT_5_2_XHIGH: 'GPT-5.2 XHigh Thinking',
	MODEL_PRIVATE_2: 'Claude Sonnet 4.5',
	MODEL_PRIVATE_3: 'Claude Sonnet 4.5 Thinking',
	MODEL_PRIVATE_11: 'SWE-1.5 (private)',
	MODEL_SWE_1_5: 'SWE-1.5 Fast',
	MODEL_SWE_1_5_SLOW: 'SWE-1.5',
};

function formatSuffix(value: string): string {
	return value
		.split('-')
		.filter(Boolean)
		.map((part) => {
			if (part === '1m') {
				return '1M';
			}
			if (part === 'xhigh') {
				return 'XHigh';
			}
			return `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`;
		})
		.join(' ');
}

function formatOpenAIReasoningLevel(level: string): string {
	if (level === 'none') {
		return 'No Thinking';
	}
	if (level === 'xhigh') {
		return 'XHigh Thinking';
	}
	return `${level[0]?.toUpperCase() ?? ''}${level.slice(1)} Thinking`;
}

function formatCodexReasoningLevel(level: string): string {
	if (level === 'xhigh') {
		return 'XHigh';
	}
	return `${level[0]?.toUpperCase() ?? ''}${level.slice(1)}`;
}

function isFreeDevinModel(modelName: string): boolean {
	const normalized = modelName.toLowerCase();
	return (
		normalized === 'model_private_11' ||
		normalized.startsWith('swe-') ||
		normalized.startsWith('model_swe_')
	);
}

function getPricingForModel(modelName: string): ModelPricing | undefined {
	const normalized = modelName.toLowerCase();

	if (isFreeDevinModel(modelName)) {
		return FREE_PRICING;
	}

	if (
		normalized.startsWith('claude-opus-4-7') ||
		normalized.startsWith('claude-opus-4-6') ||
		normalized === 'model_claude_4_5_opus' ||
		normalized === 'model_claude_4_5_opus_thinking'
	) {
		return ANTHROPIC_OPUS_4_5_PLUS_PRICING;
	}

	if (
		normalized.startsWith('claude-sonnet-4-6') ||
		normalized === 'model_private_2' ||
		normalized === 'model_private_3' ||
		normalized === 'model_claude_4_sonnet' ||
		normalized === 'model_claude_4_sonnet_thinking'
	) {
		return ANTHROPIC_SONNET_4_PRICING;
	}

	if (normalized.startsWith('gpt-5-4-mini')) {
		return normalized.endsWith('-priority')
			? OPENAI_GPT_5_4_MINI_PRIORITY_PRICING
			: OPENAI_GPT_5_4_MINI_PRICING;
	}

	if (normalized.startsWith('gpt-5-4-')) {
		return normalized.endsWith('-priority')
			? OPENAI_GPT_5_4_PRIORITY_PRICING
			: OPENAI_GPT_5_4_PRICING;
	}

	if (normalized.startsWith('gpt-5-3-codex-')) {
		return normalized.endsWith('-priority')
			? OPENAI_GPT_5_3_CODEX_PRIORITY_PRICING
			: OPENAI_GPT_5_3_CODEX_PRICING;
	}

	if (normalized.startsWith('model_gpt_5_2_')) {
		return OPENAI_GPT_5_2_PRICING;
	}

	if (normalized.startsWith('gemini-3-1-pro-')) {
		return GOOGLE_GEMINI_3_1_PRO_PRICING;
	}

	if (
		normalized.startsWith('model_google_gemini_3_0_flash_') ||
		normalized.startsWith('gemini-3-flash-')
	) {
		return GOOGLE_GEMINI_3_FLASH_PRICING;
	}

	if (normalized === 'claude-haiku-4-5') {
		return ANTHROPIC_HAIKU_4_5_PRICING;
	}

	return undefined;
}

export function calculateEstimatedCostUSD(modelName: string, usage: TokenUsageDelta): number {
	const pricing = getPricingForModel(modelName);
	if (pricing == null) {
		return 0;
	}

	return (
		(usage.inputTokens * pricing.inputTokens +
			usage.cacheCreationInputTokens * pricing.cacheCreationInputTokens +
			usage.cacheReadInputTokens * pricing.cacheReadInputTokens +
			usage.outputTokens * pricing.outputTokens) /
		1_000_000
	);
}

export function formatDevinModelName(modelName: string): string {
	const override = MODEL_NAME_OVERRIDES[modelName];
	if (override != null) {
		return override;
	}

	const claudeMatch = modelName.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-(.+))?$/);
	if (claudeMatch?.[1] != null && claudeMatch[2] != null && claudeMatch[3] != null) {
		const modelFamily = `${claudeMatch[1][0]?.toUpperCase() ?? ''}${claudeMatch[1].slice(1)}`;
		const suffix = claudeMatch[4] == null ? '' : ` ${formatSuffix(claudeMatch[4])}`;
		return `Claude ${modelFamily} ${claudeMatch[2]}.${claudeMatch[3]}${suffix}`;
	}

	const gptMatch = modelName.match(
		/^gpt-(\d+)-(\d+)(?:-(codex))?-(none|low|medium|high|xhigh)(?:-priority)?$/,
	);
	if (gptMatch?.[1] != null && gptMatch[2] != null && gptMatch[4] != null) {
		const isCodex = gptMatch[3] != null;
		const family = isCodex
			? `GPT-${gptMatch[1]}.${gptMatch[2]}-Codex`
			: `GPT-${gptMatch[1]}.${gptMatch[2]}`;
		const level = isCodex
			? formatCodexReasoningLevel(gptMatch[4])
			: formatOpenAIReasoningLevel(gptMatch[4]);
		const fastSuffix = modelName.endsWith('-priority') ? ' Fast' : '';
		return `${family} ${level}${fastSuffix}`;
	}

	const geminiMatch = modelName.match(/^gemini-(\d+)-(\d+)-pro-(low|medium|high)$/);
	if (geminiMatch?.[1] != null && geminiMatch[2] != null && geminiMatch[3] != null) {
		return `Gemini ${geminiMatch[1]}.${geminiMatch[2]} Pro ${formatOpenAIReasoningLevel(geminiMatch[3])}`;
	}

	if (modelName.startsWith('swe-')) {
		return modelName.replace(/^swe-(\d+)-(\d+)/, 'SWE-$1.$2').replace('-fast', ' Fast');
	}

	return modelName;
}

if (import.meta.vitest != null) {
	describe('calculateEstimatedCostUSD', () => {
		it('treats SWE and MODEL_PRIVATE_11 as free Devin models', () => {
			const usage = {
				inputTokens: 1_000_000,
				cacheCreationInputTokens: 1_000_000,
				cacheReadInputTokens: 1_000_000,
				outputTokens: 1_000_000,
				totalTokens: 4_000_000,
			};

			expect(calculateEstimatedCostUSD('swe-1-6', usage)).toBe(0);
			expect(calculateEstimatedCostUSD('MODEL_PRIVATE_11', usage)).toBe(0);
		});

		it('estimates Claude Opus 4.7 token cost with cache pricing', () => {
			const usage = {
				inputTokens: 1_000_000,
				cacheCreationInputTokens: 1_000_000,
				cacheReadInputTokens: 1_000_000,
				outputTokens: 1_000_000,
				totalTokens: 4_000_000,
			};

			expect(calculateEstimatedCostUSD('claude-opus-4-7-medium', usage)).toBe(36.75);
		});

		it('applies priority pricing to GPT-5.4 models', () => {
			const usage = {
				inputTokens: 1_000_000,
				cacheCreationInputTokens: 0,
				cacheReadInputTokens: 1_000_000,
				outputTokens: 1_000_000,
				totalTokens: 3_000_000,
			};

			expect(calculateEstimatedCostUSD('gpt-5-4-high-priority', usage)).toBe(35.5);
		});

		it('estimates GPT-5.3-Codex and Gemini model token costs', () => {
			const usage = {
				inputTokens: 1_000_000,
				cacheCreationInputTokens: 0,
				cacheReadInputTokens: 1_000_000,
				outputTokens: 1_000_000,
				totalTokens: 3_000_000,
			};

			expect(calculateEstimatedCostUSD('gpt-5-3-codex-high', usage)).toBe(15.925);
			expect(calculateEstimatedCostUSD('gemini-3-1-pro-high', usage)).toBe(14.5);
			expect(calculateEstimatedCostUSD('MODEL_GOOGLE_GEMINI_3_0_FLASH_HIGH', usage)).toBe(3.55);
		});
	});

	describe('formatDevinModelName', () => {
		it('uses Devin model labels for private model ids', () => {
			expect(formatDevinModelName('MODEL_PRIVATE_11')).toBe('SWE-1.5 (private)');
			expect(formatDevinModelName('MODEL_SWE_1_5')).toBe('SWE-1.5 Fast');
			expect(formatDevinModelName('gpt-5-3-codex-xhigh-priority')).toBe('GPT-5.3-Codex XHigh Fast');
			expect(formatDevinModelName('claude-opus-4-6-thinking-1m')).toBe(
				'Claude Opus 4.6 Thinking 1M',
			);
		});
	});
}
