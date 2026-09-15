import { PresentacionSelect } from './np-select.component';

/**
 * Las redes del router (getLanSegments) en un np-select: el número de VLAN a
 * la izquierda, la red debajo del nombre y, a la derecha, cuántos clientes
 * tiene con una barra frente a la VLAN que más tiene.
 */
export const PRESENTACION_REDES: PresentacionSelect = {
  // Se compara por la interfaz: el borrador del alta guarda otra copia del objeto.
  clave: r => r?.names,
  etiqueta: r => r?.names ?? '',
  // El motivo de "otra" ya lo dice la insignia: abajo va la red y el comentario del router.
  detalle: r => [r?.network, r?.comentario].filter(Boolean).join(' · '),
  prefijo: r => (r?.vlan_id ? String(r.vlan_id) : 'LAN'),
  grupo: r => (r?.tipo === 'otra' ? 'Otras redes del router' : 'Redes de clientes'),
  atenuada: r => r?.tipo === 'otra',
  buscarEn: r => [r?.names, r?.network, r?.comentario, r?.vlan_id].filter(Boolean).join(' '),
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
 * Arma las opciones de IP a partir de la lista de libres que ya usa la
 * pantalla, recordando las ocupadas que llegaron con ella. Se guarda por
 * referencia: mientras la lista no cambie, el selector recibe el mismo arreglo.
 */
export class OpcionesDeIps {
  private ocupadas = new WeakMap<object, any[]>();
  private cache = new WeakMap<object, any[]>();

  /** Guarda las ocupadas de esta respuesta y devuelve la misma lista de libres. */
  recordar<T extends object>(libres: T, ocupadas: any[] | null | undefined): T {
    this.ocupadas.set(libres, ocupadas ?? []);
    return libres;
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
