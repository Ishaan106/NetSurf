/**
 * LLM API Key Validator
 * Validates API keys against provider endpoints with detailed error handling
 */

import { LLMProvider, getProviderConfig } from '../models/llmProviders';

export interface ValidationResult {
    valid: boolean;
    statusCode: number;
    message: string;
    error?: string;
}

// Note: In Electron main process, we use fetch API (available in Node 18+)
// For actual validation, we make lightweight requests to each provider

/**
 * Validates an API key by making a lightweight request to the provider
 * Returns detailed error codes: 401 (invalid), 429 (rate limit), 500 (provider down)
 */
export async function validateApiKey(
    provider: LLMProvider,
    apiKey: string
): Promise<ValidationResult> {
    const config = getProviderConfig(provider);

    // Local provider doesn't need an API key - just check server availability
    if (provider === 'local') {
        return await validateLocalServer(config.baseURL);
    }

    if (!apiKey || apiKey.trim() === '') {
        return {
            valid: false,
            statusCode: 400,
            message: 'API key is required',
            error: 'EMPTY_KEY',
        };
    }

    try {
        const result = await performValidation(provider, apiKey, config.baseURL);
        return result;
    } catch (error) {
        // Network error or provider completely down
        const errorMessage = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
        console.error('[LLM Validator] Error:', errorMessage);
        return {
            valid: false,
            statusCode: 500,
            message: 'Provider service is unavailable',
            error: errorMessage,
        };
    }
}

/**
 * Validates local LLM server availability (no API key needed)
 */
export async function validateLocalServer(baseURL?: string): Promise<ValidationResult> {
    const url = baseURL ? `${baseURL}/models` : 'http://localhost:8080/v1/models';

    console.log(`[LLM Validator] Testing local server at ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (response.ok) {
            return {
                valid: true,
                statusCode: 200,
                message: 'Local server is running',
            };
        }

        return {
            valid: false,
            statusCode: response.status,
            message: `Local server responded with status ${response.status}`,
            error: 'SERVER_ERROR',
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
        console.error('[LLM Validator] Local server error:', errorMessage);
        return {
            valid: false,
            statusCode: 503,
            message: 'Local server is not running or unreachable',
            error: 'SERVER_UNAVAILABLE',
        };
    }
}

/**
 * Perform the actual validation request based on provider
 */
async function performValidation(
    provider: LLMProvider,
    apiKey: string,
    baseURL?: string
): Promise<ValidationResult> {
    const endpoints: Record<LLMProvider, { url: string; headers: Record<string, string>; method: string; body?: string }> = {
        local: {
            url: baseURL ? `${baseURL}/models` : 'http://localhost:8080/v1/models',
            headers: {},
            method: 'GET',
        },
        deepseek: {
            url: 'https://api.deepseek.com/v1/models',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            method: 'GET',
        },
        openrouter: {
            url: baseURL ? `${baseURL}/models` : 'https://openrouter.ai/api/v1/models',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            method: 'GET',
        },
        google: {
            url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            headers: {},
            method: 'GET',
        },
        openai: {
            url: 'https://api.openai.com/v1/models',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            method: 'GET',
        },
        anthropic: {
            url: 'https://api.anthropic.com/v1/messages',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
            },
            method: 'POST',
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'hi' }],
            }),
        },
        qwen: {
            url: baseURL ? `${baseURL}/models` : 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            method: 'GET',
        },
    };

    const endpoint = endpoints[provider];

    console.log(`[LLM Validator] Validating ${provider} API key...`);

    const fetchOptions: RequestInit = {
        method: endpoint.method,
        headers: endpoint.headers,
    };

    if (endpoint.body) {
        fetchOptions.body = endpoint.body;
    }

    const response = await fetch(endpoint.url, fetchOptions);

    return parseValidationResponse(response, provider);
}

/**
 * Parse the validation response and return appropriate result
 */
function parseValidationResponse(response: Response, provider: LLMProvider): ValidationResult {
    const status = response.status;

    console.log(`[LLM Validator] ${provider} response status: ${status}`);

    // Success - key is valid
    if (status >= 200 && status < 300) {
        return {
            valid: true,
            statusCode: 200,
            message: 'API key is valid',
        };
    }

    // 400 for Anthropic can mean invalid request but key might be ok
    // We treat 400 as potentially valid for some providers
    if (status === 400 && provider === 'anthropic') {
        // Anthropic returns 400 for invalid request format, but if we get here
        // it means auth succeeded - check error message
        return {
            valid: true, // Auth passed if we got 400 instead of 401
            statusCode: 200,
            message: 'API key is valid',
        };
    }

    // 401 - Invalid/unauthorized API key
    if (status === 401 || status === 403) {
        return {
            valid: false,
            statusCode: 401,
            message: 'Invalid API key',
            error: 'INVALID_KEY',
        };
    }

    // 429 - Rate limit exceeded
    if (status === 429) {
        return {
            valid: false,
            statusCode: 429,
            message: 'Rate limit exceeded. Please try again later.',
            error: 'RATE_LIMITED',
        };
    }

    // 5xx - Provider service issues
    if (status >= 500) {
        return {
            valid: false,
            statusCode: 500,
            message: 'Provider service is currently unavailable',
            error: 'PROVIDER_DOWN',
        };
    }

    // Other errors (404, etc.)
    return {
        valid: false,
        statusCode: status,
        message: `Validation failed with status ${status}`,
        error: 'UNKNOWN_ERROR',
    };
}

/**
 * Get user-friendly error message for display
 */
export function getValidationErrorMessage(result: ValidationResult): string {
    switch (result.error) {
        case 'EMPTY_KEY':
            return 'Please enter an API key';
        case 'INVALID_KEY':
            return 'The API key is invalid. Please check and try again.';
        case 'RATE_LIMITED':
            return 'Rate limit exceeded. Please wait a moment and try again.';
        case 'PROVIDER_DOWN':
            return 'The provider service is currently down. Please try later.';
        default:
            return result.message;
    }
}
