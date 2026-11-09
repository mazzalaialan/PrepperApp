import { gunzipSync } from 'fflate';
import { newEntity } from '@/core/model/entity';
import type { Track } from '@/core/model/types';
import { parseActivityFile } from '@/modules/training/interchange';
import { KmlError, kmlTextFromBytes, parseKml } from '@/modules/waypoints/kml';
import { GpxError, simplify, trackStats } from './gpx';
import { trackFromGpx } from './store';

/**
 * Importar un recorrido de un archivo: GPX (Wikiloc y casi todas las apps),
 * KML y KMZ (Google Earth y Maps) o TCX (Garmin), también comprimido (.gz). Es
 * la única puerta de entrada de recorridos: para planificar con piernas se
 * convierte el track en ruta desde su pantalla. Los puntos con nombre de un KML
 * quedan dentro del track, no en la lista de lugares.
 */
export function trackFromBytes(bytes: Uint8Array, fileName: string): Track {
  let data = bytes;
  let name = fileName;
  if (/\.gz$/i.test(name) || (data[0] === 0x1f && data[1] === 0x8b)) {
    data = gunzipSync(data);
    name = name.replace(/\.gz$/i, '');
  }
  const lower = name.toLowerCase();
  try {
    if (lower.endsWith('.kml') || lower.endsWith('.kmz') || (data[0] === 0x50 && data[1] === 0x4b)) {
      const kml = parseKml(kmlTextFromBytes(data), name);
      return fromSegments(kml.name, kml.segments, kml.points.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, ele: p.ele, desc: p.desc })), name, 'KML');
    }
    const text = new TextDecoder().decode(data);
    if (/<TrainingCenterDatabase\b/i.test(text)) {
      const act = parseActivityFile(text, name);
      return fromSegments(act.name, act.segments, [], name, 'TCX');
    }
    if (/<kml\b/i.test(text)) {
      const kml = parseKml(text, name);
      return fromSegments(kml.name, kml.segments, kml.points.map((p) => ({ name: p.name, lat: p.lat, lon: p.lon, ele: p.ele, desc: p.desc })), name, 'KML');
    }
    return trackFromGpx(text, name);
  } catch (err) {
    if (err instanceof KmlError) throw new GpxError(err.code === 'empty' ? 'empty' : 'not-gpx');
    throw err;
  }
}

function fromSegments(title: string, segments: Track['segments'], waypoints: Track['waypoints'], fileName: string, source: string): Track {
  const stats = trackStats(segments);
  return newEntity<Track>({
    name: title,
    desc: '',
    source: source === 'KML' || source === 'TCX' ? fileName : source,
    link: null,
    segments: segments.map((s) => simplify(s)),
    waypoints,
    ...stats,
    notes: '',
  });
}
