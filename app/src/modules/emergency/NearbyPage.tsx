import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Save } from 'lucide-react';
import type { ContactKind } from '@/core/model/types';
import { usePlacePicker } from '@/modules/waypoints/PlacePicker';
import { emptyContact } from './ContactEditPage';
import { useSettings } from '@/core/settings/settings';
import { loadCountryData } from './country';
import { loadParks, mergeNearby, nearestPerKind, officialNearby, withParks, type EmergencyData, type NearbyPlace, type ParksData } from './data';

const EMPTY_DATA: EmergencyData = { sources: { fire: '', police: '', health: '', radio: '' }, fire: [], police: [], health: [], radio: [] };
import { fetchOsmNearby } from './osm';
import { formatDistance, KindIcon, MapLink, ParkRadioList, PhoneActions } from './parts';
import { useContacts } from './store';

/** 0 = lo más cercano de cada tipo, sin límite (zonas agrestes, donde no hay nada cerca). */
const RADII = [5, 15, 30, 50, 100, 200, 0];
/** Hasta dónde se le pregunta a OpenStreetMap (con más, la consulta se vuelve muy pesada). */
const OSM_MAX_KM = 200;
/** Sin límite: cuántos de cada tipo. */
const NEAREST_PER_KIND = 3;
type Filter = 'all' | 'police' | 'fire' | 'health' | 'civilDefense';
const FILTERS: Filter[] = ['all', 'police', 'fire', 'health', 'civilDefense'];
const matches = (f: Filter, k: ContactKind) => f === 'all' || f === k || (f === 'health' && (k === 'hospital' || k === 'medical'));
/** Más que esto no se lee en el celular: con un filtro se ven los de cada tipo. */
const MAX_SHOWN = 60;

