import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from 'maplibre-gl';

/**
 * Estilo del fondo de calles del mapa de la red, hecho para parecerse al mapa de Waze:
 * tierra en gris muy claro, calles blancas gorditas y redondeadas con borde gris, vías
 * principales amarillas, autopistas naranjas, agua celeste, parques verde pastel y los
 * nombres de barrio visibles desde el zoom 13 (acá importan más que los sitios).
 *
 * No usa nada de Waze: son teselas vectoriales de OpenFreeMap (esquema OpenMapTiles,
 * gratis y sin clave) con las capas recortadas del estilo «liberty» y los colores de Waze.
 * Con `oscuro` da la versión nocturna (azul marino, calles grises, amarillo apagado).
 */

interface Paleta {
  fondo: string; edificio: string; edificioBorde: string; agua: string; parque: string; bosque: string;
  pista: string; menor: string; menorBorde: string; servicio: string; servicioBorde: string; sendero: string;
  secundaria: string; secundariaBorde: string; primaria: string; primariaBorde: string;
  autopista: string; autopistaBorde: string; tren: string; limite: string;
  textoVia: string; textoLugar: string; textoBarrio: string; textoAgua: string; textoPoi: string; halo: string;
}

const CLARA: Paleta = {
  fondo: '#F4F3F0', edificio: '#E6E4E0', edificioBorde: '#DCD9D3', agua: '#AAD3F2', parque: '#CBE8C0', bosque: '#C3E2B6',
  pista: '#E4E2DE', menor: '#FFFFFF', menorBorde: '#D6D6D6', servicio: '#FFFFFF', servicioBorde: '#E2E1DE', sendero: '#D3D1CC',
  secundaria: '#FFFFFF', secundariaBorde: '#CFCFCF', primaria: '#FFD24D', primariaBorde: '#E0A800',
  autopista: '#FFAA3B', autopistaBorde: '#D9822B', tren: '#C9C7C2', limite: '#B4B1AA',
  textoVia: '#4B5563', textoLugar: '#3B4252', textoBarrio: '#4B5563', textoAgua: '#4A7FB5', textoPoi: '#6B7280', halo: '#FFFFFF',
};

const OSCURA: Paleta = {
  fondo: '#1F2A37', edificio: '#273343', edificioBorde: '#2F3B4C', agua: '#0F3A5A', parque: '#20402E', bosque: '#1E3A2B',
  pista: '#2A3645', menor: '#3A4757', menorBorde: '#2B3544', servicio: '#33404F', servicioBorde: '#2B3544', sendero: '#3F4C5C',
  secundaria: '#46546A', secundariaBorde: '#2B3544', primaria: '#C9A227', primariaBorde: '#8F7320',
  autopista: '#D4882B', autopistaBorde: '#9A5F1C', tren: '#4B5563', limite: '#4B5563',
  textoVia: '#D1D5DB', textoLugar: '#E5E7EB', textoBarrio: '#D1D5DB', textoAgua: '#7FB3E0', textoPoi: '#9CA3AF', halo: '#111827',
};

const FUENTE = ['Noto Sans Regular'];
const NEGRITA = ['Noto Sans Bold'];
const CURSIVA = ['Noto Sans Italic'];

/** El nombre en español si lo hay; si no, el latino y por último el del lugar. */
const NOMBRE: ExpressionSpecification = ['coalesce', ['get', 'name:es'], ['get', 'name:latin'], ['get', 'name']];

const ES_LINEA: ExpressionSpecification = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const ES_PUNTO: ExpressionSpecification = ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false];
const SIN_TUNEL: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
const EN_TUNEL: ExpressionSpecification = ['==', ['get', 'brunnel'], 'tunnel'];
const ES_RAMPA: ExpressionSpecification = ['==', ['get', 'ramp'], 1];
const NO_RAMPA: ExpressionSpecification = ['!=', ['get', 'ramp'], 1];
const clase = (...c: string[]): ExpressionSpecification => ['match', ['get', 'class'], c, true, false];

/** Ancho que crece con el zoom (exponencial, como las calles de Waze que engordan al acercarse). */
const ancho = (...pares: number[]): ExpressionSpecification => ['interpolate', ['exponential', 1.3], ['zoom'], ...pares] as ExpressionSpecification;

