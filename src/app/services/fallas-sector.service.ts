import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Fallas de sector: caídas de un puerto PON, el aviso a los clientes y su configuración. */
@Injectable({ providedIn: 'root' })
export class FallasSectorService {
  private http = inject(HttpClient);
  private base = environment.rootUrl + 'api/fallas-sector';

  estado(): Observable<any> { return this.http.get(this.base); }
  guardar(config: Record<string, any>): Observable<any> { return this.http.put(this.base + '/config', config); }
  sectores(sectores: { olt_id: number; fsp: string; nombre: string | null }[]): Observable<any> { return this.http.put(this.base + '/sectores', { sectores }); }
  falla(id: number): Observable<any> { return this.http.get(`${this.base}/fallas/${id}`); }
  accion(id: number, accion: 'aprobar' | 'descartar' | 'resolver', nota?: string): Observable<any> { return this.http.post(`${this.base}/fallas/${id}/${accion}`, { nota }); }
  revisar(): Observable<any> { return this.http.post(this.base + '/revisar', {}); }
  probar(telefono: string, cual: 'inicio' | 'fin'): Observable<any> { return this.http.post(this.base + '/probar', { telefono, cual }); }
}
