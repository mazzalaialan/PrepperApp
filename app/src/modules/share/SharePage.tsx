import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, FileUp, Share2 } from 'lucide-react';
import { MIN_PASSWORD_LENGTH } from '@/core/security/vault';
import { deliverFile } from '@/ui/files';
import { mergeShare, type Conflict, type LocalData, type MergeDecisions } from './merge';
import { applyMerge, collectShare, decodeShare, encodeShare, loadLocalData, SHARE_EXTENSION, SHARE_SECTIONS, ShareError, shareFileName, type SharePayload, type ShareSelection } from './package';

/** Compartir fichas, contactos y documentos con un familiar, y recibir los suyos sin borrar nada. */
export function SharePage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('share.title')}</h1>
      </div>
      <p className="hint" style={{ margin: 0 }} data-testid="share-quick">
        {t('share.quickBefore')} <Link to="/first-aid/location">{t('share.quickLink')}</Link> {t('share.quickAfter')}
      </p>
      <p className="hint">{t('share.intro')}</p>
      <SendSection />
      <ReceiveSection />
    </div>
  );
}

function SendSection() {
  const { t } = useTranslation();
  const [selection, setSelection] = useState<ShareSelection>({ medical: true, contacts: true, documents: true, inventory: false, waypoints: true, garden: true });
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(t('share.passwordShort', { min: MIN_PASSWORD_LENGTH }));
    if (password !== repeat) return setError(t('share.passwordMismatch'));
    setBusy(true);
    try {
      const how = await deliverFile(await encodeShare(await collectShare(selection), password), shareFileName());
      setMessage(t(how === 'shared' ? 'share.sent' : 'share.downloaded'));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) throw err;
    } finally {
      setBusy(false);
    }
  }

  const option = (key: keyof ShareSelection) => (
    <label className="check">
      <input type="checkbox" checked={selection[key]} onChange={(e) => setSelection((s) => ({ ...s, [key]: e.target.checked }))} />
      {t(`share.include.${key}`)}
    </label>
  );

  return (
    <form className="card stack" onSubmit={handleSubmit}>
      <h2 className="section-title" style={{ margin: 0 }}>{t('share.sendTitle')}</h2>
      {SHARE_SECTIONS.map((key) => (
        <Fragment key={key}>{option(key)}</Fragment>
      ))}
      {selection.inventory && <p className="hint" style={{ margin: 0 }}>{t('share.inventoryHint')}</p>}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="share-password">{t('share.password')}</label>
          <input id="share-password" className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="share-repeat">{t('share.repeat')}</label>
          <input id="share-repeat" className="input" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </div>
      </div>
      <p className="hint" style={{ margin: 0 }}>{t('share.passwordHint')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <div className="row-end">
        <button className="btn btn-primary" type="submit" disabled={busy || !SHARE_SECTIONS.some((k) => selection[k])}>
          <Share2 size={18} /> {busy ? t('share.creating') : t('share.create')}
        </button>
      </div>
    </form>
  );
}

