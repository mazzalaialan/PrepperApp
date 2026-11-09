import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMedical } from '@/modules/firstAid/medicalStore';
import { formatDuration, hrZones, maxHrFromAge, paceOf, parseDuration, RACES, riegel, timeAtPace } from './tools';
import { formatPace } from './stats';

/** Herramientas para entrenar, todas sin conexión: calculadora de ritmo y zonas de pulso. */
export function ToolsPage() {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1 className="page-title">{t('modules.tools.title')}</h1>
      <PaceTool />
      <ZonesTool />
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
