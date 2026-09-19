import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CobranzaConfig {
  activa: boolean;
  modo: 'manual' | 'automatico';
  min_facturas: number;
  min_dias_mora: number;
  max_dias_mora: number;
  min_monto: number;
  descuento_max_pct: number;
  descuento_dias: number;
  cuotas_max: number;
  plazo_max_dias: number;
  compromiso_suspende: boolean;
  hora_desde: string;
  hora_hasta: string;
  dias: string;
  max_contactos_dia: number;
  recordatorios: number;
  horas_entre_recordatorios: number;
  nombre_asistente: string;
  instrucciones: string | null;
  wa_linea_id: number | null;
}

export interface CobranzaResumen {
  activa: boolean;
  modo: string;
  ia_disponible: boolean;
  detectados: number;
  escalados: number;
  en_curso: number;
  no_vistos: number;
}

export interface CobranzaCaso {
  id: number;
  user_id: number;
  estado: string;
  resultado: string | null;
  motivo: string | null;
  resumen: string | null;
  deuda: number;
  facturas: number;
  dias_mora: number;
  telefono: string | null;
  conversation_id: number | null;
  contactado_en: string | null;
  ultimo_mensaje_en: string | null;
  ultima_respuesta_en: string | null;
  visto: boolean;
  updated_at: string;
  names?: string;
  lastname?: string;
  dni?: string;
}

/** Cobranza inteligente: configuración, casos y la burbuja del panel. */
@Injectable({ providedIn: 'root' })
export class CobranzaService {
  private http = inject(HttpClient);
  private base = `${environment.rootUrl}api/cobranza`;

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  }

  config(): Observable<any>                         { return this.http.get(`${this.base}/config`, { headers: this.headers() }); }
  /** La clave de Google va aparte: vacía = se conserva; quitar_clave la borra. */
  guardarConfig(c: CobranzaConfig & { ia_clave?: string; quitar_clave?: boolean; ia_modelos?: string | null }): Observable<any> {
    return this.http.put(`${this.base}/config`, c, { headers: this.headers() });
  }
  probarIa(clave?: string): Observable<any> { return this.http.post(`${this.base}/ia/probar`, { ia_clave: clave || undefined }, { headers: this.headers() }); }
  resumen(): Observable<any>                        { return this.http.get(`${this.base}/resumen`, { headers: this.headers() }); }
  marcarVistos(): Observable<any>                   { return this.http.post(`${this.base}/vistos`, {}, { headers: this.headers() }); }
  revisarAhora(): Observable<any>                   { return this.http.post(`${this.base}/revisar`, {}, { headers: this.headers() }); }
  casos(grupo: 'atencion' | 'curso' | 'resultados'): Observable<any> {
    return this.http.get(`${this.base}/casos`, { headers: this.headers(), params: { grupo } });
  }
  caso(id: number): Observable<any>                 { return this.http.get(`${this.base}/casos/${id}`, { headers: this.headers() }); }
  accion(id: number, que: 'autorizar' | 'descartar' | 'tomar' | 'devolver'): Observable<any> {
    return this.http.post(`${this.base}/casos/${id}/${que}`, {}, { headers: this.headers() });
  }
}
