import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Pause, Play, Plus } from 'lucide-react';
import { useMedical } from '@/modules/firstAid/medicalStore';
import { beep } from './cues';
import { formatDuration, hrZones, maxHrFromAge, paceOf, parseDuration, RACES, riegel, timeAtPace } from './tools';
import { formatPace } from './stats';

/** Herramientas para entrenar, todas sin conexión: calculadora de ritmo, zonas de pulso y metrónomo de cadencia. */
export function ToolsPage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.tools.title')}</h1>
      <PaceTool />
      <ZonesTool />
      <Metronome />
    </div>
  );
}

function PaceTool() {
  const { t, i18n } = useTranslation();
  const [km, setKm] = useState('10');
  const [time, setTime] = useState('55:00');
  const [paceText, setPaceText] = useState('');
  const nf = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const distance = Number(km.replace(',', '.'));
  const seconds = parseDuration(time);
  const result = seconds !== null ? paceOf(distance, seconds) : null;
  const paceS = parseDuration(paceText);
  return (
    <section className="card stack" data-testid="tool-pace">
      <h2 className="section-title" style={{ margin: 0 }}>{t('tools.pace.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('tools.pace.intro')}</p>
      <div className="row wrap">
        <div className="field" style={{ flex: 1, minWidth: 110 }}>
          <label htmlFor="pace-km">{t('tools.pace.distance')}</label>
          <input id="pace-km" className="input" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 110 }}>
          <label htmlFor="pace-time">{t('tools.pace.time')}</label>
          <input id="pace-time" className="input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="1:05:30" />
        </div>
      </div>
      <div className="row wrap">
        {RACES.map((r) => (
          <button key={r.id} className="btn" type="button" onClick={() => setKm(String(r.km))}>
            {t(`tools.pace.race.${r.id}`)}
          </button>
        ))}
      </div>
      {result ? (
        <>
          <p className="measure-big" data-testid="pace-result">
            {formatPace(result.paceSPerKm)} /km
            <span className="hint"> · {nf.format(result.speedKmh)} km/h</span>
          </p>
          <table className="bmi-table" data-testid="pace-predict">
            <caption>{t('tools.pace.predict')}</caption>
            <tbody>
              {RACES.map((r) => (
                <tr key={r.id}>
                  <td>{t(`tools.pace.race.${r.id}`)}</td>
                  <td>{formatDuration(riegel(distance, seconds!, r.km) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint" style={{ margin: 0 }}>{t('tools.pace.predictNote')}</p>
        </>
      ) : (
        <p className="hint" style={{ margin: 0 }}>{t('tools.pace.needs')}</p>
      )}
      <div className="field">
        <label htmlFor="pace-target">{t('tools.pace.target')}</label>
        <input id="pace-target" className="input" value={paceText} onChange={(e) => setPaceText(e.target.value)} placeholder="5:30" />
      </div>
      {paceS !== null && paceS > 0 && distance > 0 && (
        <p style={{ margin: 0 }} data-testid="pace-target-result">
          {t('tools.pace.targetResult', { km: distance, time: formatDuration(timeAtPace(distance, paceS)) })}
        </p>
      )}
    </section>
  );
}

function ZonesTool() {
  const { t } = useTranslation();
  const profiles = useMedical((s) => s.profiles);
  const me = [...profiles.values()].find((p) => p.isMe);
  const ageFromProfile = me?.birthDate ? Math.floor((Date.now() - Date.parse(me.birthDate)) / (365.25 * 86_400_000)) : null;
  const [age, setAge] = useState(ageFromProfile ? String(ageFromProfile) : '');
  const [maxText, setMaxText] = useState('');
  const [restText, setRestText] = useState('');
  const estimated = maxHrFromAge(Number(age));
  const maxHr = Number(maxText) > 0 ? Number(maxText) : estimated;
  const zones = maxHr ? hrZones(maxHr, Number(restText) > 0 ? Number(restText) : null) : null;
  return (
    <section className="card stack" data-testid="tool-zones">
      <h2 className="section-title" style={{ margin: 0 }}>{t('tools.zones.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('tools.zones.intro')}</p>
      <div className="row wrap">
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label htmlFor="hr-age">{t('tools.zones.age')}</label>
          <input id="hr-age" className="input" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label htmlFor="hr-max">{t('tools.zones.max')}</label>
          <input id="hr-max" className="input" inputMode="numeric" value={maxText} onChange={(e) => setMaxText(e.target.value)} placeholder={estimated ? String(estimated) : ''} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 90 }}>
          <label htmlFor="hr-rest">{t('tools.zones.rest')}</label>
          <input id="hr-rest" className="input" inputMode="numeric" value={restText} onChange={(e) => setRestText(e.target.value)} />
        </div>
      </div>
      {zones ? (
        <table className="bmi-table" data-testid="hr-zones">
          <thead>
            <tr>
              <th scope="col">{t('tools.zones.zone')}</th>
              <th scope="col">{t('tools.zones.bpm')}</th>
              <th scope="col">{t('tools.zones.for')}</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.n}>
                <td>{z.n}</td>
                <td>{z.fromBpm}–{z.toBpm}</td>
                <td>{t(`tools.zones.z${z.n}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="hint" style={{ margin: 0 }}>{t('tools.zones.needs')}</p>
      )}
      <p className="hint" style={{ margin: 0 }}>{t('tools.zones.note')}</p>
    </section>
  );
}

/** Metrónomo de cadencia: un pitido por paso. Corre a 170–180 pasos por minuto para la mayoría de los corredores. */
function Metronome() {
  const { t } = useTranslation();
  const [bpm, setBpm] = useState(170);
  const [on, setOn] = useState(false);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  useEffect(() => {
    if (!on) return;
    let next = performance.now();
    let id: ReturnType<typeof setTimeout>;
    const loop = () => {
      beep(1000, 40);
      next += 60_000 / bpmRef.current;
      id = setTimeout(loop, Math.max(0, next - performance.now()));
    };
    loop();
    return () => clearTimeout(id);
  }, [on]);
  const clamp = (n: number) => Math.min(220, Math.max(60, n));
  return (
    <section className="card stack" data-testid="tool-metronome">
      <h2 className="section-title" style={{ margin: 0 }}>{t('tools.metronome.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('tools.metronome.intro')}</p>
      <div className="row" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <button className="icon-btn" type="button" onClick={() => setBpm((b) => clamp(b - 1))} aria-label={t('tools.metronome.slower')}>
          <Minus size={22} />
        </button>
        <p className="live-big" style={{ margin: 0 }} data-testid="metronome-bpm">{bpm}</p>
        <span className="live-unit">{t('tools.metronome.unit')}</span>
        <button className="icon-btn" type="button" onClick={() => setBpm((b) => clamp(b + 1))} aria-label={t('tools.metronome.faster')}>
          <Plus size={22} />
        </button>
      </div>
      <div className="row wrap" style={{ justifyContent: 'center' }}>
        {[160, 170, 180, 190].map((n) => (
          <button key={n} className="btn" type="button" aria-pressed={bpm === n} onClick={() => setBpm(n)}>
            {n}
          </button>
        ))}
      </div>
      <button className={`live-btn${on ? '' : ' live-btn-go'}`} type="button" onClick={() => setOn(!on)} data-testid="metronome-toggle">
        {on ? <Pause size={24} /> : <Play size={24} />} {on ? t('tools.metronome.stop') : t('tools.metronome.start')}
      </button>
    </section>
  );
}
