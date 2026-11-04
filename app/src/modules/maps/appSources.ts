import { useSettings } from '@/core/settings/settings';
import { setMapSourceConfig } from './sources';

// En la app, la fuente de los mapas sale de Ajustes (el service worker lee los ajustes guardados por su cuenta).
setMapSourceConfig(() => {
  const { serverUrl, mapSource } = useSettings.getState().settings;
  return { serverUrl, mode: mapSource };
});
