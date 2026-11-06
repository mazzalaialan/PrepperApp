import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Flag, Pencil, Plus, Radio, RadioTower, Trash2, Upload } from 'lucide-react';
import { distanceMeters } from '@/core/geo/geo';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { useSettings } from '@/core/settings/settings';
import { loadCountryData } from './country';
import { loadParks, nearestRadio, parksNear, type EmergencyData, type ParksData } from './data';
import { CopyButton, formatDistance, MapLink, ParkRadioList, PhoneActions } from './parts';
import { loadOfficialRepeaters, officialFor, withoutDuplicates, type OfficialRepeaterList } from './officialRepeaters';
import { loadRepeaters, locateRepeaters, mergeRepeaters, parseRepeaterFile, repeaterSummary, saveRepeaters, type Repeater, type RepeaterList } from './repeaters';
import { useContacts } from './store';

/**
 * Radio en una emergencia: la emisora de Radio Nacional más cercana (para
 * informarse con una radio a pilas) y las frecuencias internacionales de
 * socorro, las de montaña y, dentro de un parque nacional, las que ese parque
 * publica. Las de guardaparques, CONAF y un radioclub van marcadas "solo si
 * tu vida depende de eso". No incluye las de Gendarmería ni policía: no son
 * públicas y muchas están cifradas.
 */
const DISTRESS = [
  { id: 'marine', freq: '156,800 MHz' },
  { id: 'air', freq: '121,500 MHz' },
] as const;

/**
 * Montaña, para Argentina y Chile juntos: en la cordillera se está a pocos km
 * del otro país. Argentina: FEM (Frecuencia de Emergencias en Montaña) y las
 * dos de uso libre de la Resolución 5/2015 (Federación Andinistas Argentinos,
 * 2021). Chile no tiene una frecuencia oficial de montaña: la del Cuerpo de
 * Socorro Andino sale de guías de montaña, sin confirmación oficial.
 */
const MOUNTAIN: { id: string; country: 'AR' | 'CL'; freq: string; emergencyOnly?: boolean }[] = [
  { id: 'fem', country: 'AR', freq: '140,970 MHz' },
  { id: 'free1', country: 'AR', freq: '139,970 MHz' },
  { id: 'free2', country: 'AR', freq: '138,510 MHz' },
  { id: 'csa', country: 'CL', freq: '150,625 MHz' },
  /*
   * De servicios (guardaparques, CONAF) y de un radioclub: no son de uso
   * libre. Se incluyen porque, con la vida en peligro, se puede pedir auxilio
   * por cualquier medio; con aviso de que fuera de eso no se transmite ahí.
   */
  { id: 'rangers', country: 'AR', freq: '142,800 MHz', emergencyOnly: true },
  { id: 'conaf', country: 'CL', freq: '143,950 MHz', emergencyOnly: true },
  { id: 'carabineros', country: 'CL', freq: '146,910 MHz', emergencyOnly: true },
];

/** Hasta qué distancia del borde de un parque nacional se muestran sus datos. */
const PARK_NEAR_M = 5000;