/* Anchos de relleno y de borde por tipo de vía: pares zoom, píxeles. */
const ANCHO = {
  autopista:      ancho(5, 0.8, 8, 1.6, 12, 3.2, 14, 6, 16, 10, 18, 18, 20, 30),
  autopistaBorde: ancho(5, 1.4, 8, 2.8, 12, 5, 14, 8.5, 16, 13.5, 18, 22.5, 20, 36),
  primaria:       ancho(6, 0.5, 9, 1.2, 12, 2.6, 14, 5, 16, 9, 18, 16, 20, 26),
  primariaBorde:  ancho(6, 0.9, 9, 2.2, 12, 4.2, 14, 7.2, 16, 12.2, 18, 20, 20, 31.5),
  secundaria:     ancho(9, 0.6, 12, 1.5, 14, 3.5, 16, 7, 18, 13, 20, 22),
  secundariaBorde: ancho(9, 1, 12, 2.6, 14, 5.4, 16, 9.6, 18, 16.6, 20, 27),
  menor:          ancho(12, 0.4, 13, 1, 14, 2.5, 16, 5.5, 18, 11, 20, 20),
  menorBorde:     ancho(12, 0.9, 13, 2, 14, 4.2, 16, 8, 18, 14.6, 20, 25.5),
  rampa:          ancho(12, 0.8, 14, 2, 16, 4.5, 18, 9, 20, 15),
  rampaBorde:     ancho(12, 1.6, 14, 3.6, 16, 7, 18, 12.5, 20, 20),
  servicio:       ancho(15, 0.5, 16, 1.5, 18, 5, 20, 9),
  servicioBorde:  ancho(15, 1.3, 16, 3, 18, 7.5, 20, 13),
  sendero:        ancho(15, 0.6, 16, 1, 18, 2.4, 20, 4.5),
};

const REDONDO = { 'line-cap': 'round', 'line-join': 'round' } as const;

