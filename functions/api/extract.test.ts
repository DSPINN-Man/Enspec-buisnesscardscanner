import { describe, expect, it } from 'vitest';
import { getGeminiModelPlans } from './extract';

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
