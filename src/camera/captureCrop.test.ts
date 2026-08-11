import { describe, expect, it } from 'vitest';
import { getCoverCaptureCrop } from './captureCrop';

describe('getCoverCaptureCrop', () => {
  it('removes the hidden top and bottom from a portrait camera stream', () => {
    const crop = getCoverCaptureCrop({
      sourceWidth: 1080,
      sourceHeight: 1920,
      viewportWidth: 320,
      viewportHeight: 240,
    });

    expect(crop.x).toBeCloseTo(0);
    expect(crop.y).toBeCloseTo(555);
    expect(crop.width).toBeCloseTo(1080);
    expect(crop.height).toBeCloseTo(810);
  });

  it('removes the hidden sides from a widescreen landscape stream', () => {
    const crop = getCoverCaptureCrop({
      sourceWidth: 1920,
      sourceHeight: 1080,
      viewportWidth: 320,
      viewportHeight: 240,
    });

    expect(crop.x).toBeCloseTo(240);
    expect(crop.y).toBeCloseTo(0);
    expect(crop.width).toBeCloseTo(1440);
    expect(crop.height).toBeCloseTo(1080);
  });

  it('maps the visible guide inset into native camera pixels', () => {
    const crop = getCoverCaptureCrop({
      sourceWidth: 1080,
      sourceHeight: 1920,
      viewportWidth: 320,
      viewportHeight: 240,
      inset: 12,
    });

    expect(crop.x).toBeCloseTo(40.5);
    expect(crop.y).toBeCloseTo(595.5);
    expect(crop.width).toBeCloseTo(999);
    expect(crop.height).toBeCloseTo(729);
  });
});
