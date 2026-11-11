import { bearingDeg, distanceMeters, type LatLon } from '@/core/geo/geo';
import { formatUtm, fromUtm, toUtm } from '@/core/geo/utm';
import { jpegPagePdf } from '@/core/pdf/jpegPdf';
import { renderBaseMap, type BaseMap } from './renderBase';
import {
  contourInterval,
  DEFAULT_DPI,
  gridLabel,
  gridLines,
  edgeTicks,
  gridStepM,
  latLonStepDeg,
  MM_PER_INCH,
  pickScale,
  scaleBar,
  scaleEquivalence,
  sheetLayout,
  zoomForScale,
  type Orientation,
  type Rect,
  type SheetLayout,
} from './geometry';

export interface TopoPoint {
  n: number;
  name: string;
  lat: number;
  lon: number;
}
export interface TopoLeg {
  from: number;
  to: number;
  distanceM: number;
  /** Rumbo magnético (grados), si se conoce. */
  bearingMagDeg: number | null;
  ascentM?: number;
  descentM?: number;
}
export interface TopoSheetInput {
  title: string;
  subtitle?: string;
  /** Fecha (ISO) que se imprime. */
  date: string;
  /** La ruta, en orden. */
  line: LatLon[];
  points: TopoPoint[];
  legs: TopoLeg[];
  /** Declinación magnética en el centro (este positivo) y su año. */
  declinationDeg: number;
  declinationYear: number;
  /** Escala (denominador); sin valor, la de más detalle a la que entra la ruta. */
  scale?: number;
  orientation?: Orientation;
  /** Además de la cuadrícula UTM, marcas de latitud y longitud dentro del marco (apagado por defecto). */
  latLonTicks?: boolean;
}

export interface SheetPlan {
  scale: number | null;
  layout: SheetLayout;
  center: LatLon;
  zone: number;
  /** Tamaño de la zona de la ruta en metros (este y norte). */
  extentM: { east: number; north: number };
}

/** Escala por defecto de la hoja. */
export const DEFAULT_SCALE = 50_000;
const PX_PER_MM = DEFAULT_DPI / MM_PER_INCH;
const mm = (v: number) => v * PX_PER_MM;

/** Decide escala, diseño y centro de la hoja sin dibujar nada (sirve para avisar antes si la ruta no entra). */
export function planSheet(input: TopoSheetInput): SheetPlan {
  const all: LatLon[] = [...input.line, ...input.points.map((p) => ({ lat: p.lat, lon: p.lon }))];
  if (!all.length) throw new Error('NO_ROUTE');
  const mid = { lat: (Math.min(...all.map((p) => p.lat)) + Math.max(...all.map((p) => p.lat))) / 2, lon: (Math.min(...all.map((p) => p.lon)) + Math.max(...all.map((p) => p.lon))) / 2 };
  const zone = toUtm(mid).zone;
  const u = all.map((p) => toUtm(p, zone));
  const minE = Math.min(...u.map((p) => p.easting));
  const maxE = Math.max(...u.map((p) => p.easting));
  const minN = Math.min(...u.map((p) => p.northing));
  const maxN = Math.max(...u.map((p) => p.northing));
  const orientation = input.orientation ?? (maxE - minE > maxN - minN ? 'landscape' : 'portrait');
  const layout = sheetLayout(orientation, input.legs.length + 1);
  const center = fromUtm({ zone, hemisphere: mid.lat < 0 ? 'S' : 'N', easting: (minE + maxE) / 2, northing: (minN + maxN) / 2 });
  const extentM = { east: maxE - minE, north: maxN - minN };
  // Por defecto 1:50.000 (la más usada en montaña); más cerca solo si la ruta no entra a esa escala, nunca más detalle que eso salvo que se pida.
  const fit = pickScale(extentM.east, extentM.north, layout.map);
  const scale = input.scale ?? (fit !== null && fit < DEFAULT_SCALE ? DEFAULT_SCALE : fit);
  return { scale, layout, center, zone, extentM };
}

