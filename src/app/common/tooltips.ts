import { Injectable, NgZone, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

/**
 * Tooltips de la plataforma: cualquier elemento con `title` (o `data-tip`)
 * muestra una etiqueta propia en vez del recuadro gris del navegador. No hay
 * que tocar ninguna pantalla: al pasar el mouse (o llegar con el teclado) el
 * `title` se pasa a `data-tip` para que el navegador no pinte el suyo, y se
 * muestra el nuestro arriba del elemento (o abajo si no entra).
 *
 * Los estilos están en theme/_tooltips.scss.
 */
@Injectable({ providedIn: 'root' })
export class TooltipsGlobales implements OnDestroy {
  private readonly doc = inject(DOCUMENT);
  private readonly zona = inject(NgZone);
  private readonly enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  private tip: HTMLDivElement | null = null;
  private texto: HTMLSpanElement | null = null;
  private actual: HTMLElement | null = null;
  private espera: ReturnType<typeof setTimeout> | null = null;
  /** Al que se le hizo clic: no vuelve a mostrar su tooltip hasta que el mouse salga. */
  private silenciado: HTMLElement | null = null;
  private quitar: Array<() => void> = [];

  private static readonly DEMORA_MS = 280;

  iniciar(): void {
    if (!this.enNavegador || this.tip) return;

    // Fuera de Angular: mover el mouse no dispara detección de cambios.
    this.zona.runOutsideAngular(() => {
      const tip = this.doc.createElement('div');
      tip.className = 'nv-tip';
      tip.setAttribute('role', 'tooltip');
      tip.id = 'nv-tip';
      this.texto = this.doc.createElement('span');
      tip.appendChild(this.texto);
      this.doc.body.appendChild(tip);
      this.tip = tip;

      this.escuchar('mouseover', e => this.entrar(e.target, false), true);
      this.escuchar('focusin', e => this.entrar(e.target, true), true);
      this.escuchar('mouseout', e => this.salirDe(e as MouseEvent), true);
      this.escuchar('focusout', () => this.ocultar(), true);
      this.escuchar('mousedown', e => { this.silenciado = this.conTip(e.target); this.ocultar(); }, true);
      this.escuchar('keydown', e => { if ((e as KeyboardEvent).key === 'Escape') this.ocultar(); }, true);
      this.escuchar('scroll', () => this.ocultar(), true);
      this.escuchar('wheel', () => this.ocultar(), { capture: true, passive: true });
    });
  }

  ngOnDestroy(): void {
    this.quitar.forEach(f => f());
    this.tip?.remove();
  }

  private escuchar(evento: string, fn: (e: Event) => void, opciones: boolean | AddEventListenerOptions): void {
    this.doc.addEventListener(evento, fn, opciones);
    this.quitar.push(() => this.doc.removeEventListener(evento, fn, opciones));
  }

  /** El elemento con tooltip más cercano; le saca el `title` para que el navegador no pinte el suyo. */
  private conTip(objetivo: EventTarget | null): HTMLElement | null {
    let el = objetivo instanceof Element ? (objetivo as HTMLElement) : null;

    while (el && el !== this.doc.body) {
      if (el instanceof HTMLElement) {
        const titulo = el.getAttribute('title');

        if (titulo !== null) {
          el.removeAttribute('title');
          if (titulo.trim()) {
            el.setAttribute('data-tip', titulo);
            // Si el título era lo único que lo nombraba (un botón con ícono), que lo siga nombrando.
            if (!el.hasAttribute('aria-label') && !el.textContent?.trim()) el.setAttribute('aria-label', titulo);
          }
        }

        if (el.getAttribute('data-tip')?.trim()) return el;
      }
      el = el.parentElement;
    }

    return null;
  }

  private entrar(objetivo: EventTarget | null, conTeclado: boolean): void {
    const el = this.conTip(objetivo);

    if (el === this.actual) return;
    this.ocultar();
    if (el !== this.silenciado) this.silenciado = null;
    if (!el || el === this.silenciado) return;

    this.actual = el;
    this.espera = setTimeout(() => this.mostrar(el), conTeclado ? 0 : TooltipsGlobales.DEMORA_MS);
  }

  private salirDe(e: MouseEvent): void {
    if (!this.actual) return;
    const hacia = e.relatedTarget as Node | null;
    if (hacia && this.actual.contains(hacia)) return;
    this.ocultar();
  }

  private mostrar(el: HTMLElement): void {
    const tip = this.tip;
    const texto = el.getAttribute('data-tip')?.trim();

    if (!tip || !this.texto || !texto || !el.isConnected) return;

    this.texto.textContent = texto;
    tip.classList.remove('is-visible', 'is-abajo');
    tip.style.left = '0px';
    tip.style.top = '0px';

    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const margen = 8;
    const vw = this.doc.documentElement.clientWidth;

    // Arriba del elemento; si no entra, abajo.
    let top = r.top - t.height - 10;
    const abajo = top < margen;
    if (abajo) top = r.bottom + 10;

    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(margen, Math.min(left, vw - t.width - margen));

    // La flecha apunta al centro del elemento aunque el tooltip se haya corrido.
    const flecha = Math.max(12, Math.min(r.left + r.width / 2 - left, t.width - 12));

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    tip.style.setProperty('--nv-tip-flecha', `${Math.round(flecha)}px`);
    tip.classList.toggle('is-abajo', abajo);
    el.setAttribute('aria-describedby', 'nv-tip');

    // Un cuadro después, para que la transición arranque desde la posición nueva.
    requestAnimationFrame(() => tip.classList.add('is-visible'));
  }

  private ocultar(): void {
    if (this.espera) { clearTimeout(this.espera); this.espera = null; }
    if (this.actual?.getAttribute('aria-describedby') === 'nv-tip') this.actual.removeAttribute('aria-describedby');
    this.actual = null;
    this.tip?.classList.remove('is-visible');
  }
}
