import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PasoGuia {
  clave: string;
  titulo: string;
  detalle: string;
  ruta: string;
  boton: string;
  hecho: boolean;
  cuenta: string | null;
}

export interface Guia {
  pasos: PasoGuia[];
  total: number;
  completados: number;
  porcentaje: number;
  empresa: string;
  oculta: boolean;
  perfil: string;
}

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly base = environment.rootUrl + 'api/onboarding';

  constructor(private http: HttpClient) {}

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token') ?? ''}`,
    });
  }

  /** Los pasos con el estado real de la empresa. */
  obtener(): Observable<any> {
    return this.http.get(this.base, { headers: this.headers() });
  }

  /** ver=false oculta la guía; ver=true la vuelve a mostrar. */
  marcar(ver: boolean): Observable<any> {
    return this.http.post(this.base + '/done', { ver }, { headers: this.headers() });
  }
}
