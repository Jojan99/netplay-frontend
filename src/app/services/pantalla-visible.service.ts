import { Injectable, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Cuánto de la pantalla se ve de verdad, para las ventanas en el teléfono.
 *
 * Una ventana «fija a toda la pantalla» (position: fixed; inset: 0) se mide contra la caja del
 * navegador, y en muchos teléfonos —los Samsung sobre todo— esa caja es más alta que lo visible:
 * debajo quedan la barra de herramientas del navegador, la de direcciones o el teclado. La ventana
 * sube desde abajo, así que sus botones (Guardar, Registrar) caían justo en esa franja tapada.
 *
 * Aquí se le pregunta al navegador por el área realmente visible (visualViewport) y se deja en dos
 * variables de CSS: «--vv-alto» y «--vv-arriba». El tema ubica las ventanas con ellas, de modo que
 * terminan donde termina lo que el usuario ve, también con el teclado abierto.
 */
@Injectable({ providedIn: 'root' })
export class PantallaVisibleService {
  private pendiente = false;
  private observado: Element | null = null;
  private tamano: ResizeObserver | null = null;
  private pedir: (() => void) | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: object, private zone: NgZone) {}

  iniciar(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const vv = window.visualViewport;
    const raiz = document.documentElement;

    const medir = () => {
      this.pendiente = false;
      // Con la pantalla ampliada con los dedos lo visible es un recorte: no se toca nada.
      if (vv && vv.scale > 1.01) return;
      let arriba = Math.max(0, vv?.offsetTop ?? 0);
      let abajo = arriba + (vv?.height ?? window.innerHeight);

      // En Safari del iPhone, una ventana que nace dentro del área central del panel (que es la
      // que se desplaza) queda RECORTADA por esa área aunque sea «fija a la pantalla»: el pie con
      // «Servicios operativos» le tapaba los botones. Por eso la ventana se acomoda dentro del
      // rectángulo del área central, que es lo que de verdad se pinta en todos los navegadores.
      const central = document.querySelector('main.app-platform');
      if (central) {
        const r = central.getBoundingClientRect();
        if (r.height > 120) {
          arriba = Math.max(arriba, r.top);
          abajo = Math.min(abajo, r.bottom);
        }
        if (central !== this.observado) {
          this.observado = central;
          this.tamano?.disconnect();
          this.tamano = new ResizeObserver(() => this.pedir?.());
          this.tamano.observe(central);
        }
      }

      raiz.style.setProperty('--vv-alto', `${Math.max(200, Math.round(abajo - arriba))}px`);
      raiz.style.setProperty('--vv-arriba', `${Math.round(arriba)}px`);
    };

    const pedir = () => {
      if (this.pendiente) return;
      this.pendiente = true;
      requestAnimationFrame(medir);
    };

    this.pedir = pedir;
    medir();
    this.reportarVentanas();

    this.zone.runOutsideAngular(() => {
      vv?.addEventListener('resize', pedir);
      vv?.addEventListener('scroll', pedir);
      window.addEventListener('resize', pedir);
      window.addEventListener('orientationchange', pedir);
    });
  }

  /**
   * TEMPORAL. En pantallas chicas, cada vez que se abre una ventana manda al servidor cómo quedó
   * ubicada de verdad en ese teléfono (tamaños y navegador, nada de lo escrito). Es para encontrar
   * por qué en algunos teléfonos el pie de la ventana queda fuera de la pantalla.
   */
  private reportarVentanas(): void {
    let enviados = 0;
    const vistas = new WeakSet<Element>();
    const caja = (e: Element | null | undefined) => { if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(','); };

    const reportar = (fondo: HTMLElement) => {
      if (enviados >= 12 || window.innerWidth > 900) return;
      enviados++;

      const vv = window.visualViewport;
      const raiz = document.documentElement;
      const ventana = fondo.querySelector<HTMLElement>('.np-modal, .pt-sheet') ?? (fondo.firstElementChild as HTMLElement | null);
      const cs = getComputedStyle(fondo);
      const botones = ventana ? Array.from(ventana.querySelectorAll<HTMLElement>('button.np-btn, a.np-btn')).filter(b => b.offsetParent) : [];
      const ultimo = botones[botones.length - 1];
      const atrapan: string[] = [];
      for (let e = fondo.parentElement; e; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (c.transform !== 'none' || c.filter !== 'none' || /paint|layout|strict|content/.test(c.contain) || c.willChange.includes('transform') || ((c as any).backdropFilter && (c as any).backdropFilter !== 'none')) atrapan.push(e.tagName + '.' + String(e.className).slice(0, 30));
      }
      const sonda = document.createElement('div');
      sonda.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100vh;visibility:hidden;pointer-events:none';
      document.body.appendChild(sonda);
      const vh = sonda.offsetHeight;
      sonda.style.height = '100dvh';
      const dvh = sonda.offsetHeight;
      sonda.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:1px;visibility:hidden;pointer-events:none';
      const fijoAbajo = Math.round(sonda.getBoundingClientRect().bottom);
      sonda.remove();

      const medidas = {
        navegador: navigator.userAgent,
        version: Array.from(document.scripts).map(x => x.src).filter(x => /main-/.test(x)).map(x => x.split('/').pop()).join(','),
        ventana: (ventana?.querySelector('h3, h2')?.textContent || '').trim().slice(0, 60),
        clases: ventana ? String(ventana.className).slice(0, 80) : null,
        inner: window.innerWidth + 'x' + window.innerHeight,
        outer: window.outerWidth + 'x' + window.outerHeight,
        pantalla: screen.width + 'x' + screen.height + ' @' + window.devicePixelRatio,
        vv: vv ? [Math.round(vv.width), Math.round(vv.height), Math.round(vv.offsetTop), Math.round(vv.pageTop), vv.scale.toFixed(2)].join(',') : 'no hay',
        doc: raiz.clientHeight + '/' + raiz.scrollHeight + ' scrollY ' + Math.round(window.scrollY),
        vh_dvh_fijoAbajo: vh + ',' + dvh + ',' + fijoAbajo,
        variables: raiz.style.getPropertyValue('--vv-alto') + ' / ' + raiz.style.getPropertyValue('--vv-arriba'),
        fondo: caja(fondo),
        fondo_css: [cs.position, cs.top, cs.bottom, cs.height, cs.alignItems, cs.overflowY].join(' | '),
        modal: caja(ventana),
        modal_css: ventana ? [getComputedStyle(ventana).maxHeight, getComputedStyle(ventana).display, getComputedStyle(ventana).overflowY].join(' | ') : null,
        modal_alto_contenido: ventana ? ventana.clientHeight + '/' + ventana.scrollHeight : null,
        ultimo_boton: ultimo ? (ultimo.textContent || '').trim().slice(0, 30) + ' ' + caja(ultimo) : 'no hay',
        pie: caja(ventana?.querySelector('.np-modal-foot, .iv-op-pie')),
        atrapan: atrapan.join(' > ') || 'ninguno',
        central: caja(document.querySelector('main.app-platform')),
        pie_del_panel: caja(document.querySelector('app-footer')),
        enfocado: document.activeElement?.tagName ?? null,
        modo: (window.matchMedia('(display-mode: standalone)').matches ? 'app instalada' : 'navegador') + ' · ' + (screen.orientation?.type ?? ''),
      };

      const token = (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
      fetch('/api/diagnostico/pantalla', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ medidas }), keepalive: true }).catch(() => {});
    };

    this.zone.runOutsideAngular(() => {
      new MutationObserver(() => {
        document.querySelectorAll<HTMLElement>('.np-overlay, .pt-overlay').forEach(f => {
          if (vistas.has(f)) return;
          vistas.add(f);
          // Al abrirse una ventana el pie del panel se esconde y el área central crece: se vuelve a medir.
          this.pedir?.();
          setTimeout(() => this.pedir?.(), 80);
          setTimeout(() => this.pedir?.(), 400);
          // Dos medidas: recién abierta y un momento después (teclado, cámara, animación).
          setTimeout(() => { if (f.isConnected) reportar(f); }, 500);
          setTimeout(() => { if (f.isConnected) reportar(f); }, 3500);
        });
      }).observe(document.body, { childList: true, subtree: true });
    });
  }
}
