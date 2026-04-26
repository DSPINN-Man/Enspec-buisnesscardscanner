import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dbx, patchContact, type Contact } from '@/db';
import { flushPending } from '@/sync/queue';
import { ConfidenceField } from '@/components/ConfidenceField';

export default function Review() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [row, setRow] = useState<Contact | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    dbx.contacts.get(id).then((r) => {
      if (cancelled || !r) return;
      setRow(r);
      if (r.imageBlob) {
        createdUrl = URL.createObjectURL(r.imageBlob);
        setImageUrl(createdUrl);
      }
    });
    return () => {
      cancelled = true;
      // Defer revoke so the <img> can finish loading before the URL dies.
      // Revoking synchronously in StrictMode kills the image before paint.
      if (createdUrl) {
        const u = createdUrl;
        setTimeout(() => URL.revokeObjectURL(u), 5000);
      }
    };
  }, [id]);

  if (!row) return <div className="shell pt-6 text-ink-2">Loading…</div>;

  const conf = row.confidence ?? {};
  const patch = async (field: keyof Contact, value: string) => {
    const trimmed = value.length ? value : null;
    await patchContact(row.id, {
      [field]: trimmed,
      syncStatus: row.syncStatus === 'synced' ? 'pending' : row.syncStatus,
    } as Partial<Contact>);
    setRow({ ...row, [field]: trimmed } as Contact);
  };

  return (
    <div className="shell pt-2 pb-32">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => nav('/')} className="w-10 h-10 rounded-full border border-hairline bg-card flex items-center justify-center text-ink-2 hover:text-ink transition" aria-label="Back">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1 className="font-display font-extrabold text-[26px] tracking-tight">Review</h1>
      </div>

      {imageUrl && (
        <div className="card overflow-hidden mb-4">
          <img src={imageUrl} alt="captured card" className="w-full block" />
        </div>
      )}

      {row.syncStatus === 'needs-extraction' && (
        <div className="card border-warn/40 bg-warn/5 px-4 py-3 mb-4">
          <p className="text-warn text-sm font-medium">Awaiting AI extraction.</p>
          {row.syncError ? (
            <p className="text-warn/90 text-xs mt-1 font-mono break-all">{row.syncError}</p>
          ) : (
            <p className="text-warn/80 text-xs mt-0.5">Will run automatically when online.</p>
          )}
        </div>
      )}

      <div className="card p-4">
        <ConfidenceField label="Name"    value={row.name}    confidence={conf.name    ?? 0} onChange={(v) => patch('name', v)} />
        <ConfidenceField label="Title"   value={row.title}   confidence={conf.title   ?? 0} onChange={(v) => patch('title', v)} />
        <ConfidenceField label="Company" value={row.company} confidence={conf.company ?? 0} onChange={(v) => patch('company', v)} />
        <ConfidenceField label="Email"   value={row.email}   confidence={conf.email   ?? 0} onChange={(v) => patch('email', v)} type="email" />
        <ConfidenceField label="Phone"   value={row.phone}   confidence={conf.phone   ?? 0} onChange={(v) => patch('phone', v)} type="tel" />
        <ConfidenceField label="Website" value={row.website} confidence={conf.website ?? 0} onChange={(v) => patch('website', v)} type="url" />
        <ConfidenceField label="Notes"   value={row.notes}   confidence={0} onChange={(v) => patch('notes', v)} multiline />
      </div>

      <div className="mt-3 space-y-2">
        <button
          onClick={async () => { await flushPending(); nav('/'); }}
          className="w-full py-3.5 rounded-full bg-accent text-white font-semibold shadow-cta active:scale-[0.99] transition"
        >
          Save & sync
        </button>
        <button
          onClick={() => nav('/')}
          className="w-full py-3 text-ink-2 font-medium"
        >
          Done (sync later)
        </button>
      </div>
    </div>
  );
}
