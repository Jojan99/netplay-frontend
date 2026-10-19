import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type EstadoCliente = 'ok' | 'senal' | 'falla' | 'caido' | 'suspendido' | 'sin_ont';

export interface PuntoRed {
  id: number; tipo: 'olt' | 'nap'; nombre: string; lat: number; lng: number;
  olt_id: number | null; fsp: string | null; capacidad: number | null; nota: string | null; falla: boolean;
}

export interface ClienteMapa {
  id: number; nombre: string; documento: string | null; direccion: string;
  lat: number | null; lng: number | null; nap_id: number | null; fuente: string | null;
  olt_id: number | null; fsp: string | null; ont_id: number | null; potencia: number | null; estado: EstadoCliente;
}

/** Mapa de la red: OLT, cajas NAP y clientes con su estado. */
@Injectable({ providedIn: 'root' })
export class MapaRedService {
  private http = inject(HttpClient);
  private base = environment.rootUrl + 'api/mapa-red';

  datos(): Observable<any> { return this.http.get(this.base); }
  crearPunto(p: Partial<PuntoRed>): Observable<any> { return this.http.post(this.base + '/puntos', p); }
  editarPunto(id: number, p: Partial<PuntoRed>): Observable<any> { return this.http.put(`${this.base}/puntos/${id}`, p); }
  borrarPunto(id: number): Observable<any> { return this.http.delete(`${this.base}/puntos/${id}`); }
  ubicarCliente(id: number, lat: number | null, lng: number | null, napId: number | null): Observable<any> {
    return this.http.put(`${this.base}/clientes/${id}`, { lat, lng, nap_id: napId });
  }
  quitarCliente(id: number): Observable<any> { return this.http.delete(`${this.base}/clientes/${id}`); }
}
