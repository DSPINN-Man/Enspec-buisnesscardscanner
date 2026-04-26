import { useState } from 'react';

const THRESHOLD = 0.95;

export function ConfidenceField({
  label, value, confidence, onChange, multiline, type = 'text',
}: {
  label: string;
  value: string | null;
  confidence: number;
  onChange: (v: string) => void;
  multiline?: boolean;
  type?: string;
}) {
  const [focus, setFocus] = useState(false);
  const low = confidence > 0 && confidence < THRESHOLD;

  const tone = focus
    ? 'border-accent ring-2 ring-accent/15'
    : low
      ? 'border-warn bg-warn/5'
      : 'border-hairline bg-card';

  const cls = `w-full rounded-2xl border px-4 py-3 text-ink placeholder:text-ink-3 outline-none transition ${tone}`;

  return (
    <label className="block mb-3">
      <div className="flex justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-ink-2 font-semibold">{label}</span>
        {confidence > 0 && (
          <span className={`text-[11px] uppercase tracking-wider font-semibold ${low ? 'text-warn' : 'text-ink-3'}`}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          rows={3}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={`Add ${label.toLowerCase()}`}
          className={cls}
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={`Add ${label.toLowerCase()}`}
          className={cls}
        />
      )}
    </label>
  );
}
