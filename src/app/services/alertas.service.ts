import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Los avisos de la red: señal caída, cortes, túneles y OLT. */
@Injectable({ providedIn: 'root' })
export class AlertasService {
  private base = `${environment.rootUrl}api/management/alertas`;

  constructor(private http: HttpClient) {}

  private h() {
    return { headers: new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }) };
  }

  lista(historial = false): Observable<any> {
    return this.http.get(`${this.base}${historial ? '?historial=1' : ''}`, this.h());
  }

  revisar(): Observable<any> { return this.http.post(`${this.base}/revisar`, {}, this.h()); }

  marcarVistas(ids?: number[]): Observable<any> { return this.http.post(`${this.base}/vistas`, { ids: ids ?? null }, this.h()); }
}
