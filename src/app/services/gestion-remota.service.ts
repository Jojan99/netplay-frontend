import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, switchMap, takeWhile, timer } from 'rxjs';
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

  /** Reinicia un equipo desde la OLT (en segundo plano). Le corta internet un minuto. */
  reiniciar(oltId: number, fsp: string, ontId: number): Observable<any> {
    return this.http.post(`${this.base}/olt/${oltId}/ont/reiniciar`, { fsp, ont_id: ontId }, this.h());
  }

  /** Cómo va una tarea que corre en segundo plano. */
  tarea(id: string): Observable<any> { return this.http.get(`${this.base}/tareas/${id}`, this.h()); }

  /** Pide parar una tarea: termina el equipo en curso y se detiene. */
  pararTarea(id: string): Observable<any> { return this.http.post(`${this.base}/tareas/${id}/parar`, {}, this.h()); }

  /**
   * Sigue una tarea hasta que termina: emite cada estado y el último es el
   * final. Los trabajos contra la OLT corren en segundo plano porque tardan
   * más de lo que aguanta una petición web.
   */
  esperarTarea(id: string, cadaMs = 3000): Observable<any> {
    return timer(0, cadaMs).pipe(
      switchMap(() => this.tarea(id)),
      map((r: any) => (r?.error === 0 ? r.data : { estado: 'error', detalle: r?.message ?? 'No se encontró la tarea' })),
      takeWhile((t: any) => t?.estado === 'en_curso', true),
    );
  }

  /** Ajustes del aprovisionamiento automático y los últimos equipos programados. */
  aprovisionamiento(): Observable<any> { return this.http.get(`${this.base}/aprovisionamiento`, this.h()); }

  guardarAprovisionamiento(datos: {
    aprovisionar: boolean; wan: boolean; wifi: boolean; admin: boolean;
    wifi_prefijo?: string; admin_usuario?: string; admin_clave?: string;
  }): Observable<any> {
    return this.http.put(`${this.base}/aprovisionamiento`, datos, this.h());
  }

  /** Le da acceso a los equipos que ya estaban autorizados, de a tandas. */
  alDia(oltId?: number | null): Observable<any> {
    return this.http.post(`${this.base}/al-dia`, { olt_id: oltId ?? null }, this.h());
  }
}
