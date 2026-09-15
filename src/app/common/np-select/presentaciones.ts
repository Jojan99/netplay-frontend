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
