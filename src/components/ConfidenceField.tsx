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
  const tone = low ? 'border-warn bg-warn/10' : focus ? 'border-accent' : 'border-hairline bg-surface';

  return (
    <label className="block mb-3">
      <div className="flex justify-between mb-1.5">
        <span className="text-[11px] uppercase tracking-wider text-ink-2 font-medium">{label}</span>
        {confidence > 0 && (
          <span className={`text-[11px] uppercase tracking-wider font-medium ${low ? 'text-warn' : 'text-ink-3'}`}>
            {Math.round(confidence * 100)}%
          </span>
        )}
      </div>
      {multiline ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={`Add ${label.toLowerCase()}`}
          rows={3}
          className={`w-full rounded-xl border px-3.5 py-3 text-ink placeholder:text-ink-3 outline-none transition ${tone}`}
        />
      ) : (
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          placeholder={`Add ${label.toLowerCase()}`}
          className={`w-full rounded-xl border px-3.5 py-3 text-ink placeholder:text-ink-3 outline-none transition ${tone}`}
        />
      )}
    </label>
  );
}
