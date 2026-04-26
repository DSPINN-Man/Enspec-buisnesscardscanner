export type Mode = 'card' | 'badge';

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex p-0.5 rounded-full border hairline bg-surface">
      {(['card', 'badge'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3.5 py-1 rounded-full text-[13px] font-semibold transition ${
            mode === m ? 'bg-accent text-white shadow-lg shadow-accent/40' : 'text-ink-2'
          }`}
        >
          {m === 'card' ? 'Card' : 'Badge'}
        </button>
      ))}
    </div>
  );
}
