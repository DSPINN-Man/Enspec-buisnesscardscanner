// Extraction client. Posts a captured JPEG to /api/extract (Pages Function),
// which proxies Gemini 2.0 Flash with a structured-output system prompt that
// also returns a normalised bounding box of the card. The client uses that
// bbox to crop the original photo down to just the card before saving — so
// the review screen and any synced image is tightly cropped.

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

export interface BoundingBox { x: number; y: number; width: number; height: number; }

export interface ExtractResult {
  fields: Extracted;
  confidence: Record<keyof Extracted, number>;
  rawText: string;
  boundingBox: BoundingBox | null;
  croppedBlob: Blob;        // tightly cropped to the card; falls back to input
}

const EXTRACT_ENDPOINT = import.meta.env.VITE_EXTRACT_ENDPOINT ?? '/api/extract';

export async function extractFromBlob(blob: Blob): Promise<ExtractResult> {
  if (!navigator.onLine) throw new Error('offline');

  const form = new FormData();
  form.append('image', blob, 'card.jpg');

  const res = await fetch(EXTRACT_ENDPOINT, { method: 'POST', body: form });
  if (!res.ok) {
    if (res.status === 429) {
      const e = new Error('Gemini rate limit hit — will retry in a few minutes. (Free tier: 15 req/min, 1500 req/day.)');
      (e as any).status = 429;
      throw e;
    }
    if (res.status === 401 || res.status === 403) {
      const e = new Error('Gemini rejected the API key. Check GEMINI_API_KEY in Pages → Variables and Secrets.');
      (e as any).status = res.status;
      throw e;
    }
    const detail = await res.text().catch(() => '');
    throw new Error(`Extract API ${res.status}: ${detail.slice(0, 300) || res.statusText}`);
  }

  const json = (await res.json()) as {
    fields: unknown;
    confidence: Record<keyof Extracted, number>;
    rawText?: string;
    boundingBox?: BoundingBox | null;
  };
  const fields = ExtractedSchema.parse(json.fields);
  const bbox = sanitiseBBox(json.boundingBox);
  const croppedBlob = bbox ? await cropToBBox(blob, bbox).catch(() => blob) : blob;

  return {
    fields,
    confidence: json.confidence,
    rawText: json.rawText ?? '',
    boundingBox: bbox,
    croppedBlob,
  };
}

// Reject obviously-bad bboxes (zero area, out of bounds, edge-to-edge —
// which usually means the model gave up and returned the full frame).
function sanitiseBBox(b: unknown): BoundingBox | null {
  if (!b || typeof b !== 'object') return null;
  const { x, y, width, height } = b as BoundingBox;
  if ([x, y, width, height].some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  if (width <= 0.05 || height <= 0.05) return null;
  if (width >= 0.98 && height >= 0.98) return null; // basically the whole frame; not useful
  const clamped = {
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
    width: Math.max(0, Math.min(1, width)),
    height: Math.max(0, Math.min(1, height)),
  };
  // Add a small padding so we don't shave the card edge.
  const pad = 0.02;
  clamped.x = Math.max(0, clamped.x - pad);
  clamped.y = Math.max(0, clamped.y - pad);
  clamped.width = Math.min(1 - clamped.x, clamped.width + pad * 2);
  clamped.height = Math.min(1 - clamped.y, clamped.height + pad * 2);
  return clamped;
}

async function cropToBBox(blob: Blob, b: BoundingBox): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const cw = Math.round(bitmap.width  * b.width);
  const ch = Math.round(bitmap.height * b.height);
  const sx = Math.round(bitmap.width  * b.x);
  const sy = Math.round(bitmap.height * b.y);

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.drawImage(bitmap, sx, sy, cw, ch, 0, 0, cw, ch);
  bitmap.close?.();

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('crop blob failed'))),
      'image/jpeg',
      0.92,
    ),
  );
}
