/**
 * Cómo es el panel frontal de cada MikroTik.
 *
 * Se dibuja el equipo en vez de mostrar una foto: así los puertos se pintan
 * con el estado real que reporta el router y se ve de un vistazo cuáles están
 * conectados. Una foto sería sólo decoración.
 *
 * `puertos` va en el orden físico, de izquierda a derecha. El nombre es el que
 * usa RouterOS, que es como llegan las interfaces.
 */

export type TipoPuerto = 'eth' | 'poe' | 'sfp' | 'sfp+' | 'sfp28' | 'qsfp' | 'combo';

export interface Puerto {
  nombre: string;
  tipo: TipoPuerto;
  /** Etiqueta corta bajo el puerto; si falta se usa el número. */
  label?: string;
}

export interface ModeloMikrotik {
  /** Como lo reporta board-name. */
  id: string;
  nombre: string;
  familia: 'rack' | 'escritorio' | 'switch';
  /** Alto en unidades de rack, para el dibujo. */
  u?: number;
  descripcion: string;
  puertos: Puerto[];
}

/** Genera ether1..N, sfp1..N, etc. sin repetir la lista a mano. */
function serie(prefijo: string, desde: number, hasta: number, tipo: TipoPuerto): Puerto[] {
  const salida: Puerto[] = [];
  for (let i = desde; i <= hasta; i++) salida.push({ nombre: `${prefijo}${i}`, tipo, label: String(i) });
  return salida;
}

