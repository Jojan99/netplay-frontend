/**
 * La OLT elegida, compartida por todas las pestañas del módulo OLT.
 *
 * Cada pantalla elegía la primera de la lista al abrirse: se elegía una OLT en
 * "Estado", se pasaba a "Autorizadas" y volvía a estar la otra. Se recuerda en
 * el navegador y cada pantalla arranca con la última elegida.
 */
const CLAVE = 'np_olt_elegida';

export const OltElegida = {
  /** La última elegida si sigue en la lista; si no, la primera. */
  de(olts: { id: number }[]): number | null {
    if (!olts?.length) return null;

    let guardada: number | null = null;
    try { guardada = Number(localStorage.getItem(CLAVE)) || null; } catch { /* sin almacenamiento */ }

    return olts.some(o => o.id === guardada) ? guardada : olts[0].id;
  },

  /** La OLT de la lista que corresponde a la elegida (o la primera). */
  objeto<T extends { id: number }>(olts: T[]): T | undefined {
    const id = this.de(olts);
    return olts.find(o => o.id === id) ?? olts[0];
  },

  guardar(id: number | null | undefined): void {
    if (!id) return;
    try { localStorage.setItem(CLAVE, String(id)); } catch { /* sin almacenamiento */ }
  },
};
