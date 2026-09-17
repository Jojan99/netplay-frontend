import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Cómo sale el correo ahora mismo: cuenta propia de la empresa o la de Netvula. */
export interface RemitenteCorreo {
  origen: 'propia' | 'plataforma';
  email: string;
  nombre: string;
  responder_a: string | null;
}

export interface ConfiguracionCorreo {
  activo: boolean;
  api_key: string | null;          // enmascarada: solo los últimos 4
  tiene_secreto: boolean;
  from_email: string | null;
  from_name: string | null;
  verificado_en: string | null;
  usando: 'propia' | 'plataforma';
  usando_texto: string;
  remitente_actual: RemitenteCorreo;
  correo_empresa: string | null;
  remitente_plataforma: string;
}

/**
 * Correo (Mailjet) de la empresa. Sin cuenta propia los correos salen de la
 * cuenta de Netvula (no-reply@netvula.com) con el nombre de la empresa.
 */
@Injectable({ providedIn: 'root' })
export class CorreoService {
  private get base(): string { return `${environment.rootUrl}api/correo`; }

  constructor(private http: HttpClient) {}

  private h(): { headers: HttpHeaders } {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
      }),
    };
  }

  configuracion(): Observable<any> {
    return this.http.get(`${this.base}/configuracion`, this.h());
  }

  /** El secreto solo se manda cuando el administrador escribe uno nuevo. */
  guardar(datos: {
    activo: boolean;
    api_key?: string;
    api_secret?: string;
    from_email?: string;
    from_name?: string;
  }): Observable<any> {
    return this.http.put(`${this.base}/configuracion`, datos, this.h());
  }

  probar(email?: string): Observable<any> {
    return this.http.post(`${this.base}/probar`, email ? { email } : {}, this.h());
  }

  desconectar(): Observable<any> {
    return this.http.delete(`${this.base}/configuracion`, this.h());
  }
}
