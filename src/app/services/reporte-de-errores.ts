import { ErrorHandler, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

/**
 * Manda al servidor los errores que ocurren en el navegador.
 *
 * Una falla que sólo pasa en el teléfono o con los datos de alguien quedaba en
 * una consola que nadie abre. Se envían los primeros 20 distintos de cada carga
 * y se siguen mostrando en la consola como siempre.
 */
@Injectable()
export class ReporteDeErrores implements ErrorHandler {
  private enviados = 0;
  private vistos = new Set<string>();

  handleError(error: any): void {
    console.error(error);

    if (typeof window === 'undefined' || this.enviados >= 20) return;

    const mensaje = String(error?.message ?? error ?? 'Error sin mensaje').slice(0, 2000);
    if (this.vistos.has(mensaje)) return;
    this.vistos.add(mensaje);

    let token: string | null = null;
    try { token = localStorage.getItem('token'); } catch {}
    if (!token) return;

    this.enviados++;

    fetch(environment.rootUrl + 'api/management/errores-navegador', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        mensaje,
        pila: String(error?.stack ?? '').slice(0, 4000),
        ruta: location.pathname,
        ancho: window.innerWidth,
        navegador: navigator.userAgent.slice(0, 300),
      }),
    }).catch(() => {});
  }
}
