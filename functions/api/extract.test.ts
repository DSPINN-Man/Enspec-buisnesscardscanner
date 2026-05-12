import { describe, expect, it } from 'vitest';
import { getGeminiModelPlans, shouldTryNextGeminiModel } from './extract';

describe('getGeminiModelPlans', () => {
  it('uses Gemini 3.1 Flash-Lite before 2.5 stable fallbacks', () => {
    expect(getGeminiModelPlans({}).map((plan) => plan.model)).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ]);
  });

  it('keeps custom model env vars while deduping fallback plans', () => {
    expect(getGeminiModelPlans({
      GEMINI_MODEL: 'gemini-2.5-flash',
      GEMINI_FALLBACK_MODEL: 'gemini-2.5-flash',
    })).toEqual([
      { model: 'gemini-2.5-flash', attempts: 2 },
      { model: 'gemini-2.5-flash-lite', attempts: 1 },
    ]);
  });
});

describe('shouldTryNextGeminiModel', () => {
  it('falls back when a specific Gemini model returns project access denied', () => {
    expect(shouldTryNextGeminiModel(
      403,
      '{"error":{"message":"Your project has been denied access. Please contact support.","status":"PERMISSION_DENIED"}}',
    )).toBe(true);
  });

  it('does not hide truly invalid or leaked API keys behind model fallback', () => {
    expect(shouldTryNextGeminiModel(403, 'API key not valid. Please pass a valid API key.')).toBe(false);
    expect(shouldTryNextGeminiModel(403, 'Your API key was reported as leaked. Please use another API key.')).toBe(false);
  });
});
