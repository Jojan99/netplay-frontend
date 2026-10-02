import { Injectable, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DialogService } from './dialog.service';

/**
 * «¿Seguro que desea salir?» para los modales con formulario.
 *
 * Un clic fuera del modal, la tecla Escape o «Cancelar» lo cerraban sin más, y con ellos se iba lo
 * que el operador llevaba escrito: un cliente a medio crear, una orden de instalación, la
 * configuración de una OLT. Hay más de cien modales en el panel y todos se cierran igual
 * (`(click)="mostrar = false"` en el fondo), así que en vez de pedírselo a cada pantalla se hace
 * aquí, una sola vez, para todos.
 *
 * Cómo: se anota qué modal tiene algo diligenciado (el usuario escribió, eligió o marcó algo dentro)
 * y, cuando intenta cerrarlo, se detiene el clic antes de que llegue a la pantalla y se pregunta.
 * Si confirma, se repite el mismo gesto y la pantalla lo cierra como siempre.
 *
 * No cuenta como «diligenciado» lo que no se pierde: buscadores y filtros. Un modal que no deba
 * preguntar nunca lleva el atributo `data-sin-aviso`.
 */
@Injectable({ providedIn: 'root' })
export class SalidaSeguraService {
  /** Fondos de modal que el usuario ya tocó. Al desaparecer del DOM se olvidan solos. */
  private tocados = new WeakSet<Element>();
  /** El gesto que se está repitiendo tras confirmar: ese no se vuelve a preguntar. */
  private dejarPasar = false;
  private preguntando = false;

  private static readonly FONDOS = '.np-overlay:not(.np-overlay--top), .pt-overlay';
  private static readonly SALIR = /^(cancelar|cerrar|descartar|salir|×|✕)$/i;

  constructor(@Inject(PLATFORM_ID) private platformId: object, private zone: NgZone, private dialog: DialogService) {}

  iniciar(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // En fase de captura y sobre window: así se llega antes que el manejador de la pantalla.
    this.zone.runOutsideAngular(() => {
      window.addEventListener('input', e => this.anotar(e), true);
      window.addEventListener('change', e => this.anotar(e), true);
      window.addEventListener('click', e => this.alHacerClic(e), true);
      window.addEventListener('keydown', e => this.alTeclear(e), true);
    });
  }

  // ── Qué modal tiene algo diligenciado ─────────────────────────────────────

  private anotar(e: Event): void {
    if (!e.isTrusted) return;
    const campo = e.target as HTMLElement | null;
    const fondo = campo?.closest?.(SalidaSeguraService.FONDOS);
    if (!campo || !fondo || fondo.hasAttribute('data-sin-aviso') || this.esBuscador(campo)) return;

    this.tocados.add(fondo);
  }

  /** Lo que se escribe para buscar o filtrar no es un dato que se pierda. */
  private esBuscador(campo: HTMLElement): boolean {
    const el = campo as HTMLInputElement;
    if (el.type === 'search') return true;
    if (campo.closest('.nps-buscar, .np-search, [role="search"], [data-sin-aviso]')) return true;

    const pista = `${el.placeholder ?? ''} ${campo.getAttribute('aria-label') ?? ''} ${el.name ?? ''}`.toLowerCase();
    return /busca|filtr|search/.test(pista);
  }

  /** El modal desde el que se hizo el gesto, si hay algo que perder al cerrarlo. */
  private modalQuePregunta(desde: Element | null): Element | null {
    const fondo = desde?.closest?.(SalidaSeguraService.FONDOS) ?? null;
    if (!fondo || fondo.hasAttribute('data-sin-aviso')) return null;

    return this.tocados.has(fondo) || this.enCurso(fondo) ? fondo : null;
  }

  /**
   * ¿El modal está trabajando? Autorizar una ONT tarda minutos con el botón en «Autorizando…»:
   * cerrar ahí no pierde lo escrito, pierde de vista cómo terminó. Se reconoce por el botón
   * principal con puntos suspensivos o con el indicador de espera adentro.
   */
  private enCurso(fondo: Element): boolean {
    return Array.from(fondo.querySelectorAll('.np-btn--primary, .pt-btn--primary, .np-btn--danger-solid, button[type="submit"]'))
      .some(b => /(…|\.\.\.)\s*$/.test((b.textContent ?? '').trim()) || !!b.querySelector('.np-spinner'));
  }

