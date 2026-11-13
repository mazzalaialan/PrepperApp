// Texto de las voces del Entrenamiento: puro, sin navegador, para poder probarlo.

type T = (key: string, o?: Record<string, unknown>) => string;

/**
 * Una duración dicha con palabras para la voz: «1 hora 3 minutos 20 segundos». Nunca «10:40»: el sintetizador lo lee como una hora
 * («diez cuarenta de la mañana»). Los ceros se omiten.
 */
export function spokenDuration(totalS: number, t: T): string {
  const s = Math.max(0, Math.round(totalS));
  const parts = [
    [Math.floor(s / 3600), 'hour'],
    [Math.floor((s % 3600) / 60), 'minute'],
    [s % 60, 'second'],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, unit]) => t(`training.live.spoken.${unit}`, { count: n }));
  return said.length ? said.join(' ') : t('training.live.spoken.second', { count: 0 });
}

/** Lo que lee la voz al cerrar un kilómetro: «Kilómetro 3. Tiempo 18 minutos 5 segundos. Ritmo 5 minutos 58 segundos por kilómetro.» */
export function kmAnnouncement(km: number, totalS: number, lastSplitS: number | undefined, t: T): string {
  return lastSplitS
    ? t('training.live.voiceKm', { km, time: spokenDuration(totalS, t), pace: spokenDuration(lastSplitS, t) })
    : t('training.live.voiceKmShort', { km, time: spokenDuration(totalS, t) });
}
