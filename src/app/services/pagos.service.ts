import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Finanzas › Pagos: lo registrado, los pagos en línea sin terminar y el cuadre de caja. */
@Injectable({ providedIn: 'root' })
export class PagosService {
  private http = inject(HttpClient);
  private base = `${environment.rootUrl}api/pagos`;

  private headers(): HttpHeaders {
    return new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  }

  private params(filtros: Record<string, unknown>): HttpParams {
    let p = new HttpParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v)); });
    return p;
  }

  registrados(filtros: Record<string, unknown>): Observable<any> {
    return this.http.get(`${this.base}/registrados`, { headers: this.headers(), params: this.params(filtros) });
  }

  enLinea(): Observable<any> {
    return this.http.get(`${this.base}/en-linea`, { headers: this.headers() });
  }

  escribirle(id: number): Observable<any> {
    return this.http.post(`${this.base}/en-linea/${id}/escribirle`, '{}', { headers: this.headers() });
  }

  caja(fecha: string): Observable<any> {
    return this.http.get(`${this.base}/caja`, { headers: this.headers(), params: this.params({ fecha }) });
  }

  cerrarCaja(fecha: string, contado: Array<{ medio_id: number | null; valor: number }>, nota: string): Observable<any> {
    return this.http.post(`${this.base}/caja`, JSON.stringify({ fecha, contado, nota }), { headers: this.headers() });
  }
}