  // ── Intentos de salir ─────────────────────────────────────────────────────

  private alHacerClic(e: MouseEvent): void {
    if (this.dejarPasar || !e.isTrusted) return;

    const destino = e.target as HTMLElement | null;

    // Elegir una opción de un selector propio (np-select) también es diligenciar: no dispara
    // «change» como un <select> del navegador.
    const opcion = destino?.closest?.('.nps-opcion');
    const suFondo = opcion?.closest(SalidaSeguraService.FONDOS);
    if (suFondo && !suFondo.hasAttribute('data-sin-aviso')) this.tocados.add(suFondo);

    const fondo = this.modalQuePregunta(destino);
    if (!destino || !fondo) return;

    const boton = destino.closest('button, a, [role="button"]') as HTMLElement | null;

    // Guardar: lo escrito ya no se pierde, se va a enviar.
    if (boton && (boton.getAttribute('type') === 'submit' || boton.classList.contains('np-btn--primary') || boton.classList.contains('pt-btn--primary'))) {
      this.tocados.delete(fondo);
      return;
    }

    const sale = destino === fondo || (!!boton && this.esBotonDeSalir(boton));
    if (!sale) return;

    this.frenar(e);
    this.preguntar(fondo, () => (destino === fondo ? fondo as HTMLElement : boton!).click());
  }

  private esBotonDeSalir(boton: HTMLElement): boolean {
    const etiqueta = (boton.getAttribute('aria-label') ?? boton.getAttribute('title') ?? '').trim();
    if (/^(cerrar|cancelar)\b/i.test(etiqueta)) return true;

    return SalidaSeguraService.SALIR.test((boton.textContent ?? '').trim());
  }

  private alTeclear(e: KeyboardEvent): void {
    if (this.dejarPasar || !e.isTrusted || e.key !== 'Escape') return;
    // La confirmación del sistema está abierta: Escape es sólo para ella. Si se dejara seguir,
    // la misma tecla cerraba la pregunta y, de paso, el modal de abajo con todo lo escrito.
    if (this.dialog.current() || this.dialog.currentChoice()) {
      this.frenar(e);
      this.zone.run(() => this.dialog.current() ? this.dialog.answer(false) : this.dialog.pick(null));
      return;
    }

    // El modal de más arriba es el último del documento.
    const fondos = Array.from(document.querySelectorAll(SalidaSeguraService.FONDOS));
    const fondo = this.modalQuePregunta(fondos.length ? fondos[fondos.length - 1] : null);
    if (!fondo) return;

    // Un selector desplegado dentro del modal: Escape lo cierra a él, no al modal.
    if (fondo.querySelector('.nps-panel')) return;

    const origen = (e.target as HTMLElement) ?? document.body;
    this.frenar(e);
    this.preguntar(fondo, () => origen.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })));
  }

  private frenar(e: Event): void {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  private preguntar(fondo: Element, repetir: () => void): void {
    if (this.preguntando) return;
    this.preguntando = true;

    this.zone.run(async () => {
      const mensaje = this.enCurso(fondo)
        ? 'Hay una operación en curso en esta ventana. Si sale ahora no verá cómo termina. ¿Seguro que desea salir?'
        : 'Hay datos diligenciados que no se han guardado. ¿Seguro que desea salir?';
      // La confirmación del sistema vive en el panel y en la consola; fuera de ahí, la del navegador.
      const salir = document.querySelector('app-dialog-host')
        ? await this.dialog.confirm(mensaje, { title: this.enCurso(fondo) ? 'Operación en curso' : 'Salir sin guardar', okLabel: 'Sí, salir', cancelLabel: 'Seguir aquí', danger: true })
        : window.confirm(mensaje);

      this.preguntando = false;
      if (!salir) return;

      this.tocados.delete(fondo);
      this.dejarPasar = true;
      try { repetir(); } finally { this.dejarPasar = false; }
    });
  }
}