/** Grados y minutos (y segundos si hace falta) de una coordenada: 41°08′ o 71°27′30″. */
const dm = (deg: number, seconds = false) => {
  const total = Math.round(Math.abs(deg) * (seconds ? 3600 : 60));
  const d = Math.floor(total / (seconds ? 3600 : 60));
  const rest = total - d * (seconds ? 3600 : 60);
  const m = seconds ? Math.floor(rest / 60) : rest;
  const sec = seconds ? rest % 60 : 0;
  return `${d}°${String(m).padStart(2, '0')}′${seconds ? `${String(sec).padStart(2, '0')}″` : ''}`;
};
const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2).replace('.', ',')} km` : `${Math.round(m)} m`);

type Ctx = CanvasRenderingContext2D;
const FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

interface TextOpts {
  size: number;
  bold?: boolean;
  color?: string;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  halo?: string;
}

function text(ctx: Ctx, s: string, x: number, y: number, o: TextOpts) {
  ctx.font = `${o.bold ? '700 ' : ''}${mm(o.size)}px ${FONT}`;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.base ?? 'alphabetic';
  if (o.halo) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = mm(o.size * 0.35);
    ctx.strokeStyle = o.halo;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = o.color ?? '#111';
  ctx.fillText(s, x, y);
}

/** Texto girado 90° (se lee de abajo hacia arriba); el cuerpo de las letras queda a la izquierda de la línea de base `x`. */
function vtext(ctx: Ctx, s: string, x: number, y: number, o: TextOpts) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  text(ctx, s, 0, 0, o);
  ctx.restore();
}

const rectPx = (r: Rect): Rect => ({ x: mm(r.x), y: mm(r.y), w: mm(r.w), h: mm(r.h) });

/** Arma la hoja completa sobre el mapa ya dibujado. */
export function drawSheet(base: BaseMap, plan: SheetPlan, input: TopoSheetInput): HTMLCanvasElement {
  const { layout, scale } = plan;
  if (!scale) throw new Error('NO_FIT');
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(mm(layout.paper.w));
  canvas.height = Math.round(mm(layout.paper.h));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const map = rectPx(layout.map);
  const sx = map.w / base.canvas.width;
  const sy = map.h / base.canvas.height;
  const toSheet = (p: { x: number; y: number }) => ({ x: map.x + p.x * sx, y: map.y + p.y * sy });
  const proj = (p: LatLon) => toSheet(base.project(p));
  const unproj = (x: number, y: number) => base.unproject((x - map.x) / sx, (y - map.y) / sy);

  // Mapa
  ctx.save();
  ctx.beginPath();
  ctx.rect(map.x, map.y, map.w, map.h);
  ctx.clip();
  ctx.drawImage(base.canvas, map.x, map.y, map.w, map.h);

  // Cuadrícula UTM: líneas rectas en UTM, dibujadas punto a punto sobre el mapa.
  const corners = [unproj(map.x, map.y), unproj(map.x + map.w, map.y), unproj(map.x, map.y + map.h), unproj(map.x + map.w, map.y + map.h)].map((c) => toUtm(c, plan.zone));
  const minE = Math.min(...corners.map((c) => c.easting));
  const maxE = Math.max(...corners.map((c) => c.easting));
  const minN = Math.min(...corners.map((c) => c.northing));
  const maxN = Math.max(...corners.map((c) => c.northing));
  const step = gridStepM(scale);
  const grid = gridLines(minE, maxE, minN, maxN, step);
  const hemi = plan.center.lat < 0 ? 'S' : 'N';
  const toXY = (e: number, n: number) => proj(fromUtm({ zone: plan.zone, hemisphere: hemi, easting: e, northing: n }));
  const GRID_COLOR = '#1d4e89';
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = mm(0.18);
  const line = (pts: { x: number; y: number }[]) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  };
  for (const e of grid.eastings) {
    const pts: { x: number; y: number }[] = [];
    for (let n = minN - 2000; n <= maxN + 2000; n += 250) pts.push(toXY(e, n));
    line(pts);
  }
  for (const n of grid.northings) {
    const pts: { x: number; y: number }[] = [];
    for (let e = minE - 2000; e <= maxE + 2000; e += 250) pts.push(toXY(e, n));
    line(pts);
  }
  // Ruta y waypoints
  if (input.line.length > 1) {
    const pts = input.line.map(proj);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = mm(1.5);
    line(pts);
    ctx.strokeStyle = '#d62828';
    ctx.lineWidth = mm(0.75);
    line(pts);
  }
  for (const p of input.points) {
    const c = proj(p);
    ctx.beginPath();
    ctx.arc(c.x, c.y, mm(2.3), 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = mm(0.45);
    ctx.strokeStyle = '#d62828';
    ctx.stroke();
    text(ctx, String(p.n), c.x, c.y, { size: 2.9, bold: true, color: '#d62828', align: 'center', base: 'middle' });
    text(ctx, p.name, c.x + mm(3.2), c.y - mm(1.6), { size: 3, bold: true, color: '#111', halo: 'rgba(255,255,255,0.92)' });
  }
  ctx.restore();

  // Marco del mapa
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.4);
  ctx.strokeRect(map.x, map.y, map.w, map.h);

  // Valores de la cuadrícula UTM afuera del marco, con la marca donde cada línea lo cruza: los de este arriba y abajo
  // (horizontales); los de norte a los costados (en vertical). El valor va completo, en metros.
  const grp = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
  const midN = (minN + maxN) / 2;
  const midE = (minE + maxE) / 2;
  const UT = { size: 2.7, bold: true, color: GRID_COLOR } as const;
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth = mm(0.3);
  for (const e of grid.eastings) {
    const x = toXY(e, midN).x;
    if (x < map.x + mm(6) || x > map.x + map.w - mm(6)) continue;
    ctx.beginPath();
    ctx.moveTo(x, map.y - mm(1.8));
    ctx.lineTo(x, map.y);
    ctx.moveTo(x, map.y + map.h);
    ctx.lineTo(x, map.y + map.h + mm(1.8));
    ctx.stroke();
    text(ctx, grp(e), x, map.y - mm(2.4), { ...UT, align: 'center', base: 'bottom' });
    text(ctx, grp(e), x, map.y + map.h + mm(2.4), { ...UT, align: 'center', base: 'top' });
  }
  for (const n of grid.northings) {
    const y = toXY(midE, n).y;
    if (y < map.y + mm(6) || y > map.y + map.h - mm(6)) continue;
    ctx.beginPath();
    ctx.moveTo(map.x - mm(1.8), y);
    ctx.lineTo(map.x, y);
    ctx.moveTo(map.x + map.w, y);
    ctx.lineTo(map.x + map.w + mm(1.8), y);
    ctx.stroke();
    vtext(ctx, grp(n), map.x - mm(2.4), y, { ...UT, align: 'center' });
    vtext(ctx, grp(n), map.x + map.w + mm(5.2), y, { ...UT, align: 'center' });
  }
  text(ctx, 'E (m)', map.x - mm(1), map.y - mm(5), { size: 2.2, color: GRID_COLOR, align: 'right', base: 'bottom' });
  vtext(ctx, 'N (m)', map.x + map.w + mm(8), map.y + mm(1), { size: 2.2, color: GRID_COLOR, align: 'right' });

  // Marcas de latitud y longitud (opcionales), hacia adentro del marco: con el mapa girado quedan inclinadas
  if (input.latLonTicks) {
    const ll = latLonStepDeg(scale);
    const secs = ll < 1 / 60 - 1e-9;
    const N = 240;
    const along = (from: { x: number; y: number }, to: { x: number; y: number }, key: 'lat' | 'lon', axis: 'x' | 'y') =>
      Array.from({ length: N + 1 }, (_, i) => {
        const x = from.x + ((to.x - from.x) * i) / N;
        const y = from.y + ((to.y - from.y) * i) / N;
        return { pos: axis === 'x' ? x : y, value: unproj(x, y)[key] };
      });
    const L = { x: map.x, y: map.y };
    const R = { x: map.x + map.w, y: map.y };
    const BL = { x: map.x, y: map.y + map.h };
    const BR = { x: map.x + map.w, y: map.y + map.h };
    const LL = { size: 2.3, color: '#111', halo: 'rgba(255,255,255,0.9)' } as const;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = mm(0.3);
    const tick = (x1: number, y1: number, x2: number, y2: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    for (const t of edgeTicks(along(L, BL, 'lat', 'y'), ll)) {
      tick(map.x, t.pos, map.x + mm(2), t.pos);
      vtext(ctx, dm(t.value, secs), map.x + mm(5), t.pos, { ...LL, align: 'center' });
    }
    for (const t of edgeTicks(along(R, BR, 'lat', 'y'), ll)) {
      tick(map.x + map.w, t.pos, map.x + map.w - mm(2), t.pos);
      vtext(ctx, dm(t.value, secs), map.x + map.w - mm(2.6), t.pos, { ...LL, align: 'center' });
    }
    for (const t of edgeTicks(along(L, R, 'lon', 'x'), ll)) {
      tick(t.pos, map.y, t.pos, map.y + mm(2));
      text(ctx, dm(t.value, secs), t.pos, map.y + mm(5), { ...LL, align: 'center' });
    }
    for (const t of edgeTicks(along(BL, BR, 'lon', 'x'), ll)) {
      tick(t.pos, map.y + map.h, t.pos, map.y + map.h - mm(2));
      text(ctx, dm(t.value, secs), t.pos, map.y + map.h - mm(2.6), { ...LL, align: 'center' });
    }
  }

  // Título
  const h = rectPx(layout.header);
  text(ctx, input.title, h.x, h.y + mm(7), { size: 6.5, bold: true });
  text(ctx, `${input.subtitle ? input.subtitle + ' · ' : ''}${input.date}`, h.x, h.y + mm(12.2), { size: 3.4, color: '#444' });
  text(ctx, `1:${scale.toLocaleString('es-AR')}`, h.x + h.w, h.y + mm(7), { size: 6.5, bold: true, align: 'right' });

  drawTable(ctx, rectPx(layout.table), input);
  drawFooter(ctx, rectPx(layout.footer), plan, input, scale);
  return canvas;
}

function drawTable(ctx: Ctx, r: Rect, input: TopoSheetInput) {
  const rowH = mm(5.2);
  const name = (n: number) => input.points.find((p) => p.n === n)?.name ?? String(n);
  const cols = [0.07, 0.43, 0.15, 0.15, 0.2];
  const heads = ['N.°', 'Tramo', 'Distancia', 'Rumbo mag.', 'Desnivel'];
  ctx.fillStyle = '#e9e5da';
  ctx.fillRect(r.x, r.y, r.w, rowH + mm(1));
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.3);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  let x = r.x;
  heads.forEach((hd, i) => {
    text(ctx, hd, x + mm(1.2), r.y + mm(4), { size: 3, bold: true });
    x += cols[i]! * r.w;
  });
  const maxRows = Math.max(1, Math.floor((r.h - mm(1) - rowH) / rowH));
  const legs = input.legs.slice(0, maxRows - 1);
  legs.forEach((leg, i) => {
    const y = r.y + mm(1) + rowH * (i + 1) + mm(3.9);
    const cells = [
      String(i + 1),
      `${name(leg.from)} → ${name(leg.to)}`,
      fmtDist(leg.distanceM),
      leg.bearingMagDeg === null ? '—' : `${String(Math.round(leg.bearingMagDeg) % 360).padStart(3, '0')}°`,
      leg.ascentM === undefined && leg.descentM === undefined ? '—' : `+${Math.round(leg.ascentM ?? 0)} / −${Math.round(leg.descentM ?? 0)} m`,
    ];
    let cx = r.x;
    cells.forEach((c, k) => {
      text(ctx, c, cx + mm(1.2), y, { size: 3 });
      cx += cols[k]! * r.w;
    });
    ctx.strokeStyle = '#c9c4b6';
    ctx.beginPath();
    ctx.moveTo(r.x, y + mm(1.3));
    ctx.lineTo(r.x + r.w, y + mm(1.3));
    ctx.stroke();
  });
  const total = input.legs.reduce((s, l) => s + l.distanceM, 0);
  const up = input.legs.reduce((s, l) => s + (l.ascentM ?? 0), 0);
  const down = input.legs.reduce((s, l) => s + (l.descentM ?? 0), 0);
  const more = input.legs.length > legs.length ? ` (se muestran ${legs.length} de ${input.legs.length} tramos)` : '';
  const ty = r.y + r.h - mm(1.6);
  text(ctx, `Total: ${fmtDist(total)}${up || down ? ` · +${Math.round(up)} / −${Math.round(down)} m` : ''}${more}`, r.x + mm(1.2), ty, { size: 3, bold: true });
}

function drawFooter(ctx: Ctx, r: Rect, plan: SheetPlan, input: TopoSheetInput, scale: number) {
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.3);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  const zoom = zoomForScale(plan.center.lat, scale);
  const ci = contourInterval(zoom);
  const left = r.x + mm(2.5);

  // Columna izquierda: escala numérica, equivalencia y barra gráfica
  text(ctx, `Escala 1:${scale.toLocaleString('es-AR')}`, left, r.y + mm(5.6), { size: 4.6, bold: true });
  text(ctx, scaleEquivalence(scale), left, r.y + mm(9.8), { size: 3 });
  const bar = scaleBar(scale);
  const by = r.y + mm(13);
  const bw = mm(bar.mm);
  const bh = mm(1.6);
  const parts = 4;
  for (let i = 0; i < parts; i++) {
    ctx.fillStyle = i % 2 ? '#fff' : '#111';
    ctx.fillRect(left + (bw / parts) * i, by, bw / parts, bh);
  }
  ctx.strokeStyle = '#111';
  ctx.lineWidth = mm(0.25);
  ctx.strokeRect(left, by, bw, bh);
  const lab = (m: number) => (bar.meters >= 1000 ? `${+(m / 1000).toFixed(2)}` : String(m));
  for (let i = 0; i <= parts; i++) text(ctx, lab((bar.meters / parts) * i), left + (bw / parts) * i, by + bh + mm(3.2), { size: 2.6, align: 'center' });
  text(ctx, bar.meters >= 1000 ? 'km' : 'm', left + bw + mm(1.2), by + bh + mm(3.2), { size: 2.6 });

  // Columna del medio: la cuadrícula y los datos del mapa
  const mx = Math.max(left + bw + mm(10), r.x + r.w * 0.42);
  const lines = [
    `Cuadrícula UTM de ${gridLabel(scale)}`,
    `(1 cuadro = ${paperMmLabel(scale)} en el papel)`,
    `Proyección UTM (Mercator transversal) · WGS84`,
    `Zona ${plan.zone} ${plan.center.lat < 0 ? 'Sur' : 'Norte'} (${plan.zone}${toUtm(plan.center, plan.zone).band}) · meridiano central ${Math.abs(-183 + 6 * plan.zone)}° ${-183 + 6 * plan.zone < 0 ? 'O' : 'E'}`,
    `Centro: ${formatUtm(toUtm(plan.center, plan.zone))}`,
    `Curvas de nivel cada ${ci.minor} m (destacadas cada ${ci.major} m)`,
  ];
  lines.forEach((s, i) => text(ctx, s, mx, r.y + mm(3.9 + i * 2.85), { size: 2.3 }));

  // Norte: de la cuadrícula (NC), verdadero (NV) y magnético (NM)
  const ncx = r.x + r.w - mm(14);
  const ncy = r.y + mm(19);
  const conv = convergenceDeg(plan.center, plan.zone);
  const arrow = (angleDeg: number, len: number, color: string, dash = false) => {
    ctx.save();
    ctx.translate(ncx, ncy);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = mm(0.4);
    ctx.setLineDash(dash ? [mm(0.8), mm(0.6)] : []);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -mm(len));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(0, -mm(len + 2));
    ctx.lineTo(-mm(1), -mm(len - 0.5));
    ctx.lineTo(mm(1), -mm(len - 0.5));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  // Las diferencias entre los tres nortes son de pocos grados: las flechas son largas para que se distingan.
  arrow(0, 12, '#1d4e89');
  arrow(-conv, 12, '#111', true);
  arrow(input.declinationDeg - conv, 12, '#b3261e');
  text(ctx, 'N', ncx, r.y + mm(4.6), { size: 3, bold: true, align: 'center', base: 'bottom' });

  // Fila de abajo: leyenda del norte, declinación, aviso y atribuciones
  const legendY = r.y + mm(21.4);
  let x = left;
  const run = (s: string, color: string, bold = false) => {
    text(ctx, s, x, legendY, { size: 2.4, color, bold });
    x += ctx.measureText(s).width;
  };
  run('NC', '#1d4e89', true);
  run(' norte de la cuadrícula  ·  ', '#111');
  run('NV', '#111', true);
  run(` norte verdadero (convergencia ${dm(conv)})  ·  `, '#111');
  run('NM', '#b3261e', true);
  run(` norte magnético: declinación ${dm(input.declinationDeg)} ${input.declinationDeg >= 0 ? 'E' : 'O'} en ${input.declinationYear}`, '#111');
  text(ctx, 'Mapa de ruta de VikArg: no es una carta oficial. Verificá en el terreno.', left, r.y + mm(24.8), { size: 2.5, bold: true });
  text(ctx, '© OpenStreetMap contributors (ODbL), OpenMapTiles, OpenFreeMap · Elevación: Terrain Tiles (AWS)', left, r.y + mm(27.8), { size: 2.2, color: '#444' });
}

/** Lado de un cuadro de la cuadrícula en el papel, por ejemplo «40 mm». */
const paperMmLabel = (scale: number) => `${Math.round((gridStepM(scale) / scale) * 1000)} mm`;

/** Convergencia de meridianos (grados) en el centro: ángulo entre el norte verdadero y el norte de la cuadrícula. */
export function convergenceDeg(p: LatLon, zone: number): number {
  const dl = ((p.lon - (-183 + 6 * zone)) * Math.PI) / 180;
  return (Math.atan(Math.tan(dl) * Math.sin((p.lat * Math.PI) / 180)) * 180) / Math.PI;
}

/** Arma el PDF del mapa topográfico (una hoja A4). Lanza `NO_FIT` si la ruta no entra, `NO_ROUTE` si no hay puntos. */
export async function makeTopoPdf(input: TopoSheetInput): Promise<{ pdf: Uint8Array; scale: number }> {
  const plan = planSheet(input);
  if (!plan.scale) throw new Error('NO_FIT');
  const r = DEFAULT_DPI / 96;
  const mapPx = { w: mm(plan.layout.map.w), h: mm(plan.layout.map.h) };
  const base = await renderBaseMap({
    center: plan.center,
    zoom: zoomForScale(plan.center.lat, plan.scale, DEFAULT_DPI, r),
    // El norte de la cuadrícula hacia arriba: la cuadrícula UTM queda vertical y horizontal; el norte verdadero y el magnético, inclinados.
    bearing: convergenceDeg(plan.center, plan.zone),
    cssWidth: Math.round(mapPx.w / r),
    cssHeight: Math.round(mapPx.h / r),
    pixelRatio: r,
  });
  try {
    const sheet = drawSheet(base, plan, input);
    const blob = await new Promise<Blob>((resolve, reject) => sheet.toBlob((b) => (b ? resolve(b) : reject(new Error('JPEG'))), 'image/jpeg', 0.92));
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    return { pdf: jpegPagePdf({ jpeg, widthPx: sheet.width, heightPx: sheet.height, pageWmm: plan.layout.paper.w, pageHmm: plan.layout.paper.h, title: input.title }), scale: plan.scale };
  } finally {
    base.dispose();
  }
}

/** Piernas de una lista de puntos en orden: distancia y rumbo magnético (rumbo verdadero menos la declinación). */
export function legsBetween(points: TopoPoint[], declinationDeg: number): TopoLeg[] {
  return points.slice(1).map((b, i) => {
    const a = points[i]!;
    const true_ = bearingDeg(a, b);
    return { from: a.n, to: b.n, distanceM: distanceMeters(a, b), bearingMagDeg: (((true_ - declinationDeg) % 360) + 360) % 360 };
  });
}
