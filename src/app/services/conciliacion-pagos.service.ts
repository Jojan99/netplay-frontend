import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Una fila de la lista, ya cruzada contra los clientes. */
export interface FilaCruce {
  ref: string;
  nombre: string;
  valor: number;
  /** Exacta y Probable se pueden aplicar; Revisar no hasta que una persona la confirme; Corregida la puso una persona. */
  est: 'Exacta' | 'Probable' | 'Corregida' | 'Revisar';
  cedula: string;
  base: string;
  obs: string;
  candidatos: { cedula: string; nombre: string; puntaje: number }[];
}

export interface PagoAAplicar {
  ref: string;
  cedula: string;
  nombre: string;
  valor: number;
  /** Quien vio el aviso de «posible duplicado» y decidió que es otro pago. */
  forzar?: boolean;
}

export interface PeticionDePagos {
  filas: PagoAAplicar[];
  orden: 'antigua' | 'exacta';
  metodo_id?: number | null;
  fecha?: string | null;
  titulo?: string | null;
  lote?: string;
}

/** Conciliación de pagos: lista «nombre y valor» → cliente → facturas. */
@Injectable({ providedIn: 'root' })
export class ConciliacionPagosService {
  private http = inject(HttpClient);
  private base = `${environment.rootUrl}api/conciliacion-pagos`;

  cruzar(texto: string): Observable<any> { return this.http.post(`${this.base}/cruzar`, { texto }); }
  clientes(q: string): Observable<any> { return this.http.get(`${this.base}/clientes`, { params: { q } }); }
  simular(p: PeticionDePagos): Observable<any> { return this.http.post(`${this.base}/simular`, p); }
  aplicar(p: PeticionDePagos): Observable<any> { return this.http.post(`${this.base}/aplicar`, p); }
  lotes(): Observable<any> { return this.http.get(`${this.base}/lotes`); }
  metodos(): Observable<any> { return this.http.get(`${environment.rootUrl}api/payment-methods`); }
}
