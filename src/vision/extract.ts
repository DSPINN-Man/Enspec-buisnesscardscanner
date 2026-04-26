// Extraction client. Posts a captured JPEG to our Cloudflare Worker
// (/api/extract), which proxies Gemini 2.0 Flash with a structured-output
// system prompt. The API key lives as a Worker secret — never in the browser.
//
// Offline behaviour: callers check navigator.onLine first. If offline,
// the scan is stored with syncStatus = 'needs-extraction' and the queue
// flush runs extraction when connectivity returns.

import { z } from 'zod';

export const ExtractedSchema = z.object({
  name:    z.string().nullable(),
  title:   z.string().nullable(),
  company: z.string().nullable(),
  email:   z.string().nullable(),
  phone:   z.string().nullable(),
  website: z.string().nullable(),
  notes:   z.string().nullable(),
});
export type Extracted = z.infer<typeof ExtractedSchema>;

export interface ExtractResult {
  fields: Extracted;
  confidence: Record<keyof Extracted, number>;
  rawText: string;
}

const EXTRACT_ENDPOINT = import.meta.env.VITE_EXTRACT_ENDPOINT ?? '/api/extract';

export async function extractFromBlob(blob: Blob): Promise<ExtractResult> {
  if (!navigator.onLine) throw new Error('offline');

  const form = new FormData();
  form.append('image', blob, 'card.jpg');

  const res = await fetch(EXTRACT_ENDPOINT, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`extract failed: ${res.status}`);

  const json = await res.json();
  const fields = ExtractedSchema.parse(json.fields);
  const confidence = json.confidence as Record<keyof Extracted, number>;
  return { fields, confidence, rawText: json.rawText ?? '' };
}