export function estiloWaze(oscuro: boolean): StyleSpecification {
  const p = oscuro ? OSCURA : CLARA;

  /* Una capa de línea de vías: el relleno o el borde de un tipo de vía. */
  const via = (id: string, filtro: ExpressionSpecification, color: string, width: ExpressionSpecification, extra: Partial<LayerSpecification> = {}): LayerSpecification => ({
    id, type: 'line', source: 'openmaptiles', 'source-layer': 'transportation',
    filter: ['all', ES_LINEA, filtro], layout: { ...REDONDO }, paint: { 'line-color': color, 'line-width': width },
    ...extra,
  } as LayerSpecification);

  /* Un rótulo de lugar (ciudad, pueblo, barrio…). */
  const lugar = (id: string, filtro: ExpressionSpecification, fuente: string[], color: string, size: ExpressionSpecification | number, extra: Record<string, unknown> = {}, minzoom?: number, maxzoom?: number): LayerSpecification => ({
    id, type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', filter: filtro,
    ...(minzoom !== undefined ? { minzoom } : {}), ...(maxzoom !== undefined ? { maxzoom } : {}),
    layout: { 'text-field': NOMBRE, 'text-font': fuente, 'text-size': size, 'text-max-width': 8, 'text-padding': 4, ...extra },
    paint: { 'text-color': color, 'text-halo-color': p.halo, 'text-halo-width': 1.6, 'text-halo-blur': 0.6 },
  } as LayerSpecification);

  const capas: LayerSpecification[] = [
    { id: 'fondo', type: 'background', paint: { 'background-color': p.fondo } },

    /* ── Suelo: bosques, pasto, parques, agua ── */
    { id: 'bosque', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: clase('wood'),
      paint: { 'fill-color': p.bosque, 'fill-opacity': oscuro ? 0.5 : 0.55, 'fill-antialias': false } },
    { id: 'pasto', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: clase('grass'),
      paint: { 'fill-color': p.parque, 'fill-opacity': 0.5, 'fill-antialias': false } },
    { id: 'parque', type: 'fill', source: 'openmaptiles', 'source-layer': 'park',
      paint: { 'fill-color': p.parque, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 0.9] } },
    { id: 'rio', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', filter: ['all', SIN_TUNEL, clase('river')],
      layout: { 'line-cap': 'round' }, paint: { 'line-color': p.agua, 'line-width': ancho(11, 0.8, 20, 8) } },
    { id: 'arroyo', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', filter: ['all', SIN_TUNEL, ['!', clase('river')]], minzoom: 13,
      layout: { 'line-cap': 'round' }, paint: { 'line-color': p.agua, 'line-width': ancho(13, 0.6, 20, 4) } },
    { id: 'agua', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', filter: SIN_TUNEL,
      paint: { 'fill-color': p.agua } },

    /* ── Aeropuertos: la pista como una franja gris (son referencias grandes) ── */
    { id: 'aeropuerto', type: 'fill', source: 'openmaptiles', 'source-layer': 'aeroway', minzoom: 11, filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      paint: { 'fill-color': p.pista, 'fill-opacity': 0.7 } },
    { id: 'pista', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway', minzoom: 11, filter: ['all', ES_LINEA, clase('runway')],
      paint: { 'line-color': p.pista, 'line-width': ancho(11, 2, 17, 30) } },

    /* ── Edificios: planos, apenas más oscuros que el suelo, sólo de cerca ── */
    { id: 'edificios', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 15,
      paint: { 'fill-color': p.edificio, 'fill-outline-color': p.edificioBorde, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 16, 1] } },

    /* ── Túneles: la misma vía pero traslúcida y con el borde punteado ── */
    via('tunel-menor-borde', ['all', EN_TUNEL, clase('minor', 'secondary', 'tertiary')], p.menorBorde, ANCHO.secundariaBorde, { layout: { 'line-join': 'round' }, paint: { 'line-color': p.menorBorde, 'line-width': ANCHO.secundariaBorde, 'line-dasharray': [3, 2] } }),
    via('tunel-principal-borde', ['all', EN_TUNEL, clase('primary', 'trunk', 'motorway')], p.primariaBorde, ANCHO.primariaBorde, { layout: { 'line-join': 'round' }, paint: { 'line-color': p.primariaBorde, 'line-width': ANCHO.primariaBorde, 'line-dasharray': [3, 2], 'line-opacity': 0.6 } }),
    via('tunel-menor', ['all', EN_TUNEL, clase('minor', 'secondary', 'tertiary')], p.menor, ANCHO.secundaria, { paint: { 'line-color': p.menor, 'line-width': ANCHO.secundaria, 'line-opacity': 0.7 } }),
    via('tunel-principal', ['all', EN_TUNEL, clase('primary', 'trunk')], p.primaria, ANCHO.primaria, { paint: { 'line-color': p.primaria, 'line-width': ANCHO.primaria, 'line-opacity': 0.5 } }),
    via('tunel-autopista', ['all', EN_TUNEL, clase('motorway')], p.autopista, ANCHO.autopista, { paint: { 'line-color': p.autopista, 'line-width': ANCHO.autopista, 'line-opacity': 0.5 } }),

    /* ── Bordes de las vías: todos primero, así los rellenos se funden en los cruces ── */
    via('servicio-borde', ['all', SIN_TUNEL, clase('service', 'track')], p.servicioBorde, ANCHO.servicioBorde, { minzoom: 15 }),
    via('menor-borde', ['all', SIN_TUNEL, clase('minor'), NO_RAMPA], p.menorBorde, ANCHO.menorBorde, { minzoom: 12 }),
    via('rampa-borde', ['all', SIN_TUNEL, ES_RAMPA, clase('minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway')],
      p.menorBorde, ANCHO.rampaBorde, { minzoom: 12, paint: { 'line-width': ANCHO.rampaBorde,
        'line-color': ['match', ['get', 'class'], ['motorway'], p.autopistaBorde, ['primary', 'trunk'], p.primariaBorde, ['secondary', 'tertiary'], p.secundariaBorde, p.menorBorde] } }),
    via('secundaria-borde', ['all', SIN_TUNEL, clase('secondary', 'tertiary'), NO_RAMPA], p.secundariaBorde, ANCHO.secundariaBorde, { minzoom: 9 }),
    via('primaria-borde', ['all', SIN_TUNEL, clase('primary', 'trunk'), NO_RAMPA], p.primariaBorde, ANCHO.primariaBorde, { minzoom: 6 }),
    via('autopista-borde', ['all', SIN_TUNEL, clase('motorway'), NO_RAMPA], p.autopistaBorde, ANCHO.autopistaBorde, { minzoom: 5 }),

    /* ── Rellenos de las vías, de la más chica a la más grande ── */
    via('sendero', ['all', SIN_TUNEL, clase('path', 'pedestrian')], p.sendero, ANCHO.sendero, { minzoom: 15, layout: { 'line-join': 'round' }, paint: { 'line-color': p.sendero, 'line-width': ANCHO.sendero, 'line-dasharray': [2, 1.5] } }),
    via('servicio', ['all', SIN_TUNEL, clase('service', 'track')], p.servicio, ANCHO.servicio, { minzoom: 15 }),
    via('menor', ['all', SIN_TUNEL, clase('minor'), NO_RAMPA], p.menor, ANCHO.menor, { minzoom: 12 }),
    via('rampa', ['all', SIN_TUNEL, ES_RAMPA, clase('minor', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway')],
      p.menor, ANCHO.rampa, { minzoom: 12, paint: { 'line-width': ANCHO.rampa,
        'line-color': ['match', ['get', 'class'], ['motorway'], p.autopista, ['primary', 'trunk'], p.primaria, ['secondary', 'tertiary'], p.secundaria, p.menor] } }),
    via('secundaria', ['all', SIN_TUNEL, clase('secondary', 'tertiary'), NO_RAMPA], p.secundaria, ANCHO.secundaria, { minzoom: 9 }),
    via('primaria', ['all', SIN_TUNEL, clase('primary', 'trunk'), NO_RAMPA], p.primaria, ANCHO.primaria, { minzoom: 6 }),
    via('autopista', ['all', SIN_TUNEL, clase('motorway'), NO_RAMPA], p.autopista, ANCHO.autopista, { minzoom: 5 }),

    /* ── Tren: una línea fina con travesaños, discreta ── */
    via('tren', ['all', SIN_TUNEL, clase('rail', 'transit')], p.tren, ancho(12, 0.5, 15, 1, 20, 2.5), { minzoom: 12, layout: {}, paint: { 'line-color': p.tren, 'line-width': ancho(12, 0.5, 15, 1, 20, 2.5) } }),
    via('tren-travesanos', ['all', SIN_TUNEL, clase('rail', 'transit')], p.tren, ancho(14.5, 0, 15, 3, 20, 8), { minzoom: 14, layout: {}, paint: { 'line-color': p.tren, 'line-width': ancho(14.5, 0, 15, 3, 20, 8), 'line-dasharray': [0.2, 8] } }),

    /* ── Límites administrativos: punteados y discretos ── */
    { id: 'limite-interno', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', minzoom: 5,
      filter: ['all', ['>=', ['get', 'admin_level'], 3], ['<=', ['get', 'admin_level'], 6], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1], ['!', ['has', 'claimed_by']]],
      paint: { 'line-color': p.limite, 'line-dasharray': [2, 2], 'line-opacity': 0.6, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 11, 1.5] } },
    { id: 'limite-pais', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1], ['!', ['has', 'claimed_by']]],
      layout: { ...REDONDO }, paint: { 'line-color': p.limite, 'line-dasharray': [3, 2], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1, 5, 1.4, 12, 2.5] } },

    /* ── Rótulos: agua, vías, pocos sitios, lugares ── */
    { id: 'nombre-rio', type: 'symbol', source: 'openmaptiles', 'source-layer': 'waterway', minzoom: 11, filter: ES_LINEA,
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 400, 'text-field': NOMBRE, 'text-font': CURSIVA, 'text-size': 12, 'text-letter-spacing': 0.1, 'text-max-width': 5 },
      paint: { 'text-color': p.textoAgua, 'text-halo-color': p.halo, 'text-halo-width': 1.2 } },
    { id: 'nombre-agua', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name', filter: ES_PUNTO,
      layout: { 'text-field': NOMBRE, 'text-font': CURSIVA, 'text-size': ['interpolate', ['linear'], ['zoom'], 0, 10, 8, 13], 'text-letter-spacing': 0.1, 'text-max-width': 5 },
      paint: { 'text-color': p.textoAgua, 'text-halo-color': p.halo, 'text-halo-width': 1.2 } },

    { id: 'nombre-calle', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 15,
      filter: ['all', ES_LINEA, clase('minor', 'service', 'track', 'path', 'pedestrian')],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 300, 'text-field': NOMBRE, 'text-font': FUENTE, 'text-rotation-alignment': 'map',
        'text-size': ['interpolate', ['linear'], ['zoom'], 15, 11, 17, 12.5, 20, 14], 'text-letter-spacing': 0.02, 'text-padding': 3 },
      paint: { 'text-color': p.textoVia, 'text-halo-color': p.halo, 'text-halo-width': 1.5, 'text-halo-blur': 0.5 } },
    { id: 'nombre-via', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 12.5,
      filter: ['all', ES_LINEA, clase('motorway', 'trunk', 'primary', 'secondary', 'tertiary')],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-field': NOMBRE, 'text-font': NEGRITA, 'text-rotation-alignment': 'map',
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 11, 16, 13, 20, 15], 'text-letter-spacing': 0.02, 'text-padding': 3 },
      paint: { 'text-color': p.textoVia, 'text-halo-color': p.halo, 'text-halo-width': 1.6, 'text-halo-blur': 0.5 } },

    // Sólo los sitios que sirven de referencia al ubicar a un cliente o mandar a un técnico.
    { id: 'sitios', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 16,
      filter: ['all', ES_PUNTO, clase('hospital', 'school', 'college', 'bus', 'railway', 'police', 'fire_station', 'town_hall', 'stadium', 'park', 'cemetery')],
      // Los iconos del sprite de OpenFreeMap se llaman igual que la clase del sitio.
      layout: { 'icon-image': ['to-string', ['get', 'class']], 'icon-size': 0.8, 'icon-optional': true,
        'text-field': NOMBRE, 'text-font': FUENTE, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.8], 'text-max-width': 8, 'text-optional': true },
      paint: { 'text-color': p.textoPoi, 'text-halo-color': p.halo, 'text-halo-width': 1.2, 'text-halo-blur': 0.5,
        'icon-opacity': oscuro ? 0.8 : 1 } },

    // Barrios desde el zoom 13: en el ISP se ubica por barrio.
    lugar('barrio', clase('suburb', 'quarter', 'neighbourhood'), NEGRITA, p.textoBarrio,
      ['interpolate', ['linear'], ['zoom'], 13, 11, 16, 13.5, 18, 15], { 'text-letter-spacing': 0.04, 'text-max-width': 7 }, 13),
    lugar('aldea', clase('village', 'hamlet'), FUENTE, p.textoLugar, ['interpolate', ['exponential', 1.2], ['zoom'], 9, 10.5, 12, 13], {}, 9),
    lugar('pueblo', clase('town'), NEGRITA, p.textoLugar, ['interpolate', ['exponential', 1.2], ['zoom'], 7, 12, 11, 15, 14, 17], {}, 6),
    lugar('ciudad', ['all', clase('city'), ['!=', ['get', 'capital'], 2]], NEGRITA, p.textoLugar, ['interpolate', ['exponential', 1.2], ['zoom'], 4, 11, 7, 13, 11, 18, 14, 20], {}, 3),
    lugar('capital', ['all', clase('city'), ['==', ['get', 'capital'], 2]], NEGRITA, p.textoLugar, ['interpolate', ['exponential', 1.2], ['zoom'], 4, 12, 7, 14, 11, 20, 14, 22], { 'text-transform': 'uppercase', 'text-letter-spacing': 0.04 }, 3),
    lugar('departamento', clase('state', 'province'), FUENTE, p.textoBarrio, ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 14], { 'text-transform': 'uppercase', 'text-letter-spacing': 0.2, 'text-max-width': 9 }, 5, 8),
    lugar('pais', clase('country'), NEGRITA, p.textoLugar, ['interpolate', ['linear'], ['zoom'], 1, 10, 4, 17, 6, 20], { 'text-max-width': 6.25 }, undefined, 9),
  ];

  return {
    version: 8,
    name: oscuro ? 'Netplay Waze noche' : 'Netplay Waze día',
    sources: { openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
    layers: capas,
  };
}

/** Atribución de las teselas (va en la esquina del mapa, como pide OpenStreetMap). */
export const ATRIBUCION_WAZE = '© <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
