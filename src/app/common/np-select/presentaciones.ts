import { InsigniaSelect, PresentacionSelect } from './np-select.component';

/**
 * Las redes del router (getLanSegments) en un np-select: el número de VLAN a
 * la izquierda, la red debajo del nombre y, a la derecha, cuántos clientes
 * tiene con una barra frente a la VLAN que más tiene.
 */
export const PRESENTACION_REDES: PresentacionSelect = {
  // Se compara por la interfaz y su red: el borrador del alta guarda otra copia
  // del objeto, y una VLAN puede tener dos redes (vlan10 con la .10 y la .11).
  clave: r => `${r?.names ?? ''}|${r?.network ?? ''}`,
  etiqueta: r => r?.names ?? '',
  // El motivo de "otra" ya lo dice la insignia: abajo va la red (o las redes) y el comentario del router.
  detalle: r => [r?.redes?.length > 1 ? r.redes.join(' · ') : r?.network, r?.comentario].filter(Boolean).join(' · '),
  prefijo: r => (r?.vlan_id ? String(r.vlan_id) : 'LAN'),
  grupo: r => (r?.tipo === 'otra' ? 'Otras redes del router' : 'Redes de clientes'),
  atenuada: r => r?.tipo === 'otra',
  buscarEn: r => [r?.names, ...(r?.redes ?? [r?.network]), r?.comentario, r?.vlan_id].filter(Boolean).join(' '),
  insignia: (r, todas) => {
    if (r?.tipo === 'otra') return { texto: 'No es de clientes', tono: 'warn' };

    const n = Number(r?.clientes ?? 0);
    if (!n) return r?.tipo === 'clientes' ? { texto: 'Sin clientes aún', tono: 'neutral' } : null;

    const mayor = Math.max(1, ...todas.map(x => Number(x?.clientes ?? 0)));
    return { texto: `${n} ${n === 1 ? 'cliente' : 'clientes'}`, tono: 'ok', proporcion: n / mayor };
  },
};

/**
 * Las IP de un segmento (getIpAvalibles): las libres con su último número
 * destacado; las ocupadas sólo al buscar, con quién las tiene y sin poder
 * elegirlas. En el ngModel queda la IP en texto, como en el select anterior.
 */
export const PRESENTACION_IPS: PresentacionSelect = {
  valor: o => o?.ip,
  etiqueta: o => o?.ip ?? '',
  prefijo: o => '.' + String(o?.ip ?? '').split('.').pop(),
  detalle: o => (o?.estado === 'libre' ? null : o?.detalle),
  insignia: o => {
    switch (o?.estado) {
      case 'libre':   return { texto: 'Libre', tono: 'ok' };
      case 'cliente': return { texto: 'Asignada', tono: 'warn' };
      case 'arp':     return { texto: 'En uso', tono: 'warn' };
      default:        return { texto: 'Gateway', tono: 'neutral' };
    }
  },
  grupo: o => (o?.estado === 'libre' ? 'Libres' : 'Ocupadas'),
  deshabilitada: o => o?.estado !== 'libre',
  soloAlBuscar: o => o?.estado !== 'libre',
  buscarEn: o => `${o?.ip ?? ''} ${o?.detalle ?? ''}`,
  relevancia: (o, q) => {
    const ip = String(o?.ip ?? '');
    const b = q.replace(/^\./, '');
    if (ip === b) return 4;
    if (ip.endsWith('.' + b)) return 3;
    if (ip.split('.').pop()!.startsWith(b)) return 2;
    return o?.estado === 'libre' ? 1 : 0;
  },
};

/**
 * Una fila por interfaz: getLanSegments devuelve una por cada red del router y
 * una VLAN con dos redes salía dos veces con el mismo nombre. Queda la primera
 * con la lista de sus redes (redes) y los clientes sumados; la red se elige
 * después, con las IP.
 */
export function agruparRedesPorInterfaz(filas: any[]): any[] {
  const porNombre = new Map<string, any>();

  for (const f of filas ?? []) {
    const ya = porNombre.get(f?.names);
    if (!ya) {
      porNombre.set(f?.names, { ...f, redes: [f?.network].filter(Boolean) });
      continue;
    }
    if (f?.network && !ya.redes.includes(f.network)) ya.redes.push(f.network);
    ya.clientes = Number(ya.clientes ?? 0) + Number(f?.clientes ?? 0);
    if (f?.tipo === 'clientes') ya.tipo = 'clientes';
  }

  return [...porNombre.values()];
}

/**
 * Como PRESENTACION_IPS, pero las IP que están en el router sin cliente de la
 * plataforma se ven sin buscar, en su propio grupo, y se pueden elegir: al
 * guardar se reutiliza esa entrada del router.
 */
