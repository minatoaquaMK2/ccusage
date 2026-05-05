import type { LiteLLMModelPricing } from '@ccusage/internal/pricing';
import {
	createPricingDataset,
	fetchLiteLLMPricingDataset,
	filterPricingDataset,
} from '@ccusage/internal/pricing-fetch-utils';

const DEVIN_MODEL_PREFIXES = [
	'anthropic/claude-',
	'claude-',
	'openai/gpt-5',
	'azure/gpt-5',
	'openrouter/openai/gpt-5',
	'gpt-5',
	'google/gemini-',
	'vertex_ai/gemini-',
	'gemini-',
];

function isDevinModel(modelName: string, _pricing: LiteLLMModelPricing): boolean {
	return DEVIN_MODEL_PREFIXES.some((prefix) => modelName.startsWith(prefix));
}

export async function prefetchDevinPricing(): Promise<Record<string, LiteLLMModelPricing>> {
	try {
		const dataset = await fetchLiteLLMPricingDataset();
		return filterPricingDataset(dataset, isDevinModel);
	} catch (error) {
		console.warn('Failed to prefetch Devin pricing data, proceeding with empty cache.', error);
		return createPricingDataset();
	}
}
