import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Dialog } from '@/ui/Dialog';
import { useCapabilities } from '@/core/capabilities/capabilities';
import { Anchor, Check, Banknote, Copy, Disc3, Droplet, ExternalLink, Flame, Fuel, Pill, Tent, Wrench, Zap, HeartPulse, Hospital, LifeBuoy, Map as MapIcon, MapPinned, Navigation, PawPrint, Phone, Radio, Shield, ShieldPlus, Stethoscope, type LucideIcon } from 'lucide-react';
import type { ContactKind } from '@/core/model/types';
import { dialable, mapsUrl } from './national';
import type { ParkRadio } from './data';

const KIND_ICON: Record<ContactKind, LucideIcon> = {
  police: Shield,
  fire: Flame,
  medical: HeartPulse,
  hospital: Hospital,
  civilDefense: LifeBuoy,
  fuel: Fuel,
  tyres: Disc3,
  carRepair: Wrench,
  pharmacy: Pill,
  aed: Zap,
  water: Droplet,
  shelter: Tent,
  atm: Banknote,
  nautical: Anchor,
  other: Phone,
  radio: Radio,
  doctor: Stethoscope,
  vet: PawPrint,
  insurance: ShieldPlus,
};

/** Tipos que se eligen en un contacto (las frecuencias de radio se cargan desde Radio). */
export const CONTACT_KINDS: ContactKind[] = ['police', 'fire', 'medical', 'hospital', 'civilDefense', 'pharmacy', 'aed', 'fuel', 'tyres', 'carRepair', 'water', 'shelter', 'atm', 'nautical', 'doctor', 'vet', 'insurance', 'other'];

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
 * Dirección de un lugar. Sin coordenadas, abre Google Maps directo. Con coordenadas, al tocarla se
 * abre un cuadro con las opciones: verlo acá en el mapa o en la brújula 3D de VikArg (también sin
 * conexión), Google Maps o la app de mapas que elijas.
 */
export function MapLink({ address, lat, lon }: { address: string; lat: number | null; lon: number | null }) {
  const { t } = useTranslation();
  const caps = useCapabilities((c) => c.caps);
  const [open, setOpen] = useState(false);
  const url = mapsUrl(address, lat, lon);
  if (!url) return null;
  const label = address || t('emergency.seeOnMap');
  if (lat === null || lon === null) {
    return (
      <a className="map-link" href={url} target="_blank" rel="noreferrer" title={t('emergency.openMaps')}>
        <MapPinned size={14} aria-hidden /> {label}
      </a>
    );
  }
  const coords = `${lat.toFixed(6)},${lon.toFixed(6)}`;
  const goTo = `/orientation/go?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&name=${encodeURIComponent(address.trim().slice(0, 80))}`;
  const close = () => setOpen(false);
  return (
    <>
      <button className="map-link map-link-btn" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" title={t('emergency.placeOptions')} data-testid="place-options">
        <MapPinned size={14} aria-hidden /> {label}
      </button>
      {open && (
        <Dialog title={label} onClose={close}>
          <ul className="list" data-testid="place-options-list">
            <li>
              <Link className="list-row" to={`${goTo}&view=map`} onClick={close} data-testid="open-in-app-map">
                <MapIcon size={22} aria-hidden style={{ color: 'var(--accent)' }} />
                <span className="list-main">
                  <span className="list-title">{t('emergency.viewHereMap')}</span>
                  <span className="list-sub">{t('emergency.viewHereMapTitle')}</span>
                </span>
              </Link>
            </li>
            {caps?.orientation && (
              <li>
                <Link className="list-row" to={`${goTo}&view=3d`} onClick={close} data-testid="open-in-app-3d">
                  <Navigation size={22} aria-hidden style={{ color: 'var(--accent)' }} />
                  <span className="list-main">
                    <span className="list-title">{t('emergency.viewHereCompass')}</span>
                    <span className="list-sub">{t('emergency.viewHereCompassTitle')}</span>
                  </span>
                </Link>
              </li>
            )}
            <li>
              <a className="list-row" href={url} target="_blank" rel="noreferrer" onClick={close} data-testid="open-google-maps">
                <ExternalLink size={22} aria-hidden style={{ color: 'var(--accent)' }} />
                <span className="list-main">
                  <span className="list-title">{t('emergency.openGoogle')}</span>
                  <span className="list-sub">{t('emergency.openMaps')}</span>
                </span>
              </a>
            </li>
            <li>
              <a className="list-row" href={`geo:${coords}?q=${coords}`} onClick={close} data-testid="open-other-app">
                <ExternalLink size={22} aria-hidden style={{ color: 'var(--accent)' }} />
                <span className="list-main">
                  <span className="list-title">{t('emergency.openOther')}</span>
                  <span className="list-sub">{t('emergency.openOtherTitle')}</span>
                </span>
              </a>
            </li>
          </ul>
        </Dialog>
      )}
    </>
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
