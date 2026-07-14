/**
 * ConfigAdapter - Bridge between existing secure key storage and @jarvis-agent/core LLMs format
 * 
 * Keeps the existing simple key storage system but provides the config objects
 * that the new EkoService needs. This avoids introducing a heavy config system.
 */

import type { LLMs } from '@jarvis-agent/core';
import { LLMProvider, getProviderConfig } from '../models/llmProviders';

export interface ResolvedLLMConfig {
    provider: LLMProvider;
    apiKey: string;
    model: string;
    baseURL?: string;
    screenshotEnabled?: boolean; // false = text-only mode (saves tokens for non-vision models)
}

/**
 * Build the LLMs config object that @jarvis-agent/core expects
 */
export function buildLLMsConfig(config: ResolvedLLMConfig): LLMs {
    const providerConfig = getProviderConfig(config.provider);
    const effectiveBaseURL = config.baseURL || providerConfig.baseURL;

    const llmConfig: any = {
        provider: providerConfig.provider as 'anthropic' | 'openai' | 'google',
        model: config.model,
        apiKey: config.apiKey,
        ...(effectiveBaseURL && {
            config: {
                baseURL: effectiveBaseURL,
            },
        }),
    };

    // Local LLM servers (llama.cpp, Ollama, vLLM) typically don't support
    // toolChoice: "auto" without special flags. Remove it to prevent errors.
    if (config.provider === 'local') {
        llmConfig.handler = async (options: any) => {
            if (options.toolChoice?.type === 'auto') {
                delete options.toolChoice;
            }
            return options;
        };
    }

    return { default: llmConfig };
}

/**
 * Agent config — controls which agents are enabled
 * Kept simple: browser + file agents always on
 */
export interface AgentConfig {
    browserAgent: { enabled: boolean };
    fileAgent: { enabled: boolean };
}

export function getDefaultAgentConfig(): AgentConfig {
    return {
        browserAgent: { enabled: true },
        fileAgent: { enabled: true },
    };
}
