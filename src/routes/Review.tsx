// Review screen — reactively rerenders as Dexie patches the row, so the
// fields populate live as Gemini's response comes back. While extraction
// is in flight (syncStatus === 'needs-extraction' && !syncError) the form
// shows a shimmer skeleton + a subtle "Extracting…" status. The captured
// image is shown immediately so the few-second wait isn't a blank screen.

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbx, deleteContact, patchContact, toggleStar, type Contact } from '@/db';
import { flushPending } from '@/sync/queue';
import { ConfidenceField } from '@/components/ConfidenceField';

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Live row — repaints on every patchContact() call so the fields
  // populate the instant Gemini's response lands.
  const row = useLiveQuery<Contact | undefined>(
    async () => (id ? await dbx.contacts.get(id) : undefined),
    [id],
  );

  // Manage the object URL whenever the imageBlob changes (the bg extraction
  // replaces the original photo with the cropped version).
  useEffect(() => {
    if (!row?.imageBlob) { setImageUrl(null); return; }
    const url = URL.createObjectURL(row.imageBlob);
    setImageUrl(url);
    return () => { setTimeout(() => URL.revokeObjectURL(url), 5000); };
  }, [row?.imageBlob]);

  if (row === undefined) return <div className="shell pt-6 text-ink-2">Loading…</div>;
  if (row === null || !row) return <div className="shell pt-6 text-ink-2">Not found.</div>;

  const conf = row.confidence ?? {};
  const isExtracting = row.syncStatus === 'needs-extraction' && !row.syncError;
  const hasFields = !!(row.name || row.title || row.company || row.email || row.phone || row.website);

  const patch = async (field: keyof Contact, value: string) => {
    const trimmed = value.length ? value : null;
    await patchContact(row.id, {
      [field]: trimmed,
      syncStatus: row.syncStatus === 'synced' ? 'pending' : row.syncStatus,
    } as Partial<Contact>);
  };

  return (
    <div className="shell pt-2 pb-32">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => nav('/')} className="w-10 h-10 rounded-full border border-hairline bg-card flex items-center justify-center text-ink-2 hover:text-ink transition" aria-label="Back">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="font-display font-extrabold text-[26px] tracking-tight flex-1">Review</h1>
        <button
          onClick={() => toggleStar(row.id)}
          aria-label={row.starred ? 'Unstar' : 'Star'}
          className={`w-10 h-10 rounded-full border flex items-center justify-center transition ${
            row.starred ? 'bg-amber-400 border-amber-400 text-white' : 'bg-card border-hairline text-ink-2'
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill={row.starred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round">
            <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.2 1 5.9L12 17l-5.2 2.8 1-5.9L3.5 9.7l5.9-.9L12 3.5Z" />
          </svg>
        </button>
        <button
          onClick={async () => { if (confirm('Delete this scan?')) { await deleteContact(row.id); nav('/'); } }}
          aria-label="Delete"
          className="w-10 h-10 rounded-full border border-hairline bg-card flex items-center justify-center text-ink-2 hover:text-danger transition"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-7 4v7m4-7v7M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
          </svg>
        </button>
      </div>

      {imageUrl && (
        <div className="card overflow-hidden mb-4 relative animate-fadeUp">
          <img src={imageUrl} alt="captured card" className="w-full block" />
          {isExtracting && (
            <div className="absolute inset-0 bg-black/15 flex items-end p-3 pointer-events-none">
              <div className="bg-white/95 backdrop-blur rounded-full px-3 py-1.5 flex items-center gap-2 shadow-card">
                <Pulse />
                <span className="text-[12px] text-ink-2 font-medium">Extracting…</span>
              </div>
            </div>
          )}
        </div>
      )}

      {row.syncError && (
        <div className="card border-warn/40 bg-warn/5 px-4 py-3 mb-4">
          <p className="text-warn text-sm font-medium">AI extraction failed.</p>
          <ErrorHint err={row.syncError} />
        </div>
      )}

      <div className="card p-4 relative">
        {isExtracting && !hasFields ? (
          <SkeletonForm />
        ) : (
          <div className="animate-fadeUp">
            <ConfidenceField label="Name"    value={row.name}    confidence={conf.name    ?? 0} onChange={(v) => patch('name', v)} />
            <ConfidenceField label="Title"   value={row.title}   confidence={conf.title   ?? 0} onChange={(v) => patch('title', v)} />
            <ConfidenceField label="Company" value={row.company} confidence={conf.company ?? 0} onChange={(v) => patch('company', v)} />
            <ConfidenceField label="Email"   value={row.email}   confidence={conf.email   ?? 0} onChange={(v) => patch('email', v)} type="email" />
            <ConfidenceField label="Phone"   value={row.phone}   confidence={conf.phone   ?? 0} onChange={(v) => patch('phone', v)} type="tel" />
            <ConfidenceField label="Website" value={row.website} confidence={conf.website ?? 0} onChange={(v) => patch('website', v)} type="url" />
            <ConfidenceField label="Notes"   value={row.notes}   confidence={0} onChange={(v) => patch('notes', v)} multiline />
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <button
          onClick={async () => { await flushPending(); nav('/'); }}
          disabled={isExtracting && !hasFields}
          className="w-full py-3.5 rounded-full bg-accent text-white font-semibold shadow-cta active:scale-[0.99] transition disabled:opacity-50"
        >
          Save & sync
        </button>
        <button onClick={() => nav('/')} className="w-full py-3 text-ink-2 font-medium">
          Done (sync later)
        </button>
      </div>
    </div>
  );
}

// ---- Skeleton + spinners --------------------------------------------------

function SkeletonForm() {
  return (
    <div className="space-y-3">
      {['Name','Title','Company','Email','Phone','Website','Notes'].map((label, i) => (
        <div key={label}>
          <div className="text-[11px] uppercase tracking-wider text-ink-3 font-semibold mb-1.5">{label}</div>
          <div
            className="rounded-2xl border border-hairline bg-gradient-to-r from-bg-2 via-hairline to-bg-2 bg-[length:200%_100%] animate-shimmer"
            style={{ height: label === 'Notes' ? 88 : 46, animationDelay: `${i * 60}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

function Pulse() {
  return (
    <span className="relative inline-flex w-2.5 h-2.5">
      <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-60" />
      <span className="relative w-2.5 h-2.5 rounded-full bg-accent" />
    </span>
  );
}

function ErrorHint({ err }: { err: string }) {
  const isQuota = /\b429\b|quota|rate limit/i.test(err);
  const isAuth  = /\b40[13]\b|API key|authentication/i.test(err);
  if (isQuota) {
    return (
      <p className="text-warn/90 text-xs mt-1">
        Hit Gemini's free-tier rate limit. The queue will retry automatically in a few minutes.
      </p>
    );
  }
  if (isAuth) {
    return (
      <p className="text-warn/90 text-xs mt-1">
        Gemini rejected the API key. Check <span className="font-mono">GEMINI_API_KEY</span> in Cloudflare Pages → Variables and Secrets, then redeploy.
      </p>
    );
  }
  return <p className="text-warn/90 text-xs mt-1 font-mono break-all">{err}</p>;
}
