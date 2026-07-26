/**
 * OpenAI Service
 *
 * Reusable OpenAI chat completion client with:
 * - Retry logic with exponential backoff
 * - Configurable timeout
 * - Structured JSON output parsing
 * - Graceful error handling (never exposes API errors to client)
 */

const OpenAI = require('openai');
const {
  OPENAI_API_KEY,
  OPENAI_MODEL,
  OPENAI_MAX_TOKENS,
  OPENAI_TIMEOUT,
  OPENAI_MAX_RETRIES,
} = require('../config');

let openaiClient = null;

function getClient() {
  if (!openaiClient) {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
      timeout: OPENAI_TIMEOUT,
      maxRetries: OPENAI_MAX_RETRIES,
    });
  }
  return openaiClient;
}

/**
 * Call OpenAI chat completion with structured output.
 *
 * @param {Object} options
 * @param {string} options.systemPrompt - System prompt for context
 * @param {string} options.userMessage - User message
 * @param {Object} [options.jsonSchema] - Optional JSON schema for structured output
 * @param {number} [options.maxTokens] - Override max tokens
 * @param {number} [options.temperature=0.3] - Temperature (low for deterministic extraction)
 * @returns {Promise<Object>} { success, data, error, model, usage }
 */
async function chatCompletion({ systemPrompt, userMessage, jsonSchema, maxTokens, temperature = 0.3 }) {
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const completionOptions = {
    model: OPENAI_MODEL,
    messages,
    max_tokens: maxTokens || OPENAI_MAX_TOKENS,
    temperature,
  };

  // If a JSON schema is provided, use response_format for structured output
  if (jsonSchema) {
    completionOptions.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'structured_response',
        strict: true,
        schema: jsonSchema,
      },
    };
  }

  const client = getClient();

  try {
    const response = await client.chat.completions.create(completionOptions);

    const choice = response.choices?.[0];
    if (!choice) {
      return { success: false, error: 'No response from AI model' };
    }

    const content = choice.message?.content || '';

    // If JSON schema was requested, parse the response
    if (jsonSchema) {
      try {
        const parsed = JSON.parse(content);
        return {
          success: true,
          data: parsed,
          model: response.model,
          usage: response.usage,
        };
      } catch (parseErr) {
        return { success: false, error: 'Failed to parse AI response as JSON' };
      }
    }

    return {
      success: true,
      data: content,
      model: response.model,
      usage: response.usage,
    };
  } catch (err) {
    // Log the error but never expose API details to the client
    console.error('[OpenAI] API error:', err.message);

    if (err.status === 429) {
      return { success: false, error: 'AI service is currently busy. Please try again.' };
    }
    if (err.status === 401) {
      return { success: false, error: 'AI service authentication failed.' };
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return { success: false, error: 'AI request timed out. Please try again.' };
    }
    if (err.status >= 500) {
      return { success: false, error: 'AI service unavailable. Please try again later.' };
    }

    return { success: false, error: 'Unable to process your request. Please try again.' };
  }
}

module.exports = {
  chatCompletion,
  getClient,
};
