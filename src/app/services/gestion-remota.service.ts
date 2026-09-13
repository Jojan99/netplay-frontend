import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * El acceso remoto a los equipos de los clientes: la VLAN de gestión que se
 * crea en el MikroTik y se deja pasar por la OLT.
 */
@Injectable({ providedIn: 'root' })
export class GestionRemotaService {
  private base = `${environment.rootUrl}api/management/gestion-remota`;

  constructor(private http: HttpClient) {}

  private h() {
    return { headers: new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }) };
  }

  estado(): Observable<any> { return this.http.get(this.base, this.h()); }

  /** Tarda: lee el router y cada OLT de verdad. */
  sugerencias(routerId?: number | null): Observable<any> {
    const q = routerId ? `?router_id=${routerId}` : '';
    return this.http.get(`${this.base}/sugerencias${q}`, this.h());
  }

  activar(datos: { vlan: number; red: string; interfaz: string; router_id?: number | null; uplinks?: Record<number, string> }): Observable<any> {
    return this.http.post(`${this.base}/activar`, datos, this.h());
  }

  desactivar(): Observable<any> { return this.http.post(`${this.base}/desactivar`, {}, this.h()); }

  /** Revisa router, OLT y equipos, y lo cuenta en castellano. */
  diagnostico(): Observable<any> { return this.http.get(`${this.base}/diagnostico`, this.h()); }

  /** Los perfiles de línea en uso y si dejan salir la gestión. Tarda: lee la OLT. */
  perfiles(oltId: number, releer = false): Observable<any> {
    return this.http.get(`${this.base}/olt/${oltId}/perfiles${releer ? '?releer=1' : ''}`, this.h());
  }

  /** Agrega la gestión a un perfil. La OLT reconfigura a sus equipos. */
  prepararPerfil(oltId: number, perfil: number): Observable<any> {
    return this.http.post(`${this.base}/olt/${oltId}/perfiles/${perfil}`, {}, this.h());
  }

  /** Le da acceso a un equipo suelto: el de un cliente que ya estaba. */
  darAcceso(oltId: number, fsp: string, ontId: number): Observable<any> {
    return this.http.post(`${this.base}/olt/${oltId}/ont`, { fsp, ont_id: ontId }, this.h());
  }

  /** Le da acceso a los equipos que ya estaban autorizados, de a tandas. */
  alDia(cuantas = 10, oltId?: number | null): Observable<any> {
    return this.http.post(`${this.base}/al-dia`, { cuantas, olt_id: oltId ?? null }, this.h());
  }
}
