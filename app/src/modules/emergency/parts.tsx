import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, Flame, HeartPulse, Hospital, LifeBuoy, MapPinned, Navigation, PawPrint, Phone, Radio, Shield, ShieldPlus, Stethoscope, type LucideIcon } from 'lucide-react';
import type { ContactKind } from '@/core/model/types';
import { dialable, mapsUrl } from './national';
import type { ParkRadio } from './data';

const KIND_ICON: Record<ContactKind, LucideIcon> = {
  police: Shield,
  fire: Flame,
  medical: HeartPulse,
  hospital: Hospital,
  civilDefense: LifeBuoy,
  other: Phone,
  radio: Radio,
  doctor: Stethoscope,
  vet: PawPrint,
  insurance: ShieldPlus,
};

/** Tipos que se eligen en un contacto (las frecuencias de radio se cargan desde Radio). */
export const CONTACT_KINDS: ContactKind[] = ['police', 'fire', 'medical', 'hospital', 'civilDefense', 'doctor', 'vet', 'insurance', 'other'];

export function KindIcon({ kind, size = 22 }: { kind: ContactKind; size?: number }) {
  const Icon = KIND_ICON[kind];
  return <Icon size={size} aria-hidden className={`contact-icon contact-icon-${kind}`} />;
}

/** Copia al portapapeles y avisa un momento con un tilde. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      window.prompt(label, text);
    }
  }
  return (
    <button className="icon-btn" type="button" onClick={() => void copy()} aria-label={done ? t('common.copied') : label} title={label}>
      {done ? <Check size={18} /> : <Copy size={18} />}
    </button>
  );
}

/** Teléfono: tocar llama; al lado, copiar. */
export function PhoneActions({ phone, testId }: { phone: string; testId?: string }) {
  const { t } = useTranslation();
  const number = dialable(phone);
  if (!number) return null;
  return (
    <span className="phone-actions">
      <a className="btn btn-call" href={`tel:${number}`} data-testid={testId}>
        <Phone size={16} aria-hidden /> {phone}
      </a>
      <CopyButton text={phone} label={t('emergency.copyPhone', { phone })} />
    </span>
  );
}

/**
 * Dirección: abre Google Maps. Con coordenadas, además se puede ir hasta ahí con
 * VikArg (brújula o mapa, también sin conexión) o abrirlo en la app de mapas que elijas.
 */
export function MapLink({ address, lat, lon }: { address: string; lat: number | null; lon: number | null }) {
  const { t } = useTranslation();
  const url = mapsUrl(address, lat, lon);
  if (!url) return null;
  const hasPoint = lat !== null && lon !== null;
  const name = encodeURIComponent(address.trim().slice(0, 80));
  return (
    <span className="map-links">
      <a className="map-link" href={url} target="_blank" rel="noreferrer" title={t('emergency.openMaps')}>
        <MapPinned size={14} aria-hidden /> {address || t('emergency.seeOnMap')}
      </a>
      {hasPoint && (
        <>
          <Link className="map-link" to={`/orientation/go?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&name=${name}`} title={t('emergency.openHereTitle')} data-testid="open-in-app">
            <Navigation size={14} aria-hidden /> {t('emergency.openHere')}
          </Link>
          <a className="map-link" href={`geo:${lat.toFixed(6)},${lon.toFixed(6)}?q=${lat.toFixed(6)},${lon.toFixed(6)}`} title={t('emergency.openOtherTitle')}>
            <ExternalLink size={14} aria-hidden /> {t('emergency.openOther')}
          </a>
        </>
      )}
    </span>
  );
}

export function formatDistance(m: number, locale: string): string {
  return m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: m < 10_000 ? 1 : 0 }).format(m / 1000)} km`;
}

/** Frecuencias VHF que publica un parque, con su fuente y el aviso de uso. */
export function ParkRadioList({ radio }: { radio: ParkRadio[] }) {
  const { t } = useTranslation();
  return (
    <span className="park-radio" data-testid="park-radio">
      {radio.map((r) => (
        <span key={r.freq} className="list-sub">
          <Radio size={14} aria-hidden /> <strong>{t('radio.vhf')} {r.freq}</strong> · {r.label}
          <CopyButton text={r.freq} label={t('radio.copyFrequency', { name: r.label })} />
          <br />
          <small>{t('radio.park.source', { source: r.source })}</small>
        </span>
      ))}
    </span>
  );
}
