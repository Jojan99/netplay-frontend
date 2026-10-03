import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** El asistente de soporte por WhatsApp: su configuración y los casos que lleva. */
@Injectable({ providedIn: 'root' })
export class SoporteAsistenteService {
  private http = inject(HttpClient);
  private base = environment.rootUrl + 'api/soporte-asistente';

  estado(): Observable<any> { return this.http.get(this.base); }
  guardar(config: Record<string, any>): Observable<any> { return this.http.put(this.base + '/config', config); }
  casos(estado: string, q: string): Observable<any> {
    let params = new HttpParams();
    if (estado) params = params.set('estado', estado);
    if (q) params = params.set('q', q);
    return this.http.get(this.base + '/casos', { params });
  }
  caso(id: number): Observable<any> { return this.http.get(`${this.base}/casos/${id}`); }
  tomar(id: number): Observable<any> { return this.http.post(`${this.base}/casos/${id}/tomar`, {}); }
  probar(userId: number): Observable<any> { return this.http.post(this.base + '/probar', { user_id: userId }); }
  buscarClientes(q: string): Observable<any> { return this.http.get(environment.rootUrl + 'api/user/search', { params: new HttpParams().set('q', q) }); }
}
