import { describe, expect, it } from 'vitest';
import { getGeminiModelPlans } from './extract';

describe('getGeminiModelPlans', () => {
  it('uses the latest extraction-friendly Gemini model before stable fallbacks', () => {
    expect(getGeminiModelPlans({}).map((plan) => plan.model)).toEqual([
      'gemini-3.1-flash-lite-preview',
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
