import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Router del cliente por TR-069. El panel nunca habla con GenieACS: pasa por
 * el backend, que sólo deja ver los equipos de la empresa.
 */
@Injectable({ providedIn: 'root' })
export class AcsService {
  private base = `${environment.rootUrl}api/management/acs`;

  constructor(private http: HttpClient) {}

  private h() {
    return { headers: new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }) };
  }

  estado(): Observable<any> { return this.http.get(`${this.base}/estado`, this.h()); }

  equipos(): Observable<any> { return this.http.get(`${this.base}/equipos`, this.h()); }

  detalle(id: string): Observable<any> {
    return this.http.get(`${this.base}/equipos/detalle`, { ...this.h(), params: new HttpParams().set('id', id) });
  }

  deCliente(userId: number): Observable<any> { return this.http.get(`${this.base}/cliente/${userId}`, this.h()); }

  refrescar(id: string): Observable<any> { return this.http.post(`${this.base}/equipos/refrescar`, { id }, this.h()); }

  reiniciar(id: string): Observable<any> { return this.http.post(`${this.base}/equipos/reiniciar`, { id }, this.h()); }

  cambiarWifi(id: string, indice: number, ssid: string | null, clave: string | null): Observable<any> {
    return this.http.post(`${this.base}/equipos/wifi`, { id, indice, ssid: ssid || null, clave: clave || null }, this.h());
  }
}