export function RadioPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const [data, setData] = useState<EmergencyData | null>(null);
  const country = useSettings((s) => s.settings.country);
  const [packageMissing, setPackageMissing] = useState(false);
  useEffect(() => {
    setPackageMissing(false);
    loadCountryData(country).then(
      (d) => setData(d.emergency),
      () => {
        setPackageMissing(true);
        setData(null);
      },
    );
  }, [country]);
  // Argentina: "Radio Nacional"; los demás países, con su título y su aclaración.
  const radioKey = (key: 'nacionalTitle' | 'nacionalNote') => (country === 'AR' ? `radio.${key}` : `radio.${key}${country}`);
  const stations = useMemo(() => (data && place ? nearestRadio(data, place.lat, place.lon) : []), [data, place?.lat, place?.lon]);
  const fm = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const contacts = useContacts((s) => s.contacts);
  // Mis frecuencias: las que tienen lugar, de la más cercana a la más lejana; después el resto por nombre.
  const mine = useMemo(() => {
    const list = [...contacts.values()].filter((c) => c.kind === 'radio');
    const dist = (c: (typeof list)[number]) => (place && c.lat !== null && c.lon !== null ? distanceMeters(place, { lat: c.lat, lon: c.lon }) : null);
    return list
      .map((c) => ({ c, d: dist(c) }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.c.name.localeCompare(b.c.name, i18n.language));
  }, [contacts, place?.lat, place?.lon, i18n.language]);

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('modules.radio.title')}</h1>
      </div>
      {/* Un solo lugar para todo: tus frecuencias, las repetidoras y las emisoras se ordenan por cercanía a él. */}
      {picker}

      <section className="card stack" aria-labelledby="mine-freq-title">
        <h2 id="mine-freq-title" className="section-title" style={{ margin: 0 }}>{t('radio.mineTitle')}</h2>
        {mine.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>{t('radio.mineEmpty')}</p>
        ) : (
          <ul className="list" data-testid="my-frequencies">
            {mine.map(({ c, d }) => (
              <li key={c.id} className="contact-row">
                <Radio size={22} aria-hidden className="contact-icon" />
                <span className="list-main">
                  <span className="list-title">{c.name}</span>
                  <span className="list-sub">{[c.tone, d !== null && t('radio.distance', { distance: formatDistance(d, i18n.language) })].filter(Boolean).join(' · ')}</span>
                  {c.notes && <span className="list-sub">{c.notes}</span>}
                  {c.lat !== null && <MapLink address="" lat={c.lat} lon={c.lon} />}
                </span>
                <span className="contact-actions">
                  <strong className="radio-freqs">{c.frequency}</strong>
                  <CopyButton text={[c.frequency, c.tone].filter(Boolean).join(' ')} label={t('radio.copyFrequency', { name: c.name })} />
                  <Link className="icon-btn" to={`/first-aid/radio/${c.id}`} aria-label={t('emergency.editContact', { name: c.name })}>
                    <Pencil size={18} />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link className="btn btn-primary" to="/first-aid/radio/new">
          <Plus size={20} /> {t('radio.newFrequency')}
        </Link>
      </section>

      <section className="card stack" aria-labelledby="rn-title">
        <h2 id="rn-title" className="section-title" style={{ margin: 0 }}>{t(radioKey('nacionalTitle'))}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('radio.nacionalHint')}</p>
        {packageMissing ? (
          <p className="empty">{t('radio.packageMissing', { country: t(`country.${country}`) })}</p>
        ) : !place ? (
          <p className="empty">{t('emergency.needPlace')}</p>
        ) : (
          <ul className="list" data-testid="radio-stations">
            {stations.map((s, i) => (
              <li key={`${s.call}-${s.city}`} className="contact-row">
                <Radio size={22} aria-hidden className={i === 0 ? 'contact-icon contact-icon-fire' : 'contact-icon'} />
                <span className="list-main">
                  <span className="list-title">
                    {s.call} · {s.city}
                  </span>
                  <span className="list-sub">
                    {[s.province, t('radio.distance', { distance: formatDistance(s.distance, i18n.language) })].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="radio-freqs">
                  {s.am !== null && <strong>AM {s.am}</strong>}
                  {s.fm !== null && <strong>FM {fm.format(s.fm)}</strong>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="hint" style={{ margin: 0 }}>{t(radioKey('nacionalNote'))}</p>
      </section>

      <section className="card stack" aria-labelledby="distress-title">
        <h2 id="distress-title" className="section-title" style={{ margin: 0 }}>{t('radio.distressTitle')}</h2>
        <ul className="list">
          {DISTRESS.map((d) => (
            <li key={d.id} className="contact-row">
              <span className="list-main">
                <span className="list-title">{t(`radio.distress.${d.id}.name`)}</span>
                <span className="list-sub">{t(`radio.distress.${d.id}.desc`)}</span>
              </span>
              <strong className="radio-freqs">{d.freq}</strong>
            </li>
          ))}
        </ul>
        <p className="hint" style={{ margin: 0 }}>{t('radio.distressNote')}</p>
      </section>

      {country === 'AR' && <ParkSection place={place} />}

      {(country === 'AR' || country === 'CL') && (
        <section className="card stack" aria-labelledby="mountain-title" data-testid="mountain-frequencies">
          <h2 id="mountain-title" className="section-title" style={{ margin: 0 }}>{t('radio.mountainTitle')}</h2>
          <p className="hint" style={{ margin: 0 }}>{t('radio.mountainIntro')}</p>
          <ul className="list">
            {MOUNTAIN.map((m) => (
              <li key={m.id} className="contact-row">
                <span className="list-main">
                  <span className="list-title">
                    {t(`country.${m.country}`)} · {t(`radio.mountain.${m.id}.name`)}
                  </span>
                  {m.emergencyOnly && (
                    <span className="list-sub emergency-only" data-testid="emergency-only">
                      {t('radio.emergencyOnly')}
                    </span>
                  )}
                  <span className="list-sub">{t(`radio.mountain.${m.id}.desc`)}</span>
                </span>
                <span className="contact-actions">
                  <strong className="radio-freqs">{m.freq}</strong>
                  <CopyButton text={m.freq} label={t('radio.copyFrequency', { name: t(`radio.mountain.${m.id}.name`) })} />
                </span>
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: 0 }}>{t('radio.mountainNote')}</p>
          <p className="hint" style={{ margin: 0 }}>{t('radio.mountainSources')}</p>
        </section>
      )}

      <RepeatersSection place={place} />

      <section className="card stack" aria-labelledby="ham-title">
        <h2 id="ham-title" className="section-title" style={{ margin: 0 }}>{t('radio.hamTitle')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('radio.hamText')}</p>
        <p className="hint" style={{ margin: 0 }} data-testid="ham-license">{t(`radio.hamLicense.${country}`)}</p>
      </section>

      <p className="hint">{t('radio.securityNote')}</p>
    </div>
  );
}

/** El parque nacional donde se está (o a menos de 5 km): intendencia, teléfonos de emergencia y frecuencias que publica. */
function ParkSection({ place }: { place: { lat: number; lon: number } | null }) {
  const { t, i18n } = useTranslation();
  const [parks, setParks] = useState<ParksData | null>(null);
  useEffect(() => {
    void loadParks().then(setParks);
  }, []);
  const near = useMemo(() => (parks && place ? parksNear(parks, place.lat, place.lon, PARK_NEAR_M) : []), [parks, place?.lat, place?.lon]);
  if (near.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="park-title" data-testid="park-section">
      <h2 id="park-title" className="section-title" style={{ margin: 0 }}>{t('radio.park.title')}</h2>
      {near.map(({ park, distance }) => (
        <div key={park.name} className="stack park-block">
          <p style={{ margin: 0 }}>
            <strong>{park.name}</strong>
            {' · '}
            {distance === 0 ? t('radio.park.inside') : t('radio.park.near', { distance: formatDistance(distance, i18n.language) })}
          </p>
          {park.radio?.length ? (
            <ParkRadioList radio={park.radio} />
          ) : (
            <p className="hint" style={{ margin: 0 }}>{t('radio.park.noRadio')}</p>
          )}
          {park.emergency?.map((e) => (
            <span key={e.phone} className="list-sub park-phone">
              {e.label}: <PhoneActions phone={e.phone} />
            </span>
          ))}
          {park.phone && (
            <span className="list-sub park-phone">
              {t('radio.park.office')}: <PhoneActions phone={park.phone} />
            </span>
          )}
          {park.phones && park.phones.replace(/\D/g, '') !== park.phone.replace(/\D/g, '') && <span className="list-sub">{park.phones}</span>}
          {park.address && <MapLink address={park.address} lat={park.lat} lon={park.lon} />}
        </div>
      ))}
      <p className="hint" style={{ margin: 0 }}>{t('radio.park.note')}</p>
      <p className="hint" style={{ margin: 0 }}>{t('radio.park.sources')}</p>
    </section>
  );
}

/** Siempre en km (lo que se usa para saber si llega la señal): "0,8 km", "12 km". */
function formatKm(m: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: m < 10_000 ? 1 : 0 }).format(m / 1000)} km`;
}

/** Cuántas repetidoras cercanas se muestran (con un archivo de todo el país pueden ser cientos). */
const REPEATERS_SHOWN = 25;

function RepeatersSection({ place }: { place: { lat: number; lon: number } | null }) {
  const { t, i18n } = useTranslation();
  const [list, setList] = useState<RepeaterList | null>(null);
  const [official, setOfficial] = useState<OfficialRepeaterList[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const country = useSettings((s) => s.settings.country);

  // Listados oficiales (Chile): guardados en el dispositivo; sin conexión y sin bajar, no hay.
  useEffect(() => {
    loadOfficialRepeaters(country).then(setOfficial, () => setOfficial([]));
  }, [country]);

  useEffect(() => {
    void (async () => {
      const saved = await loadRepeaters();
      setList(saved);
      // Listas importadas antes de que existiera el nomenclátor: se ubican una vez.
      const located = saved && (await locateRepeaters(saved.items));
      if (saved && located) {
        const next = { ...saved, items: located };
        await saveRepeaters(next);
        setList(next);
      }
    })();
  }, []);

  async function handleFile(f: File) {
    const parsed = parseRepeaterFile(f.name, await f.text());
    if (parsed.length === 0) {
      setMessage(t('radio.repeaters.importNone'));
      return;
    }
    const incoming = (await locateRepeaters(parsed)) ?? parsed;
    const next: RepeaterList = { importedAt: new Date().toISOString(), source: f.name, items: mergeRepeaters(list?.items ?? [], incoming) };
    await saveRepeaters(next);
    setList(next);
    const missing = incoming.filter((r) => r.lat === null).length;
    const approx = incoming.filter((r) => r.approx).length;
    setMessage(
      [
        missing === 0
          ? t('radio.repeaters.imported', { count: incoming.length })
          : t('radio.repeaters.importedNoPlace', { count: incoming.length, missing }),
        approx > 0 ? t('radio.repeaters.importedApprox', { count: approx }) : '',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  async function clearAll() {
    if (!window.confirm(t('radio.repeaters.confirmClear'))) return;
    await saveRepeaters(null);
    setList(null);
    setMessage(null);
  }

  // Las que tienen ubicación, por cercanía; las que no, al final por frecuencia.
  const officialShown = useMemo(() => officialFor(official, country, place), [official, country, place?.lat, place?.lon]);
  const sorted = useMemo(() => {
    const items = withoutDuplicates(list?.items ?? [], officialShown);
    return items
      .map((r) => ({ r, d: place && r.lat !== null && r.lon !== null ? distanceMeters(place, { lat: r.lat, lon: r.lon }) : null }))
      .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity) || a.r.output - b.r.output);
  }, [list, officialShown, place?.lat, place?.lon]);
  const imported = list?.items.length ?? 0;
  const mhzText = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 4 });
  const reportText = (r: Repeater) =>
    t('radio.repeaters.reportText', {
      repeater: [r.call, `${mhzText.format(r.output)} MHz`, r.tone ? `${r.tone} Hz` : '', r.location].filter(Boolean).join(' · '),
      source: r.official
        ? t(`radio.repeaters.reportSource${r.official.country}`, { date: dateText(r.official.listedAt) })
        : t('radio.repeaters.reportSourceFile', { file: list?.source ?? '' }),
    });
  const dateText = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language);

  return (
    <section className="card stack" aria-labelledby="rpt-title">
      <h2 id="rpt-title" className="section-title" style={{ margin: 0 }}>{t('radio.repeaters.title')}</h2>
      {sorted.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>{t('radio.repeaters.empty')}</p>
      ) : (
        <>
          <p className="hint" style={{ margin: 0 }}>{t('radio.repeaters.count', { count: sorted.length, shown: Math.min(sorted.length, REPEATERS_SHOWN) })}</p>
          {official
            .filter((l) => officialShown.some((r) => r.official?.country === l.country))
            .map((l) => (
              <p key={l.country} className="hint" style={{ margin: 0 }} data-testid="repeaters-official">
                {t(`radio.repeaters.official${l.country}`, { count: officialShown.filter((r) => r.official?.country === l.country).length, date: dateText(l.listedAt) })}
              </p>
            ))}
          <ul className="list" data-testid="repeaters">
            {sorted.slice(0, REPEATERS_SHOWN).map(({ r, d }) => {
              const summary = repeaterSummary(r, i18n.language);
              const expired = !!r.official && r.official.expires < new Date().toISOString().slice(0, 10);
              const off = /off|fuera/i.test(r.status) || expired;
              return (
                <li key={`${r.call}-${r.output}`} className="contact-row" data-off={off}>
                  <RadioTower size={22} aria-hidden className="contact-icon" />
                  <span className="list-main">
                    <span className="list-title">
                      {r.call}
                      {r.location && ` · ${r.location}`}
                    </span>
                    <RepeaterDetails r={r} off={off} />
                    {r.lat !== null && <MapLink address="" lat={r.lat} lon={r.lon} />}
                    <Link className="btn-link rpt-report" to={`/about?${new URLSearchParams({ tipo: 'bug', texto: reportText(r) }).toString()}`}>
                      <Flag size={14} aria-hidden /> {t('radio.repeaters.report')}
                    </Link>
                  </span>
                  <span className="contact-actions">
                    <span className="radio-freqs">
                      <span className="rpt-distance" data-testid="rpt-distance">
                        {d !== null ? `${r.approx ? '≈ ' : ''}${formatKm(d, i18n.language)}` : r.lat === null ? t('radio.repeaters.noPlace') : t('radio.repeaters.choosePlace')}
                      </span>
                    </span>
                    <CopyButton text={summary} label={t('radio.repeaters.copy', { call: r.call })} />
                  </span>
                </li>
              );
            })}
          </ul>
          <details className="rpt-help">
            <summary>{t('radio.repeaters.help.title')}</summary>
            <dl>
              {(['output', 'input', 'offset', 'tone', 'mode'] as const).map((k) => (
                <Fragment key={k}>
                  <dt>{t(`radio.repeaters.help.${k}.term`)}</dt>
                  <dd>{t(`radio.repeaters.help.${k}.text`)}</dd>
                </Fragment>
              ))}
            </dl>
          </details>
        </>
      )}
      {message && (
        <p className="hint" role="status" data-testid="repeaters-message" style={{ margin: 0 }}>
          {message}
        </p>
      )}
      <div className="row-end wrap">
        {imported > 0 && (
          <button className="btn btn-danger-outline" type="button" onClick={() => void clearAll()}>
            <Trash2 size={18} /> {t('radio.repeaters.clear')}
          </button>
        )}
        <button className="btn btn-primary" type="button" onClick={() => file.current?.click()}>
          <Upload size={18} /> {t('radio.repeaters.import')}
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept=".csv,.xls,.gpx,.kml,.xml,text/csv,application/vnd.ms-excel,application/gpx+xml,application/vnd.google-earth.kml+xml"
        hidden
        data-testid="repeaters-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void handleFile(f);
        }}
      />
      <p className="hint" style={{ margin: 0 }}>{t('radio.repeaters.howTo')}</p>
      <p className="hint" style={{ margin: 0 }}>{t('radio.repeaters.attribution')}</p>
    </section>
  );
}
/** Cada dato con su nombre: qué frecuencia escuchás, en cuál transmitís y qué subtono abre la repetidora. */
function RepeaterDetails({ r, off }: { r: Repeater; off: boolean }) {
  const { t, i18n } = useTranslation();
  const mhz = (n: number) => new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 3, maximumFractionDigits: 4 }).format(n);
  const offsetText = (n: number) =>
    `${n > 0 ? '+' : '−'}${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(Math.abs(n))} MHz`;
  const toneText = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const digital = /dmr|d-?star|c4fm|fusion|p25|nxdn|m17/i.test(r.mode);
  return (
    <span className="rpt-details" data-testid="rpt-details">
      <span>
        {t('radio.repeaters.listen')} <strong>{mhz(r.output)} MHz</strong>
      </span>
      <span>
        {r.offset
          ? t('radio.repeaters.transmit', { freq: `${mhz(r.output + r.offset)} MHz`, offset: offsetText(r.offset) })
          : t('radio.repeaters.simplex')}
      </span>
      <span>
        {r.tone
          ? t('radio.repeaters.tone', { tone: toneText.format(r.tone) })
          : digital
            ? t('radio.repeaters.toneDigital')
            : t('radio.repeaters.toneNone')}
      </span>
      {(r.mode || off) && (
        <span className="list-sub">
          {[r.mode && t('radio.repeaters.mode', { mode: r.mode }), off && !r.official && t('radio.repeaters.offAir')].filter(Boolean).join(' · ')}
        </span>
      )}
      {r.approx && <span className="list-sub">{t('radio.repeaters.approx', { place: r.approx })}</span>}
      {r.official && (
        <span className="list-sub" data-testid="rpt-official">
          {[
            r.official.club,
            t(off ? 'radio.repeaters.licenseExpired' : 'radio.repeaters.license', {
              date: new Date(`${r.official.expires}T12:00:00`).toLocaleDateString(i18n.language),
            }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </span>
  );
}