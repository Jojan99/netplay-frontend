import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface EmpresaDelSitio {
  nombre: string;
  subdominio: string;
  logo: string | null;
  activa: boolean;
}

export interface Sitio {
  plataforma: { nombre: string; dominio: string; subdominios_activos: boolean };
  /** plataforma: la raíz · empresa: netplay.netvula.com · desconocida: un subdominio sin empresa */
  tipo: 'plataforma' | 'empresa' | 'desconocida';
  empresa: EmpresaDelSitio | null;
}

/** Un cupón de descuento o el código de referido de otra empresa. */
export interface CodigoRevisado {
  tipo: 'cupon' | 'referido' | null;
  valido: boolean;
  detalle: string;
}

export interface Disponibilidad {
  subdominio: string;
  disponible: boolean;
  direccion: string;
  mensaje: string;
}

/**
 * Desde qué dirección se abrió la plataforma: la raíz (página pública y
 * registro) o el subdominio de una empresa, con su nombre y su logo para el
 * login del panel y del portal.
 */
@Injectable({ providedIn: 'root' })
export class SitioService {
  private http = inject(HttpClient);
  private base = `${environment.rootUrl}api/plataforma/`;
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly sitio = signal<Sitio | null>(null);

  private pedidos = new Map<string, Observable<Sitio>>();

  /**
   * @param empresa en la raíz, el subdominio de una empresa (?empresa=netplay):
   *                muestra su marca sin necesitar el DNS del subdominio.
   */
  cargar(empresa = ''): Observable<Sitio> {
    // En el prerender no hay a quién preguntar: la petición iba al dominio de
    // respaldo, no respondía y el build quedaba esperando para siempre.
    if (!this.enNavegador) return of(this.porDefecto());

    const clave = empresa.trim().toLowerCase();
    const existente = this.pedidos.get(clave);
    if (existente) return existente;

    const pedido = this.http.get<any>(this.base + 'sitio', { params: clave ? { empresa: clave } : {} }).pipe(
      map(r => r?.data as Sitio),
      // Sin respuesta se sigue como la raíz: el login funciona igual, sólo sin la marca.
      catchError(() => of(this.porDefecto())),
      tap(s => this.sitio.set(s)),
      shareReplay(1),
    );

    this.pedidos.set(clave, pedido);
    return pedido;
  }

  planes(): Observable<any> {
    return this.http.get<any>(this.base + 'planes').pipe(map(r => r?.data));
  }

  disponible(subdominio: string): Observable<Disponibilidad> {
    return this.http.get<any>(this.base + 'subdominio/disponible', { params: { s: subdominio } }).pipe(
      map(r => ({ ...(r?.data ?? {}), mensaje: r?.message ?? '' }) as Disponibilidad),
      catchError(() => of({ subdominio, disponible: false, direccion: '', mensaje: 'No pudimos revisar la dirección. Probá de nuevo.' })),
    );
  }

  /**
   * ¿Sirve este código? Puede ser un cupón o el código de referido de otra
   * empresa; la respuesta dice cuál es y qué da.
   */
  codigo(codigo: string): Observable<CodigoRevisado> {
    return this.http.get<any>(this.base + 'codigo', { params: { c: codigo } }).pipe(
      map(r => (r?.data ?? { tipo: null, valido: false, detalle: r?.message ?? '' }) as CodigoRevisado),
      catchError(() => of({ tipo: null, valido: false, detalle: 'No pudimos revisar el código. Probá de nuevo.' } as CodigoRevisado)),
    );
  }

  /** La dirección de la raíz de la plataforma (https://netvula.com). */
  raiz(s: Sitio | null): string {
    const dominio = s?.plataforma?.dominio;
    return dominio ? `https://${dominio}` : '';
  }

  private porDefecto(): Sitio {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return { plataforma: { nombre: 'Netvula', dominio: host, subdominios_activos: false }, tipo: 'plataforma', empresa: null };
  }
}
