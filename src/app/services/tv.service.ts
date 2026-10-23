import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Televisión por IPTV (panel XUI.one): canales, líneas, configuración y la TV de un cliente. */
@Injectable({ providedIn: 'root' })
export class TvService {
  private http = inject(HttpClient);
  private base = `${environment.rootUrl}api/tv`;

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  }

  private params(filtros: Record<string, unknown>): HttpParams {
    let p = new HttpParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v)); });
    return p;
  }

  private post(ruta: string, cuerpo: unknown = {}): Observable<any> {
    return this.http.post(`${this.base}/${ruta}`, JSON.stringify(cuerpo), { headers: this.headers() });
  }

  configuracion(): Observable<any> { return this.http.get(`${this.base}/configuracion`, { headers: this.headers() }); }
  guardarConfiguracion(cuerpo: unknown): Observable<any> { return this.http.put(`${this.base}/configuracion`, JSON.stringify(cuerpo), { headers: this.headers() }); }
  guardarPlan(id: number, cuerpo: { tv_incluida: boolean; tv_bouquets: number[]; tv_pantallas: number | null }): Observable<any> {
    return this.http.put(`${this.base}/planes/${id}`, JSON.stringify(cuerpo), { headers: this.headers() });
  }

  canales(): Observable<any> { return this.http.get(`${this.base}/canales`, { headers: this.headers() }); }
  revisarCanales(): Observable<any> { return this.post('canales/revisar'); }
  vigilarCanal(id: number, vigilar: boolean): Observable<any> {
    return this.http.patch(`${this.base}/canales/${id}`, JSON.stringify({ vigilar }), { headers: this.headers() });
  }

  lineas(filtros: { filtro?: string; q?: string; pagina?: number }): Observable<any> {
    return this.http.get(`${this.base}/lineas`, { headers: this.headers(), params: this.params(filtros) });
  }
  sincronizarLineas(): Observable<any> { return this.post('lineas/sincronizar'); }
  vincular(id: number, userId: number | null): Observable<any> {
    return this.http.patch(`${this.base}/lineas/${id}/cliente`, JSON.stringify({ user_id: userId }), { headers: this.headers() });
  }
  buscarClientes(q: string): Observable<any> { return this.http.get(`${this.base}/clientes`, { headers: this.headers(), params: this.params({ q }) }); }

  deCliente(userId: number): Observable<any> { return this.http.get(`${this.base}/cliente/${userId}`, { headers: this.headers() }); }
  crearDeCliente(userId: number, cuerpo: { bouquets?: number[]; pantallas?: number }): Observable<any> { return this.post(`cliente/${userId}/linea`, cuerpo); }
  cambiarClave(id: number): Observable<any> { return this.post(`lineas/${id}/clave`); }
  encender(id: number, prender: boolean): Observable<any> { return this.post(`lineas/${id}/encender`, { prender }); }
  paquete(id: number, bouquets: number[], pantallas: number): Observable<any> { return this.post(`lineas/${id}/paquete`, { bouquets, pantallas }); }
  whatsapp(id: number, tipo = 'm3u_plus', salida = 'ts'): Observable<any> { return this.post(`lineas/${id}/whatsapp`, { tipo, salida }); }
}
