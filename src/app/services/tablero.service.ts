import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * El tablero de inicio que arma cada usuario.
 *
 * Acá sólo viajan los nombres de los paneles y su orden: los datos los pide
 * cada panel a la pantalla que ya los tenía. El servidor descarta cualquier
 * nombre que no conozca, así que una sesión vieja no puede ensuciar la fila.
 */
@Injectable({ providedIn: 'root' })
export class TableroService {
  private base = `${environment.rootUrl}api/company/tablero`;

  constructor(private http: HttpClient) {}

  private h() {
    return { headers: new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }) };
  }

  /** Los paneles del usuario; si nunca armó el suyo, el de fábrica. */
  ver(): Observable<any> { return this.http.get(this.base, this.h()); }

  guardar(paneles: string[]): Observable<any> { return this.http.put(this.base, { paneles }, this.h()); }

  /** Volver al tablero de fábrica. */
  olvidar(): Observable<any> { return this.http.delete(this.base, this.h()); }
}