import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * Avisa cuando se publicó una versión nueva del panel.
 *
 * El navegador ya no se queda con el index viejo —nginx lo manda sin caché—,
 * así que cualquier recarga trae lo último. El problema es la pestaña que
 * queda abierta toda la tarde: esa no recarga nunca y sigue con la versión
 * del mediodía.
 *
 * Aquí se mira cada tanto si el archivo principal cambió de nombre. Cambia sólo
 * cuando cambia el contenido, así que si cambió es que hay algo nuevo. No se
 * recarga sola: se avisa y decide la persona, porque puede estar a mitad de un
 * formulario.
 */
@Injectable({ providedIn: 'root' })
export class ActualizacionService {
  private plataforma = inject(PLATFORM_ID);

  /** Hay una versión nueva esperando. */
  readonly hayNueva = signal(false);

  /** Cada cuánto se mira. Diez minutos: no es urgente y no molesta al servidor. */
  private static readonly CADA_MS = 10 * 60 * 1000;

  private mia: string | null = null;

  empezar(): void {
    if (!isPlatformBrowser(this.plataforma)) return;

    this.mia = this.laDeEstaPestana();
    if (!this.mia) return;

    setInterval(() => this.mirar(), ActualizacionService.CADA_MS);

    // Al volver a la pestaña también se mira: es cuando la persona vuelve a
    // trabajar y el momento más oportuno para avisarle.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.mirar();
    });
  }

  recargar(): void {
    if (isPlatformBrowser(this.plataforma)) location.reload();
  }

  /** El archivo principal que cargó esta pestaña. */
  private laDeEstaPestana(): string | null {
    const guiones = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'));
    const principal = guiones.map(g => g.src).find(src => /\/main-[A-Z0-9]+\.js/i.test(src));

    return principal ? (/main-[A-Z0-9]+\.js/i.exec(principal)?.[0] ?? null) : null;
  }

  private async mirar(): Promise<void> {
    if (this.hayNueva() || !this.mia) return;

    try {
      const r = await fetch('/index.html', { cache: 'no-store' });
      if (!r.ok) return;

      const publicada = /main-[A-Z0-9]+\.js/i.exec(await r.text())?.[0];
      if (publicada && publicada !== this.mia) this.hayNueva.set(true);
    } catch {
      // Sin conexión o el servidor no contestó: se vuelve a mirar después.
    }
  }
}