function ReceiveSection() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<{ payload: SharePayload; local: LocalData } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function handleOpen(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const payload = await decodeShare(new Uint8Array(await file.arrayBuffer()), password);
      setOpened({ payload, local: await loadLocalData() });
    } catch (err) {
      if (!(err instanceof ShareError)) throw err;
      setError(t(`share.error.${err.code}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2 className="section-title" style={{ margin: 0 }}>{t('share.receiveTitle')}</h2>
      {done && (
        <p className="success" role="status" data-testid="share-done">
          {done}
        </p>
      )}
      {!opened ? (
        <form className="stack" onSubmit={handleOpen}>
          <p className="hint" style={{ margin: 0 }}>{t('share.receiveHint')}</p>
          <div className="field">
            <label htmlFor="share-file">
              <FileUp size={16} aria-hidden /> {t('share.chooseFile')}
            </label>
            <input
              id="share-file"
              className="input"
              type="file"
              accept={`${SHARE_EXTENSION},application/octet-stream,application/json`}
              data-testid="share-file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="field">
            <label htmlFor="share-open-password">{t('share.openPassword')}</label>
            <input id="share-open-password" className="input" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row-end">
            <button className="btn btn-primary" type="submit" disabled={!file || !password || busy}>
              {busy ? t('share.opening') : t('share.open')}
            </button>
          </div>
        </form>
      ) : (
        <MergePreview
          payload={opened.payload}
          local={opened.local}
          onCancel={() => setOpened(null)}
          onApplied={(summary) => {
            setOpened(null);
            setFile(null);
            setPassword('');
            setDone(summary);
          }}
        />
      )}
    </section>
  );
}

function MergePreview({ payload, local, onCancel, onApplied }: { payload: SharePayload; local: LocalData; onCancel: () => void; onApplied: (summary: string) => void }) {
  const { t } = useTranslation();
  const [decisions, setDecisions] = useState<MergeDecisions>({ separate: new Set(), useTheirs: new Set() });
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => mergeShare(local, payload, decisions), [local, payload, decisions]);

  const toggle = (key: 'separate' | 'useTheirs', value: string, on: boolean) =>
    setDecisions((d) => {
      const next = new Set(d[key]);
      if (on) next.add(value);
      else next.delete(value);
      return { ...d, [key]: next };
    });
  // Una ficha separada sigue apareciendo para poder volver a juntarla.
  const separated = payload.profiles.filter((p) => decisions.separate.has(p.id));

  async function apply() {
    setBusy(true);
    try {
      await applyMerge(result, payload);
      onApplied(
        t('share.applied', {
          profiles: result.newProfiles.length,
          updated: result.matches.filter((m) => m.additions > 0 || m.conflicts.some((c) => decisions.useTheirs.has(c.key))).length,
          contacts: result.newContacts,
          documents: result.newDocuments,
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  const nothing = Object.values(result.writes).every((list) => list.length === 0);

  return (
    <div className="stack" data-testid="share-preview">
      <p style={{ margin: 0 }}>
        <strong>{payload.from ? t('share.from', { name: payload.from }) : t('share.fromUnknown')}</strong>
      </p>

      {result.newProfiles.length > 0 && (
        <div className="stack share-block">
          <h3 className="contact-group-title">{t('share.newProfiles', { count: result.newProfiles.length })}</h3>
          <ul className="share-list" data-testid="share-new-profiles">
            {result.newProfiles.map((p) => (
              <li key={p.id}>{p.name}</li>
            ))}
          </ul>
          <p className="hint" style={{ margin: 0 }}>{t('share.relationshipHint')}</p>
        </div>
      )}

      {result.matches.length + separated.length > 0 && (
        <div className="stack share-block">
          <h3 className="contact-group-title">{t('share.matchesTitle')}</h3>
          {result.matches.map((m) => (
            <fieldset key={m.incoming.id} className="fieldset stack share-match" data-testid="share-match">
              <legend>{m.local.name}</legend>
              {!m.sameRecord && (
                <label className="check">
                  <input type="checkbox" checked onChange={() => toggle('separate', m.incoming.id, true)} />
                  {t('share.samePerson')}
                </label>
              )}
              <p className="hint" style={{ margin: 0 }}>
                {m.additions > 0 ? t('share.additions', { count: m.additions }) : t('share.noAdditions')}
              </p>
              {m.conflicts.map((c) => (
                <ConflictChoice key={c.key} conflict={c} theirs={decisions.useTheirs.has(c.key)} onChange={(v) => toggle('useTheirs', c.key, v)} />
              ))}
            </fieldset>
          ))}
          {separated.map((p) => (
            <label key={p.id} className="check">
              <input type="checkbox" checked={false} onChange={() => toggle('separate', p.id, false)} />
              {t('share.samePersonAgain', { name: p.name })}
            </label>
          ))}
        </div>
      )}

      <ul className="share-list">
        <li>{t('share.contacts', { added: result.newContacts, updated: result.updatedContacts })}</li>
        <li>{t('share.documents', { added: result.newDocuments, existing: result.existingDocuments })}</li>
        {result.inventory && <li data-testid="share-inventory">{t('share.inventory', result.inventory)}</li>}
        {result.waypoints && <li data-testid="share-waypoints">{t('share.waypoints', result.waypoints)}</li>}
        {result.garden && <li data-testid="share-garden">{t('share.garden', result.garden)}</li>}
      </ul>
      <p className="hint" style={{ margin: 0 }}>{t('share.neverDeletes')}</p>

      <div className="row-end">
        <button className="btn" type="button" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </button>
        <button className="btn btn-primary" type="button" onClick={() => void apply()} disabled={busy || nothing}>
          <Check size={18} /> {nothing ? t('share.nothingNew') : t('share.apply')}
        </button>
      </div>
    </div>
  );
}

/** Un dato cargado distinto: el propio (marcado por defecto) o el que llega. */
function ConflictChoice({ conflict, theirs, onChange }: { conflict: Conflict; theirs: boolean; onChange: (theirs: boolean) => void }) {
  const { t } = useTranslation();
  const show = (v: string) => {
    if (conflict.field === 'pet.species') return t(`medical.pet.speciesOptions.${v}`);
    if (conflict.field === 'pet.neutered') return t(v === 'true' ? 'medical.pet.yes' : 'medical.pet.no');
    return v;
  };
  return (
    <div className="share-conflict" role="radiogroup" aria-label={t(`share.field.${conflict.field.replace('.', '_')}`)}>
      <span className="share-conflict-field">{t(`share.field.${conflict.field.replace('.', '_')}`)}</span>
      <label className="check">
        <input type="radio" name={conflict.key} checked={!theirs} onChange={() => onChange(false)} />
        {t('share.keepMine', { value: show(conflict.mine) })}
      </label>
      <label className="check">
        <input type="radio" name={conflict.key} checked={theirs} onChange={() => onChange(true)} />
        {t('share.useTheirs', { value: show(conflict.theirs) })}
      </label>
    </div>
  );
}
