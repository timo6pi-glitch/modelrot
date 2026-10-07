import Anthropic from '@anthropic-ai/sdk';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';

const anthropic = new Anthropic();
export const MODEL: string = 'claude-sonnet-4-5-20250929';

// Bedrock cross-region inference profile
export const BEDROCK_MODEL = 'us.anthropic.claude-sonnet-4-20250514-v1:0';

export const router = { cheap: 'openai/gpt-3.5-turbo', vision: 'models/gemini-2.0-flash-lite' };
