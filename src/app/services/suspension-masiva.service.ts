import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Suspensión masiva por grupo de corte: la lista, la orden y su avance. */
@Injectable({ providedIn: 'root' })
export class SuspensionMasivaService {
  private http = inject(HttpClient);
  private base = environment.rootUrl + 'api/suspension-masiva';

  opciones(): Observable<any> { return this.http.get(this.base + '/opciones'); }
  candidatos(f: { grupo: string; servicio: string; min_facturas: number }): Observable<any> {
    return this.http.get(this.base + '/candidatos', { params: new HttpParams().set('grupo', f.grupo).set('servicio', f.servicio).set('min_facturas', String(f.min_facturas)) });
  }
  crear(orden: Record<string, any>): Observable<any> { return this.http.post(this.base + '/lotes', orden); }
  ver(id: number): Observable<any> { return this.http.get(`${this.base}/lotes/${id}`); }
  cancelar(id: number): Observable<any> { return this.http.post(`${this.base}/lotes/${id}/cancelar`, {}); }
}