export const PRESENTACION_IPS_ASIGNABLES: PresentacionSelect = {
  ...PRESENTACION_IPS,
  detalle: o => {
    if (o?.estado === 'libre') return null;
    if (o?.estado !== 'arp') return o?.detalle;
    return [o?.mac, o?.comment ? `«${o.comment}»` : null, o?.desactivada ? 'desactivada en el router' : null].filter(Boolean).join(' · ') || 'Sin datos en el router';
  },
  insignia: o => (o?.estado === 'arp' ? { texto: 'Sin cliente', tono: 'info' } : PRESENTACION_IPS.insignia!(o, [])),
  grupo: o => (o?.estado === 'libre' ? 'Libres' : o?.estado === 'arp' ? 'En el router, sin cliente en la plataforma' : 'Ocupadas'),
  deshabilitada: o => o?.estado !== 'libre' && o?.estado !== 'arp',
  soloAlBuscar: o => o?.estado !== 'libre' && o?.estado !== 'arp',
  buscarEn: o => `${o?.ip ?? ''} ${o?.detalle ?? ''} ${o?.mac ?? ''}`,
};

const SIN_HUERFANAS = new Map<string, any>();

/**
 * Arma las opciones de IP a partir de la lista de libres que ya usa la
 * pantalla, recordando las ocupadas que llegaron con ella. Se guarda por
 * referencia: mientras la lista no cambie, el selector recibe el mismo arreglo.
 */
export class OpcionesDeIps {
  private ocupadas = new WeakMap<object, any[]>();
  private cache = new WeakMap<object, any[]>();
  private huerfanasCache = new WeakMap<object, Map<string, any>>();

  /** Guarda las ocupadas de esta respuesta y devuelve la misma lista de libres. */
  recordar<T extends object>(libres: T, ocupadas: any[] | null | undefined): T {
    this.ocupadas.set(libres, ocupadas ?? []);
    return libres;
  }

  /** Las IP que llegaron con esta lista y están en el router sin cliente de la plataforma, por IP. */
  huerfanas(libres: any[] | null | undefined): Map<string, any> {
    if (!libres) return SIN_HUERFANAS;
    let mapa = this.huerfanasCache.get(libres);
    if (!mapa) {
      mapa = new Map((this.ocupadas.get(libres) ?? []).filter(o => o?.estado === 'arp').map(o => [o.ip, o] as [string, any]));
      this.huerfanasCache.set(libres, mapa);
    }
    return mapa;
  }

  de(libres: any[] | null | undefined): any[] {
    if (!libres) return [];
    let opciones = this.cache.get(libres);
    if (!opciones) {
      opciones = [
        ...libres.map(i => ({ ip: typeof i === 'string' ? i : (i?.id ?? i?.ip), estado: 'libre' })),
        ...(this.ocupadas.get(libres) ?? []),
      ];
      this.cache.set(libres, opciones);
    }
    return opciones;
  }
}

// ── Genéricas ──────────────────────────────────────────────────────────────

/** La misma presentación, pero guardando otro dato en el ngModel (por ejemplo el id en texto, como hacía [value]). */
export function conValor<T = any>(p: PresentacionSelect<T>, valor: (o: T) => unknown): PresentacionSelect<T> {
  return { ...p, valor };
}

/** Opción escrita en el componente (listas fijas): { valor, etiqueta, detalle?, prefijo?, insignia?, grupo?, deshabilitada? }. */
export interface OpcionSimple {
  valor: unknown;
  etiqueta: string;
  detalle?: string | null;
  prefijo?: string | null;
  insignia?: string | InsigniaSelect | null;
  grupo?: string | null;
  deshabilitada?: boolean;
}

export const PRESENTACION_SIMPLE: PresentacionSelect<OpcionSimple> = {
  valor: o => o?.valor,
  etiqueta: o => o?.etiqueta ?? String(o?.valor ?? ''),
  detalle: o => o?.detalle,
  prefijo: o => o?.prefijo,
  insignia: o => (typeof o?.insignia === 'string' ? { texto: o.insignia, tono: 'neutral' } : (o?.insignia ?? null)),
  grupo: o => o?.grupo,
  deshabilitada: o => !!o?.deshabilitada,
  buscarEn: o => [o?.etiqueta, o?.detalle, o?.valor].filter(v => v != null).join(' '),
};

/** Cantidad por página: 25 → "25 por página". Guarda el número. */
export const PRESENTACION_POR_PAGINA: PresentacionSelect<number> = {
  valor: n => n,
  etiqueta: n => `${n} por página`,
};

/** Textos sueltos (categorías, bancos, puertos): la opción es el texto y se guarda tal cual. */
export const PRESENTACION_TEXTOS: PresentacionSelect<string | number> = {
  valor: t => t,
  etiqueta: t => String(t ?? ''),
};

// ── De la plataforma ───────────────────────────────────────────────────────

const PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const capital = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const nombreDePersona = (o: any) =>
  [o?.names ?? o?.first_name ?? o?.name ?? o?.nombre ?? '', o?.lastname ?? o?.last_name ?? ''].join(' ').replace(/\s+/g, ' ').trim();
const iniciales = (t: string) => t.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

/**
 * Planes de internet: velocidad, tipo y precio mensual. Sirve con el plan
 * completo (plan_name, download_speed, monthly_price…) o sólo { id, names }.
 */
