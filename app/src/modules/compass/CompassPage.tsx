import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCapabilities, useCapability } from '@/core/capabilities/capabilities';
import { useWakeLock } from '@/core/power/useWakeLock';
import { useGeolocation } from '@/core/geo/useGeolocation';
import { useHeading } from '@/core/sensors/useHeading';
import { useSettings, type NorthReference } from '@/core/settings/settings';
import { useFormatBearing } from '@/modules/waypoints/components';
import { Segmented } from '@/ui/Segmented';
import { CompassRose } from './CompassRose';

export function CompassPage() {
  const { t, i18n } = useTranslation();
  const hasGps = useCapability('geolocation');
  const { fix } = useGeolocation(hasGps);
  const caps = useCapabilities((s) => s.caps);
  const heading = useHeading(fix);
  // Con la brújula a la vista la pantalla no se apaga sola.
  useWakeLock(!!heading);
  const formatBearing = useFormatBearing();
  const reference = useSettings((s) => s.settings.northReference);
  const update = useSettings((s) => s.update);

  return (
    <div className="stack compass-page">
      <h1 className="page-title">{t('modules.compass.title')}</h1>

      {heading ? (
        <>
          <p className="compass-readout" data-testid="compass-heading" aria-live="off">
            {formatBearing(heading.heading)}
          </p>
          <CompassRose heading={heading.heading} />
          <p className="hint" style={{ textAlign: 'center' }}>
            {heading.mode === 'upright' ? t('compass.upright') : t('compass.flat')}
          </p>
        </>
      ) : caps && !caps.orientation ? (
        // Una PC no tiene el sensor: no se espera para siempre.
        <p className="empty" data-testid="compass-none">{t('compass.noSensor')}</p>
      ) : (
        <p className="empty">{t('compass.waiting')}</p>
      )}

      <section className="card stack">
        <Segmented<NorthReference>
          label={t('compass.reference')}
          value={reference}
          options={[
            { value: 'true', label: t('compass.trueNorth') },
            { value: 'magnetic', label: t('compass.magneticNorth') },
          ]}
          onChange={(v) => void update({ northReference: v })}
        />
        <p className="hint" data-testid="declination">
          {heading?.declination != null
            ? t('compass.declination', {
                value: new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(heading.declination)),
                dir: heading.declination < 0 ? t('geo.cardinal.W') : t('geo.cardinal.E'),
              })
            : t('compass.noDeclination')}
        </p>
        <p className="hint">
          <Link to="/orientation/declination">{t('compass.moreDeclination')}</Link>
        </p>
        <p className="hint">{t('compass.calibrate')}</p>
      </section>
    </div>
  );
}
