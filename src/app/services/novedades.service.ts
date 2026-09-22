import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Lo que Netvula le cuenta a la empresa: qué se agregó, qué mejoró y qué se
 * arregló. Las escribe Netvula desde su consola; acá sólo se leen y se marcan
 * como vistas.
 */
@Injectable({ providedIn: 'root' })
export class NovedadesService {
  private base = `${environment.rootUrl}api/company/novedades`;

  constructor(private http: HttpClient) {}

  private h() {
    return { headers: new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }) };
  }

  /** Las últimas novedades del usuario y cuántas no vio todavía. */
  lista(): Observable<any> { return this.http.get(this.base, this.h()); }

  /** Se abrió la lista: de acá en adelante ya no son nuevas. */
  vistas(): Observable<any> { return this.http.post(`${this.base}/vistas`, {}, this.h()); }
}
