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
    dbx.contacts.get(id).then((r) => {
      if (!r) return;
      setRow(r);
      if (r.imageBlob) {
        const url = URL.createObjectURL(r.imageBlob);
        setImageUrl(url);
        return () => URL.revokeObjectURL(url);
      }
    });
  }, [id]);

  if (!row) return <div className="pt-[72px] px-4 text-ink-2">Loading…</div>;

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
    <div className="pt-[72px] pb-[160px] px-4">
      {imageUrl && (
        <div className="mb-4 rounded-xl2 overflow-hidden border hairline">
          <img src={imageUrl} alt="captured card" className="w-full" />
        </div>
      )}
      {row.syncStatus === 'needs-extraction' && (
        <div className="glass px-4 py-3 mb-4 border-warn/50">
          <p className="text-warn text-sm">Awaiting AI extraction. Will run automatically when online.</p>
        </div>
      )}

      <ConfidenceField label="Name"    value={row.name}    confidence={conf.name    ?? 0} onChange={(v) => patch('name', v)} />
      <ConfidenceField label="Title"   value={row.title}   confidence={conf.title   ?? 0} onChange={(v) => patch('title', v)} />
      <ConfidenceField label="Company" value={row.company} confidence={conf.company ?? 0} onChange={(v) => patch('company', v)} />
      <ConfidenceField label="Email"   value={row.email}   confidence={conf.email   ?? 0} onChange={(v) => patch('email', v)} type="email" />
      <ConfidenceField label="Phone"   value={row.phone}   confidence={conf.phone   ?? 0} onChange={(v) => patch('phone', v)} type="tel" />
      <ConfidenceField label="Website" value={row.website} confidence={conf.website ?? 0} onChange={(v) => patch('website', v)} type="url" />
      <ConfidenceField label="Notes"   value={row.notes}   confidence={0} onChange={(v) => patch('notes', v)} multiline />

      <button
        onClick={async () => { await flushPending(); nav('/'); }}
        className="w-full mt-2 py-3.5 rounded-2xl bg-accent text-white font-bold active:scale-[0.99] transition"
      >
        Save & sync
      </button>
      <button
        onClick={() => nav('/')}
        className="w-full mt-2 py-3 text-ink-2 font-semibold"
      >
        Done (sync later)
      </button>
    </div>
  );
}
