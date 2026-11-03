import { useMemo, useState, type ReactNode } from 'react';
import type { Track } from '@/core/model/types';
import { useSettings } from '@/core/settings/settings';
import { CameraButtons } from '@/modules/maps/CameraButtons';
import { MapView, type MapTrack, type ViewState } from '@/modules/maps/MapView';
import { FullscreenStage } from '@/ui/FullscreenStage';
import type { FollowLine } from './follow';
import { RecordButton } from './Recording';

const NONE: never[] = [];

/**
 * El track sobre el mapa offline, en 2D o 3D, con la vista siguiéndote o libre.
 * Va en su propio archivo: MapLibre se carga recién al elegir el mapa.
 */
export function FollowMap({
  track,
  line,
  fix,
  heading,
  doneM,
  nearest,
  recorded,
  overlay,
}: {
  track: Track;
  line: FollowLine;
  fix: { lat: number; lon: number; accuracy: number } | null;
  heading: number | null;
  doneM: number;
  nearest: { lat: number; lon: number } | null;
  /** Lo que se va grabando, en [lon, lat]. */
  recorded: [number, number][][] | null;
  /** Estado y datos del seguimiento, encima del mapa en pantalla completa. */
  overlay: ReactNode;
}) {
  const layers = useSettings((s) => s.settings.mapLayers);
  const update = useSettings((s) => s.update);
  const [follow, setFollow] = useState(true);
  const [initial] = useState<ViewState>(() => (fix ? { lat: fix.lat, lon: fix.lon, zoom: 15 } : { lat: line.lat[0]!, lon: line.lon[0]!, zoom: 14 }));
  const tracks = useMemo<MapTrack[]>(
    () => [{ id: track.id, name: track.name, lines: track.segments.map((s) => s.map(([lat, lon]) => [lon, lat] as [number, number])), points: track.waypoints }],
    [track],
  );
  const here = useMemo(() => (fix ? { lat: fix.lat, lon: fix.lon, accuracy: fix.accuracy } : null), [fix]);
  // Lo recorrido: los vértices hasta donde vas, y el punto exacto sobre el track.
  const done = useMemo(() => {
    const out: [number, number][] = [];
    for (let i = 0; i < line.lat.length && line.along[i]! <= doneM; i++) out.push([line.lon[i]!, line.lat[i]!]);
    if (nearest) out.push([nearest.lon, nearest.lat]);
    return out;
  }, [line, doneM, nearest]);
  return (
    <FullscreenStage className="maps-stage follow-stage" overlay={overlay}>
      <MapView
        initial={initial}
        layers={layers}
        showMine={false}
        waypoints={NONE}
        routes={NONE}
        tracks={tracks}
        showTracks
        here={here}
        zones={NONE}
        preview={null}
        outline={null}
        flyTo={null}
        follow={follow && !!fix}
        heading={heading}
        done={done}
        recorded={recorded}
        onFollowBreak={() => setFollow(false)}
        onMove={() => undefined}
        onWaypoint={() => undefined}
      />
      <CameraButtons
        threeD={layers.terrain3d}
        onThreeD={(on) => void update({ mapLayers: { ...layers, terrain3d: on } })}
        follow={follow && !!fix}
        onFollow={setFollow}
        canFollow={!!fix}
      >
        <RecordButton />
      </CameraButtons>
    </FullscreenStage>
  );
}
