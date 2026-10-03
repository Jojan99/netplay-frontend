import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Lo que la empresa tiene en Alegra, cruzado con Netvula. Todo de consulta. */
@Injectable({ providedIn: 'root' })
export class AlegraService {
  private http = inject(HttpClient);
  private base = environment.rootUrl + 'api/alegra';

  private q(filtros: Record<string, any>): { params: HttpParams } {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(filtros)) {
      if (v !== null && v !== undefined && v !== '' && v !== false) params = params.set(k, String(v === true ? 1 : v));
    }
    return { params };
  }

  estado(): Observable<any> { return this.http.get(this.base); }
  sincronizar(): Observable<any> { return this.http.post(this.base + '/sincronizar', {}); }
  resumen(): Observable<any> { return this.http.get(this.base + '/resumen'); }
  facturas(f: Record<string, any>): Observable<any> { return this.http.get(this.base + '/facturas', this.q(f)); }
  porFacturar(f: Record<string, any>): Observable<any> { return this.http.get(this.base + '/por-facturar', this.q(f)); }
  recurrentes(f: Record<string, any>): Observable<any> { return this.http.get(this.base + '/recurrentes', this.q(f)); }
  pagos(f: Record<string, any>): Observable<any> { return this.http.get(this.base + '/pagos', this.q(f)); }
  contactos(f: Record<string, any>): Observable<any> { return this.http.get(this.base + '/contactos', this.q(f)); }
  // ── Bandeja de aprobación: lo único que termina escribiendo en Alegra ──
  operaciones(f: Record<string, any>): Observable<any> { return this.http.get(this.base + '/operaciones', this.q(f)); }
  proponer(): Observable<any> { return this.http.post(this.base + '/operaciones/proponer', {}); }
  aprobar(cuerpo: { ids?: number[]; tipo?: string; todas?: boolean }): Observable<any> { return this.http.post(this.base + '/operaciones/aprobar', cuerpo); }
  descartar(ids: number[]): Observable<any> { return this.http.post(this.base + '/operaciones/descartar', { ids }); }
  restaurar(ids: number[]): Observable<any> { return this.http.post(this.base + '/operaciones/restaurar', { ids }); }
  verificar(tipo: string): Observable<any> { return this.http.post(this.base + '/operaciones/verificar', { tipo }); }
  ajustes(cuerpo: { banco_id?: string; medio_pago?: string; auto?: Record<string, boolean> }): Observable<any> { return this.http.put(this.base + '/ajustes', cuerpo); }
  crearContacto(cuerpo: { user_id?: number; todos?: boolean }): Observable<any> { return this.http.post(this.base + '/contactos/crear', cuerpo); }
  quitarRecurrente(alegraId: string, motivo = ''): Observable<any> { return this.http.post(this.base + '/recurrentes/quitar', { alegra_id: alegraId, motivo }); }
  agregarRecurrente(userId: number, inicio?: string): Observable<any> { return this.http.post(this.base + '/recurrentes/agregar', { user_id: userId, inicio }); }

  cuenta(refrescar = false): Observable<any> { return this.http.get(this.base + '/cuenta', this.q({ refrescar })); }
}
