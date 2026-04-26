export type Mode = 'card' | 'badge';

export function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex p-1 rounded-full bg-card border border-hairline shadow-sm w-full">
      {(['card', 'badge'] as Mode[]).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`flex-1 py-2 rounded-full text-[14px] font-semibold transition ${
            mode === m
              ? 'bg-accent text-white shadow-cta'
              : 'text-ink-2 hover:text-ink'
          }`}
        >
          {m === 'card' ? 'Business Card' : 'Conference Badge'}
        </button>
      ))}
    </div>
  );
}
