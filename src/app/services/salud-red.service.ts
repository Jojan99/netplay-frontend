import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Salud de la red: cómo viene cada puerto PON, quién está al borde de quedarse
 * sin servicio y qué equipos se caen todo el día.
 *
 * Todo sale de lo que ya se midió: esta pantalla nunca le pregunta a la OLT,
 * así que se puede abrir cuantas veces haga falta sin cargarla.
 */
@Injectable({ providedIn: 'root' })
export class SaludRedService {
  private base = `${environment.rootUrl}api/management/red/salud`;

  constructor(private http: HttpClient) {}

  resumen(): Observable<any> {
    return this.http.get(this.base, {
      headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
    });
  }
}