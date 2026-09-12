import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** El asistente del servidor TR-069: estado, detección de redes y scripts. */
@Injectable({ providedIn: 'root' })
export class AcsSetupService {
  private base = `${environment.rootUrl}api/management/acs/servidor`;

  constructor(private http: HttpClient) {}

  private h() {
    return { headers: new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }) };
  }

  estado(): Observable<any> { return this.http.get(this.base, this.h()); }

  guardar(datos: any): Observable<any> { return this.http.put(this.base, datos, this.h()); }

  detectar(routerId?: number): Observable<any> {
    return this.http.post(`${this.base}/detectar`, { router_id: routerId ?? null }, this.h());
  }

  aplicar(redes: string[], routerId?: number | null): Observable<any> {
    return this.http.post(`${this.base}/aplicar`, { redes, router_id: routerId ?? null }, this.h());
  }

  diagnostico(): Observable<any> { return this.http.get(`${this.base}/diagnostico`, this.h()); }

  script(routerId?: number | null): Observable<any> {
    const q = routerId ? `?router_id=${routerId}` : '';
    return this.http.get(`${this.base}/script${q}`, this.h());
  }
}