export function NearbyPage() {
  const { t, i18n } = useTranslation();
  const { place, picker } = usePlacePicker();
  const contacts = useContacts((s) => s.contacts);
  const save = useContacts((s) => s.save);
  const [data, setData] = useState<EmergencyData | null>(null);
  const [radiusKm, setRadiusKm] = useState(15);
  const [filter, setFilter] = useState<Filter>('all');
  const [osm, setOsm] = useState<{ key: string; items: NearbyPlace[] } | null>(null);
  const [osmState, setOsmState] = useState<'idle' | 'loading' | 'error' | 'offline'>('idle');
  const [attempt, setAttempt] = useState(0);

  const country = useSettings((s) => s.settings.country);
  const [packageMissing, setPackageMissing] = useState(false);
  const [parks, setParks] = useState<ParksData | null>(null);
  // Parques nacionales (intendencias y frecuencias): solo Argentina.
  useEffect(() => {
    if (country !== 'AR') return setParks(null);
    void loadParks().then(setParks);
  }, [country]);
  useEffect(() => {
    setPackageMissing(false);
    loadCountryData(country).then(
      (d) => setData(d.emergency),
      () => {
        // Sin conexión y sin el paquete del país: solo lo que encuentre OpenStreetMap cuando haya conexión.
        setPackageMissing(true);
        setData(EMPTY_DATA);
      },
    );
  }, [country]);

  const searchKey = place ? `${place.lat.toFixed(3)},${place.lon.toFixed(3)},${radiusKm}` : null;

  // OpenStreetMap suma lo que no está en los datos oficiales (y teléfonos), solo con conexión.
  useEffect(() => {
    if (!place || !searchKey) return;
    if (!navigator.onLine) {
      setOsmState('offline');
      return;
    }
    let cancelled = false;
    setOsmState('loading');
    fetchOsmNearby(place.lat, place.lon, Math.min(radiusKm || OSM_MAX_KM, OSM_MAX_KM) * 1000).then(
      (items) => {
        if (cancelled) return;
        setOsm({ key: searchKey, items });
        setOsmState('idle');
      },
      () => !cancelled && setOsmState('error'),
    );
    return () => {
      cancelled = true;
    };
    // `searchKey` resume el lugar redondeado y el radio: el GPS se mueve en metros.
  }, [searchKey, attempt]);

  // Todo lo conocido, sin límite de distancia (los datos oficiales vienen en la app).
  const everything = useMemo(() => {
    if (!data || !place) return [];
    const merged = mergeNearby(officialNearby(data, place.lat, place.lon, Infinity), osm?.key === searchKey ? osm.items : []);
    return parks ? withParks(merged, parks, place.lat, place.lon).sort((a, b) => a.distance - b.distance) : merged;
  }, [data, parks, place?.lat, place?.lon, osm, searchKey]);
  const results = radiusKm === 0 ? nearestPerKind(everything, NEAREST_PER_KIND) : everything.filter((p) => p.distance <= radiusKm * 1000);
  const shown = results.filter((r) => matches(filter, r.kind));
  // Nada en el rango: igual se muestra lo más cercano de cada tipo, aunque esté lejos.
  const fallback = radiusKm !== 0 && shown.length === 0 ? nearestPerKind(everything.filter((r) => matches(filter, r.kind)), 1) : [];

  const savedKeys = useMemo(() => new Set([...contacts.values()].map((c) => `${c.name}|${c.lat?.toFixed(4)}|${c.lon?.toFixed(4)}`)), [contacts]);
  const isSaved = (p: NearbyPlace) => savedKeys.has(`${p.name}|${p.lat.toFixed(4)}|${p.lon.toFixed(4)}`);

  async function handleSave(p: NearbyPlace) {
    await save({
      ...emptyContact(p.kind),
      name: p.name || t(`emergency.kind.${p.kind}`),
      phone: p.phone,
      address: p.address,
      lat: p.lat,
      lon: p.lon,
      notes: [
        p.detail && p.source === 'official' ? p.detail : '',
        p.note ?? '',
        ...(p.extraPhones ?? []).map((e) => `${e.label}: ${e.phone}`),
        ...(p.radio ?? []).map((r) => `${t('radio.vhf')} ${r.freq} (${r.label})`),
      ]
        .filter(Boolean)
        .join('\n'),
      source: t(`emergency.source.${p.source}`),
    });
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('emergency.nearbyTitle')}</h1>
      </div>
      {picker}

      <div className="field">
        <label htmlFor="radius">{t('emergency.radius')}</label>
        <select id="radius" className="select" value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
          {RADII.map((r) => (
            <option key={r} value={r}>
              {r === 0 ? t('emergency.nearestAny') : t('maps.km', { count: r })}
            </option>
          ))}
        </select>
      </div>
      <div className="chips" role="group" aria-label={t('emergency.filter')}>
        {FILTERS.map((f) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`emergency.filters.${f}`)}
          </button>
        ))}
      </div>

      <p className="hint" role="status" data-testid="nearby-status" style={{ margin: 0 }}>
        {osmState === 'loading'
          ? t('emergency.osmLoading')
          : osmState === 'offline'
            ? packageMissing
              ? t('emergency.packageMissing', { country: t(`country.${country}`) })
              : country === 'AR'
                ? t('emergency.osmOffline')
                : t('emergency.osmOfflinePackage', { country: t(`country.${country}`) })
            : osmState === 'error'
              ? t('emergency.osmError')
              : place && data && t('emergency.found', { count: shown.length })}
      </p>
      {osmState === 'error' && (
        <button className="btn" type="button" onClick={() => setAttempt((a) => a + 1)}>
          {t('emergency.retry')}
        </button>
      )}

      {!place ? (
        <p className="empty">{t('emergency.needPlace')}</p>
      ) : shown.length === 0 && fallback.length === 0 ? (
        <p className="empty">{t('emergency.nothingNear')}</p>
      ) : (
        <>
        {fallback.length > 0 && (
          <p className="hint" role="status" data-testid="nearby-fallback" style={{ margin: 0 }}>
            {t('emergency.nothingWithin', { km: radiusKm })}
          </p>
        )}
        <ul className="list contact-list" data-testid="nearby-list">
          {(fallback.length ? fallback : shown).slice(0, MAX_SHOWN).map((p) => (
            <li key={p.key} className="contact-row">
              <KindIcon kind={p.kind} />
              <span className="list-main">
                <span className="list-title">{p.name || t(`emergency.kind.${p.kind}`)}</span>
                <span className="list-sub">
                  {formatDistance(p.distance, i18n.language)} · {p.detail && p.source === 'official' ? p.detail : t(`emergency.kind.${p.kind}`)} ·{' '}
                  <span className={`source-badge source-${p.source}`}>{t(`emergency.source.${p.source}`)}</span>
                </span>
                {p.note && <span className="list-sub">{p.note}</span>}
                <MapLink address={p.address} lat={p.lat} lon={p.lon} />
                {p.extraPhones?.map((e) => (
                  <span key={e.phone} className="list-sub park-phone">
                    {e.label}: <PhoneActions phone={e.phone} />
                  </span>
                ))}
                {p.radio && <ParkRadioList radio={p.radio} />}
              </span>
              <span className="contact-actions">
                <PhoneActions phone={p.phone} />
                {isSaved(p) ? (
                  <span className="icon-btn" aria-label={t('emergency.saved')} title={t('emergency.saved')}>
                    <Check size={18} />
                  </span>
                ) : (
                  <button className="icon-btn" type="button" onClick={() => void handleSave(p)} aria-label={t('emergency.save', { name: p.name })} title={t('emergency.save', { name: p.name })}>
                    <Save size={18} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        </>
      )}
      <p className="hint">{t('emergency.nearbySources')}</p>
    </div>
  );
}