export const PRESENTACION_PLANES: PresentacionSelect = {
  clave: p => p?.id,
  etiqueta: p => p?.plan_name ?? p?.names ?? p?.name ?? '',
  prefijo: p => (p?.download_speed ? `${p.download_speed}M` : null),
  detalle: p => {
    const bajada = p?.bajada_mbps ?? p?.download_speed;
    const subida = p?.subida_mbps ?? p?.upload_speed;
    const velocidad = bajada ? `${bajada}↓ ${subida ?? bajada}↑ Mb` : null;
    // "200MB" en la descripción repite la velocidad: sólo se muestra si dice otra cosa.
    const descripcion = p?.description && !/^\s*\d+\s*m?b?\s*$/i.test(p.description) ? p.description : null;
    return [velocidad, p?.type ? capital(p.type) : null, descripcion].filter(Boolean).join(' · ') || null;
  },
  insignia: p => (p?.monthly_price != null && p.monthly_price !== ''
    ? { texto: `${PESOS.format(Number(p.monthly_price))}/mes`, tono: 'info' }
    : null),
  grupo: p => (p?.type ? capital(p.type) : null),
  atenuada: p => p?.active === 0 || p?.active === false,
  buscarEn: p => [p?.plan_name ?? p?.names, p?.download_speed, p?.type, p?.description, p?.monthly_price].filter(Boolean).join(' '),
};

/** Routers MikroTik (conection_routers): nombre, IP y puerto de la API. */
export const PRESENTACION_ROUTERS: PresentacionSelect = {
  clave: r => r?.id,
  etiqueta: r => r?.name || r?.host || (r?.id ? `Router ${r.id}` : ''),
  detalle: r => (r?.host ? `${r.host}${r?.port ? ':' + r.port : ''}` : (r?.ip_address ?? null)),
  buscarEn: r => [r?.name, r?.host, r?.ip_address].filter(Boolean).join(' '),
};

const MARCAS: Record<string, string> = { huawei: 'HW', zte: 'ZTE', 'c-data': 'CD', cdata: 'CD', vsol: 'VS', fiberhome: 'FH', nokia: 'NK' };

/** OLT: marca abreviada, modelo, IP y si se entra por jump host. */
export const PRESENTACION_OLTS: PresentacionSelect = {
  clave: o => o?.id,
  etiqueta: o => o?.name ?? '',
  prefijo: o => (o?.brand ? (MARCAS[String(o.brand).toLowerCase()] ?? String(o.brand).slice(0, 3).toUpperCase()) : null),
  detalle: o => [o?.model, o?.host].filter(Boolean).join(' · ') || null,
  insignia: o => (o?.access_mode === 'jump' ? { texto: 'Por jump host', tono: 'neutral' } : null),
  buscarEn: o => [o?.name, o?.brand, o?.model, o?.host].filter(Boolean).join(' '),
};

/** Personas (técnicos, staff, empleados, clientes): iniciales, nombre y un dato para distinguirlas. */
export const PRESENTACION_PERSONAS: PresentacionSelect = {
  clave: o => o?.user_id ?? o?.id,
  etiqueta: o => nombreDePersona(o) || o?.email || '',
  prefijo: o => iniciales(nombreDePersona(o) || o?.email || '?'),
  detalle: o => o?.job_title ?? o?.cargo ?? o?.profile_name ?? o?.email ?? (o?.dni ? `CC ${o.dni}` : null),
  buscarEn: o => [nombreDePersona(o), o?.email, o?.dni, o?.phone, o?.job_title].filter(Boolean).join(' '),
};

/** Métodos de pago. */
export const PRESENTACION_METODOS_PAGO: PresentacionSelect = {
  clave: m => m?.id,
  etiqueta: m => m?.name ?? '',
  insignia: m => (m?.active === false || m?.active === 0 ? { texto: 'Inactivo', tono: 'neutral' } : null),
  atenuada: m => m?.active === false || m?.active === 0,
};

/** Líneas de WhatsApp Web: número y si está conectada. */
export const PRESENTACION_LINEAS_WA: PresentacionSelect = {
  clave: i => i?.instanceId ?? i?.id,
  etiqueta: i => i?.name ?? i?.instanceId ?? '',
  detalle: i => i?.phone ?? i?.instanceId ?? null,
  insignia: i => {
    const estado = i?.connected === true ? 'connected' : i?.status;
    if (estado === 'connected') return { texto: 'Conectada', tono: 'ok' };
    if (estado === 'waiting_qr' || i?.hasQR) return { texto: 'Esperando QR', tono: 'warn' };
    return { texto: 'Desconectada', tono: 'neutral' };
  },
  buscarEn: i => [i?.name, i?.phone, i?.instanceId].filter(Boolean).join(' '),
};

/** Segmentos de red: la red, la máscara y la puerta de enlace. */
export const PRESENTACION_SEGMENTOS: PresentacionSelect = {
  clave: s => s?.network,
  etiqueta: s => s?.network ?? '',
  prefijo: s => s?.mask ?? (s?.network?.includes('/') ? '/' + s.network.split('/')[1] : null),
  detalle: s => (s?.gateway ? `Puerta de enlace ${s.gateway}` : null),
};
