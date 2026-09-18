import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UsuarioConsola {
  id: number;
  nombre: string;
  email: string;
}

/**
 * La sesión de la consola de Netvula.
 *
 * Aparte de la del panel a propósito: otra clave en el navegador, otro token
 * y otra tabla de usuarios en el servidor. Un token del panel no sirve acá y
 * uno de la consola no sirve allá, así que no hay forma de terminar mirando
 * los datos de todas las empresas por haber entrado como administrador de una.
 */
@Injectable({ providedIn: 'root' })
export class ConsolaAuthService {
  private http = inject(HttpClient);
  private readonly base = environment.rootUrl + 'api/consola/';

  private readonly TOKEN = 'consola_token';
  private readonly USUARIO = 'consola_usuario';

  /** Las cabeceras de la consola. Nunca el token del panel. */
  cabeceras(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token() ?? ''}`,
    });
  }

  /** Para subir archivos: el Content-Type lo pone el navegador. */
  cabecerasArchivo(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.token() ?? ''}` });
  }

  token(): string | null {
    if (typeof window === 'undefined') return null;

    try { return localStorage.getItem(this.TOKEN); } catch { return null; }
  }

  usuario(): UsuarioConsola | null {
    if (typeof window === 'undefined') return null;

    try {
      const guardado = localStorage.getItem(this.USUARIO);
      return guardado ? JSON.parse(guardado) as UsuarioConsola : null;
    } catch { return null; }
  }

  estaDentro(): boolean { return !!this.token(); }

  login(email: string, password: string): Observable<any> {
    return this.http.post<any>(this.base + 'login', { email, password }).pipe(
      tap(r => {
        if (r?.error || !r?.data?.token) return;

        try {
          localStorage.setItem(this.TOKEN, r.data.token);
          localStorage.setItem(this.USUARIO, JSON.stringify(r.data.usuario ?? {}));
        } catch { /* sin almacenamiento no se guarda la sesión, pero el pedido salió bien */ }
      }),
    );
  }

  /** Cierra la sesión también del lado del servidor: el token queda muerto. */
  salir(): void {
    const tenia = this.estaDentro();

    this.limpiar();

    if (tenia) {
      // Ya se limpió el token local, así que se manda el que se guardó antes.
      this.http.post(this.base + 'logout', {}, { headers: this.cabecerasDe(this.ultimoToken) }).subscribe({
        next: () => {}, error: () => {},
      });
    }
  }

  private ultimoToken: string | null = null;

  private limpiar(): void {
    this.ultimoToken = this.token();

    try {
      localStorage.removeItem(this.TOKEN);
      localStorage.removeItem(this.USUARIO);
    } catch { /* nada que limpiar */ }
  }

  private cabecerasDe(token: string | null): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${token ?? ''}` });
  }

  /** Vuelve a leer quién es del servidor: confirma que la sesión sigue viva. */
  yo(): Observable<any> {
    return this.http.get<any>(this.base + 'yo', { headers: this.cabeceras() }).pipe(
      tap(r => {
        if (r?.data) {
          try { localStorage.setItem(this.USUARIO, JSON.stringify({ id: r.data.id, nombre: r.data.nombre, email: r.data.email })); } catch { /* sin almacenamiento */ }
        }
      }),
    );
  }

  cambiarClave(actual: string, nueva: string): Observable<any> {
    return this.http.put<any>(this.base + 'clave', { actual, nueva }, { headers: this.cabeceras() });
  }

  /** La sesión venció o la cortaron: se borra lo local y se vuelve al ingreso. */
  caducar(): void { this.limpiar(); }
}
