/**
 * LLM Provider Configurations
 * Defines all supported providers and their models for the Eko agent framework
 * 
 * Provider order: Local → DeepSeek → OpenRouter → Google → OpenAI → Anthropic → Qwen
 */

export type LLMProvider = 'local' | 'deepseek' | 'openrouter' | 'google' | 'openai' | 'anthropic' | 'qwen';

export interface ProviderConfig {
    name: string;
    provider: string; // Eko provider identifier ('openai' | 'anthropic' | 'google')
    models: string[];
    defaultModel: string;
    baseURL?: string;
    hint?: string;
    getKeyUrl?: string;        // URL to get API key for the provider
    supportsVision?: boolean;  // Whether models support image/screenshot input
}

export const LLM_PROVIDERS: Record<LLMProvider, ProviderConfig> = {
    local: {
        name: 'Local LLM',
        provider: 'openai', // Uses OpenAI-compatible API
        models: [
            'auto', // Auto-detect from running server
        ],
        defaultModel: 'auto',
        baseURL: 'http://localhost:8080/v1',
        hint: 'No API key needed — connect to llama.cpp, Ollama, LM Studio, or any OpenAI-compatible server',
        supportsVision: false, // Most local models are text-only
    },
    deepseek: {
        name: 'DeepSeek',
        provider: 'openai', // DeepSeek uses OpenAI-compatible API
        models: [
            'deepseek-chat',
            'deepseek-reasoner',
        ],
        defaultModel: 'deepseek-chat',
        baseURL: 'https://api.deepseek.com/v1',
        getKeyUrl: 'https://platform.deepseek.com/api_keys',
        hint: 'Affordable reasoning models — great for agentic tasks',
        supportsVision: false,
    },
    openrouter: {
        name: 'OpenRouter',
        provider: 'openai', // OpenRouter uses OpenAI-compatible API
        models: [
            // Best free models for agentic tasks
            'moonshotai/kimi-k2:free',           // 1T params, excellent tool use
            'google/gemma-3-12b-it:free',         // Strong reasoning
            'qwen/qwen3-4b:free',                 // Good for agents
            'google/gemma-3-4b-it:free',          // Efficient
            'meta-llama/llama-3.3-70b-instruct:free', // Fast
            'openai/gpt-oss-120b:free',
        ],
        defaultModel: 'moonshotai/kimi-k2:free',
        baseURL: 'https://openrouter.ai/api/v1',
        getKeyUrl: 'https://openrouter.ai/keys',
        hint: 'Free models available — Kimi K2 recommended for agents',
        supportsVision: true,
    },
    google: {
        name: 'Google Gemini',
        provider: 'google',
        models: [
            'gemini-2.5-flash-lite',
            'gemini-2.5-flash',
            'gemini-3-flash-preview',
            'gemini-2.5-pro',
            'gemini-3-pro',
        ],
        defaultModel: 'gemini-2.5-flash',
        getKeyUrl: 'https://aistudio.google.com/app/apikey',
        hint: 'Free tier with 20 req/day — multimodal vision support',
        supportsVision: true,
    },
    openai: {
        name: 'OpenAI',
        provider: 'openai',
        models: [
            'gpt-4o',
            'gpt-4o-mini',
            'gpt-4.1',
            'gpt-4.1-mini',
            'gpt-4.1-nano',
            'o4-mini',
        ],
        defaultModel: 'gpt-4o-mini',
        baseURL: 'https://api.openai.com/v1',
        getKeyUrl: 'https://platform.openai.com/api-keys',
        supportsVision: true,
    },
    anthropic: {
        name: 'Anthropic',
        provider: 'anthropic',
        models: [
            'claude-sonnet-4-20250514',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
        ],
        defaultModel: 'claude-sonnet-4-20250514',
        getKeyUrl: 'https://console.anthropic.com/settings/keys',
        supportsVision: true,
    },
    qwen: {
        name: 'Qwen (Alibaba)',
        provider: 'openai', // Qwen uses OpenAI-compatible API
        models: [
            'qwen-turbo',
            'qwen-plus',
            'qwen-max',
            'qwen-long',
        ],
        defaultModel: 'qwen-turbo',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        getKeyUrl: 'https://bailian.console.aliyun.com/',
        hint: 'Alibaba Cloud — Chinese language support',
        supportsVision: true,
    },
};

/**
 * Get provider configuration by provider key
 */
export function getProviderConfig(provider: LLMProvider): ProviderConfig {
    return LLM_PROVIDERS[provider];
}

/**
 * Get all provider keys (in display order)
 */
export function getProviderKeys(): LLMProvider[] {
    return Object.keys(LLM_PROVIDERS) as LLMProvider[];
}

/**
 * Check if a model is valid for a provider
 */
export function isValidModel(provider: LLMProvider, model: string): boolean {
    const config = LLM_PROVIDERS[provider];
    return config.models.includes(model);
}

/**
 * Get the default model for a provider
 */
export function getDefaultModel(provider: LLMProvider): string {
    return LLM_PROVIDERS[provider].defaultModel;
}
