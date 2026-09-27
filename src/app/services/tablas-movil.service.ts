import { Injectable, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Las tablas del panel, en el teléfono.
 *
 * Con ocho columnas no se lee una fila en 390 px. El tema ya sabe convertir una tabla en tarjetas
 * (clase «np-tabla-movil», etiquetas en data-label), pero había que pedirlo tabla por tabla y en
 * cuarenta pantallas nadie lo pidió: la primera columna quedaba aplastada contra el borde.
 *
 * Este servicio lo hace solo, para toda tabla «np-table» que tenga encabezado: toma el nombre de cada
 * columna del <thead>, deja como título de la tarjeta la primera celda con contenido y baja las
 * acciones al pie. Una tabla que no deba volverse tarjeta lleva «np-no-movil».
 *
 * Las filas las crea Angular cuando llegan los datos, así que se observa el DOM y se etiquetan las que
 * van apareciendo. No hace falta comprobar el ancho de la pantalla: las etiquetas no se ven mientras
 * no haya tarjetas, y así sigue sirviendo si se gira el teléfono.
 */
@Injectable({ providedIn: 'root' })
export class TablasMovilService {
  private pendiente = false;

  constructor(@Inject(PLATFORM_ID) private platformId: object, private zone: NgZone) {}

  iniciar(): void {
    if (!isPlatformBrowser(this.platformId) || typeof MutationObserver === 'undefined') return;

    this.zone.runOutsideAngular(() => {
      const observador = new MutationObserver(() => this.programar());
      observador.observe(document.body, { childList: true, subtree: true });
      this.programar();
    });
  }

  /** Muchas mutaciones seguidas (una tabla de 50 filas) se atienden en una sola pasada. */
  private programar(): void {
    if (this.pendiente) return;
    this.pendiente = true;
    requestAnimationFrame(() => { this.pendiente = false; this.revisar(); });
  }

  private revisar(): void {
    document.querySelectorAll<HTMLTableElement>('table.np-table:not(.np-no-movil)').forEach(t => this.preparar(t));
  }

  private preparar(tabla: HTMLTableElement): void {
    const encabezados = Array.from(tabla.querySelectorAll<HTMLTableCellElement>('thead tr:last-child th'));
    if (encabezados.length < 3) return;   // con dos columnas la tabla se lee bien sola

    tabla.classList.add('np-tabla-movil');
    const etiquetas = encabezados.map(th => (th.textContent ?? '').replace(/\s+/g, ' ').trim());

    tabla.querySelectorAll<HTMLTableRowElement>('tbody > tr').forEach(fila => {
      if (fila.classList.contains('np-empty')) return;
      // Ya está etiquetada. Si todavía no tiene título (el texto llega después que la fila) se vuelve a mirar.
      if (fila.dataset['mv'] === String(fila.cells.length) && fila.querySelector('.es-principal, .es-ancha')) return;
      fila.dataset['mv'] = String(fila.cells.length);

      const celdas = Array.from(fila.cells);
      if (celdas.some(c => c.colSpan > 1)) { celdas.forEach(c => c.classList.add('es-ancha')); return; }

      let principal = celdas.some(c => c.classList.contains('es-principal'));
      celdas.forEach((celda, i) => {
        if (!celda.hasAttribute('data-label') && etiquetas[i]) celda.setAttribute('data-label', etiquetas[i]);

        const texto = (celda.textContent ?? '').trim();
        const soloAcciones = !etiquetas[i] && !texto && !!celda.querySelector('button, a');
        const esFranja = celda.classList.contains('np-stripe') || (!etiquetas[i] && !texto && !celda.querySelector('button, a, img, svg'));

        if (soloAcciones || (i === celdas.length - 1 && !etiquetas[i] && celda.querySelector('button, a'))) celda.classList.add('es-acciones');
        else if (!principal && !esFranja && texto) { celda.classList.add('es-principal'); principal = true; }
      });
    });
  }
}
