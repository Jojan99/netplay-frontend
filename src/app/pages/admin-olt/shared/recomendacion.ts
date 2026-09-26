/**
 * La observación con la que nace un ticket abierto desde la red.
 *
 * El técnico que recibe el ticket no ve la pantalla desde la que se creó: si
 * la observación dice «revisar», va a ir a mirar de qué se trata. Si dice
 * «promedio -30,5 dBm, peor -31,5, puerto 0/1/3:12», sale con el reflectómetro
 * y sabe dónde empezar.
 *
 * Todas las pantallas de red arman el texto aquí para que digan lo mismo y para
 * que, cuando cambie el criterio, cambie en un solo lugar.
 */

/** Debajo de esto la óptica trabaja al filo (el mismo número que usa el backend). */
export const AL_BORDE = -26;

export interface DatosDeRed {
  cliente?: string | null;
  olt?: string | null;
  fsp?: string | null;
  ont_id?: number | string | null;
  serial?: string | null;
  /** Promedio de la potencia recibida, en dBm. Es el que manda. */
  rx_prom?: number | null;
  /** La peor lectura, como dato de apoyo. */
  rx_min?: number | null;
  /** Veces que el equipo se apagó y volvió. */
  caidas?: number | null;
  /** Porcentaje del tiempo que estuvo apagado (0–100). */
  apagado?: number | null;
  /** Texto ya armado (los avisos traen el suyo). */
  detalle?: string | null;
}

const dbm = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : `${Number(n).toFixed(1).replace('.', ',')} dBm`;

/** «0/1/3:12 de OLT NH», para que el técnico sepa a qué puerto ir. */
export function dondeEsta(d: DatosDeRed): string {
  const partes: string[] = [];
  if (d.fsp) partes.push(`puerto ${d.fsp}${d.ont_id !== null && d.ont_id !== undefined ? ':' + d.ont_id : ''}`);
  if (d.olt) partes.push(`OLT ${d.olt}`);
  if (d.serial) partes.push(`serial ${d.serial}`);
  return partes.join(' · ');
}

/**
 * Qué escribir en el ticket según lo que la red vio.
 *
 * Se elige UN motivo, el más grave, porque un ticket es una visita: si el
 * equipo está apagado no tiene sentido mandar a medir potencia.
 */
export function recomendacionDeRed(d: DatosDeRed): string {
  const donde = dondeEsta(d);
  const cola = donde ? `\n\nDónde: ${donde}.` : '';
  const apagado = d.apagado ?? null;
  const caidas = d.caidas ?? 0;
  const rx = d.rx_prom ?? d.rx_min ?? null;

  if (apagado !== null && apagado >= 85) {
    return (
      `El equipo figura apagado el ${Math.round(apagado)}% del tiempo en los últimos días.\n\n` +
      'Qué revisar: confirmar en sitio si el cliente sigue con el servicio. ' +
      'Si se mudó o se retiró, avisar para darlo de baja; si está, revisar energía y acometida.' +
      cola
    );
  }

  if (apagado !== null && apagado >= 50) {
    return (
      `El equipo pasa apagado el ${Math.round(apagado)}% del tiempo y el cliente no lo reportó.\n\n` +
      'Qué revisar: llamar antes de que llame él. Suele ser energía de la casa, fuente de la ONT o acometida floja.' +
      cola
    );
  }

  if (caidas >= 2) {
    return (
      `El equipo se desconectó y volvió ${caidas} ${caidas === 1 ? 'vez' : 'veces'}.\n\n` +
      'Qué revisar: acometida, roseta y empalmes, y la energía del cliente (tomacorriente y fuente de la ONT). ' +
      'Casi siempre es el cable de la casa, no la red.' +
      cola
    );
  }

  if (rx !== null && rx < AL_BORDE) {
    const peor = d.rx_min !== null && d.rx_min !== undefined && d.rx_min !== d.rx_prom
      ? ` (la peor lectura fue ${dbm(d.rx_min)})`
      : '';
    return (
      `Señal baja: potencia promedio ${dbm(d.rx_prom ?? d.rx_min)}${peor}, por debajo de los ${AL_BORDE} dBm.\n\n` +
      'Qué revisar: visita preventiva — conector sucio o mal pulido, curva forzada en la acometida, ' +
      'empalme flojo o splitter con pérdida. Limpiar y medir antes y después.' +
      cola
    );
  }

  if (d.detalle) {
    return `${d.detalle}${cola}`;
  }

  return (
    'Revisión de red pedida desde el panel de la OLT.\n\n' +
    `Estado medido: potencia ${dbm(d.rx_prom ?? d.rx_min)}, ${caidas} caída(s)` +
    (apagado !== null ? `, ${Math.round(apagado)}% apagado` : '') +
    '.' +
    cola
  );
}
