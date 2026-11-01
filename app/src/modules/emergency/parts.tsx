import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Flame, HeartPulse, Hospital, LifeBuoy, MapPinned, PawPrint, Phone, Radio, Shield, ShieldPlus, Stethoscope, type LucideIcon } from 'lucide-react';
import type { ContactKind } from '@/core/model/types';
import { dialable, mapsUrl } from './national';

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

/** Dirección: abre Google Maps. */
export function MapLink({ address, lat, lon }: { address: string; lat: number | null; lon: number | null }) {
  const { t } = useTranslation();
  const url = mapsUrl(address, lat, lon);
  if (!url) return null;
  return (
    <a className="map-link" href={url} target="_blank" rel="noreferrer" title={t('emergency.openMaps')}>
      <MapPinned size={14} aria-hidden /> {address || t('emergency.seeOnMap')}
    </a>
  );
}

export function formatDistance(m: number, locale: string): string {
  return m < 1000
    ? `${Math.round(m / 10) * 10} m`
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: m < 10_000 ? 1 : 0 }).format(m / 1000)} km`;
}
