import { useSettings, type Country } from '@/core/settings/settings';

/**
 * El país donde estás (el que se detectó con la última ubicación, ver countryAutomation.ts) y el de Ajustes. Los números de
 * emergencia, la guía de primeros auxilios y los datos sin conexión usan el de donde estás; el de Ajustes queda de respaldo
 * (todavía no se detectó nada) y para mostrarlo aparte cuando son distintos.
 */
export function useCurrentCountry(): { here: Country; home: Country; differs: boolean; near: Country[] } {
  const home = useSettings((s) => s.settings.country);
  const detected = useSettings((s) => s.settings.detectedCountry);
  const near = useSettings((s) => s.settings.detectedNear);
  const here = detected ?? home;
  return { here, home, differs: here !== home, near };
}