export const MODELOS: ModeloMikrotik[] = [
  // ── Cloud Core Router ───────────────────────────────────────────────────
  {
    id: 'CCR1036-12G-4S',
    nombre: 'CCR1036-12G-4S',
    familia: 'rack', u: 1,
    descripcion: '36 núcleos · 12 Gigabit + 4 SFP',
    puertos: [...serie('ether', 1, 12, 'eth'), ...serie('sfp', 1, 4, 'sfp')],
  },
  {
    id: 'CCR1036-12G-4S-EM',
    nombre: 'CCR1036-12G-4S-EM',
    familia: 'rack', u: 1,
    descripcion: '36 núcleos · 12 Gigabit + 4 SFP · 16 GB',
    puertos: [...serie('ether', 1, 12, 'eth'), ...serie('sfp', 1, 4, 'sfp')],
  },
  {
    id: 'CCR1036-8G-2S+',
    nombre: 'CCR1036-8G-2S+',
    familia: 'rack', u: 1,
    descripcion: '36 núcleos · 8 Gigabit + 2 SFP+',
    puertos: [...serie('ether', 1, 8, 'eth'), ...serie('sfp-sfpplus', 1, 2, 'sfp+')],
  },
  {
    id: 'CCR1016-12G',
    nombre: 'CCR1016-12G',
    familia: 'rack', u: 1,
    descripcion: '16 núcleos · 12 Gigabit',
    puertos: serie('ether', 1, 12, 'eth'),
  },
  {
    id: 'CCR1009-7G-1C-1S+',
    nombre: 'CCR1009-7G-1C-1S+',
    familia: 'rack', u: 1,
    descripcion: '9 núcleos · 7 Gigabit + combo + SFP+',
    puertos: [
      ...serie('ether', 1, 7, 'eth'),
      { nombre: 'combo1', tipo: 'combo', label: 'C' },
      { nombre: 'sfp-sfpplus1', tipo: 'sfp+', label: 'S+' },
    ],
  },
  {
    id: 'CCR1072-1G-8S+',
    nombre: 'CCR1072-1G-8S+',
    familia: 'rack', u: 1,
    descripcion: '72 núcleos · 1 Gigabit + 8 SFP+',
    puertos: [
      { nombre: 'ether1', tipo: 'eth', label: '1' },
      ...serie('sfp-sfpplus', 1, 8, 'sfp+'),
    ],
  },
  {
    id: 'CCR2004-1G-12S+2XS',
    nombre: 'CCR2004-1G-12S+2XS',
    familia: 'rack', u: 1,
    descripcion: '1 Gigabit + 12 SFP+ + 2 SFP28',
    puertos: [
      { nombre: 'ether1', tipo: 'eth', label: '1' },
      ...serie('sfp-sfpplus', 1, 12, 'sfp+'),
      ...serie('sfp28-', 1, 2, 'sfp28'),
    ],
  },
  {
    id: 'CCR2116-12G-4S+',
    nombre: 'CCR2116-12G-4S+',
    familia: 'rack', u: 1,
    descripcion: '16 núcleos · 13 Gigabit + 4 SFP+',
    puertos: [...serie('ether', 1, 13, 'eth'), ...serie('sfp-sfpplus', 1, 4, 'sfp+')],
  },

  // ── Cloud Router Switch ─────────────────────────────────────────────────
  {
    id: 'CRS326-24G-2S+',
    nombre: 'CRS326-24G-2S+',
    familia: 'switch', u: 1,
    descripcion: '24 Gigabit + 2 SFP+',
    puertos: [...serie('ether', 1, 24, 'eth'), ...serie('sfp-sfpplus', 1, 2, 'sfp+')],
  },
  {
    id: 'CRS328-24P-4S+',
    nombre: 'CRS328-24P-4S+',
    familia: 'switch', u: 1,
    descripcion: '24 Gigabit PoE+ + 4 SFP+',
    puertos: [...serie('ether', 1, 24, 'poe'), ...serie('sfp-sfpplus', 1, 4, 'sfp+')],
  },
  {
    id: 'CRS309-1G-8S+',
    nombre: 'CRS309-1G-8S+',
    familia: 'switch',
    descripcion: '1 Gigabit + 8 SFP+',
    puertos: [
      { nombre: 'ether1', tipo: 'eth', label: '1' },
      ...serie('sfp-sfpplus', 1, 8, 'sfp+'),
    ],
  },
  {
    id: 'CRS112-8G-4S',
    nombre: 'CRS112-8G-4S',
    familia: 'switch',
    descripcion: '8 Gigabit + 4 SFP',
    puertos: [...serie('ether', 1, 8, 'eth'), ...serie('sfp', 1, 4, 'sfp')],
  },

  // ── RouterBOARD ─────────────────────────────────────────────────────────
  {
    id: 'RB5009UG+S+',
    nombre: 'RB5009UG+S+',
    familia: 'escritorio',
    descripcion: '7 Gigabit + 2.5G + SFP+',
    puertos: [...serie('ether', 1, 8, 'eth'), { nombre: 'sfp-sfpplus1', tipo: 'sfp+', label: 'S+' }],
  },
  {
    id: 'RB4011iGS+',
    nombre: 'RB4011iGS+',
    familia: 'escritorio',
    descripcion: '10 Gigabit + SFP+',
    puertos: [...serie('ether', 1, 10, 'eth'), { nombre: 'sfp-sfpplus1', tipo: 'sfp+', label: 'S+' }],
  },
  {
    id: 'RB2011UiAS-2HnD',
    nombre: 'RB2011UiAS',
    familia: 'escritorio',
    descripcion: '5 Fast + 5 Gigabit + SFP',
    puertos: [...serie('ether', 1, 10, 'eth'), { nombre: 'sfp1', tipo: 'sfp', label: 'S' }],
  },
  {
    id: 'RB760iGS',
    nombre: 'hEX S (RB760iGS)',
    familia: 'escritorio',
    descripcion: '5 Gigabit + SFP',
    puertos: [...serie('ether', 1, 5, 'eth'), { nombre: 'sfp1', tipo: 'sfp', label: 'S' }],
  },
  {
    id: 'RB750Gr3',
    nombre: 'hEX (RB750Gr3)',
    familia: 'escritorio',
    descripcion: '5 Gigabit',
    puertos: serie('ether', 1, 5, 'eth'),
  },
  {
    id: 'RBD52G-5HacD2HnD',
    nombre: 'hAP ac²',
    familia: 'escritorio',
    descripcion: '5 Gigabit · Wi-Fi doble banda',
    puertos: serie('ether', 1, 5, 'eth'),
  },
];

/**
 * Busca el modelo por board-name.
 *
 * RouterOS a veces devuelve variantes ("CCR1036-12G-4S-EM", "RB750Gr3"), así
 * que si no hay coincidencia exacta se prueba por prefijo antes de rendirse.
 */
export function buscarModelo(boardName: string | null | undefined): ModeloMikrotik | null {
  const board = (boardName ?? '').trim();
  if (!board) return null;

  const exacto = MODELOS.find(m => m.id.toLowerCase() === board.toLowerCase());
  if (exacto) return exacto;

  // El más específico que sea prefijo del board, para que CCR1036-12G-4S-EM
  // no caiga en CCR1036-12G-4S si existe su propia entrada.
  const porPrefijo = MODELOS
    .filter(m => board.toLowerCase().startsWith(m.id.toLowerCase()))
    .sort((a, b) => b.id.length - a.id.length);

  return porPrefijo[0] ?? null;
}
