import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MikrotikService {
  private base = `${environment.rootUrl}api/management`;

  constructor(private http: HttpClient) {}

  private h() {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
      }),
    };
  }

  private params(routerId?: number | null): { params?: HttpParams } {
    if (!routerId) return {};
    return { params: new HttpParams().set('router_id', routerId.toString()) };
  }

  // ── Router CRUD ─────────────────────────────────────────────────────────────

  getRouters(): Observable<any> {
    return this.http.get(`${this.base}/routers`, this.h());
  }

  addRouter(data: { name: string; host: string; user: string; pass: string; port?: number }): Observable<any> {
    return this.http.post(`${this.base}/routers`, data, this.h());
  }

  editRouter(id: number, data: { name?: string; host?: string; user?: string; pass?: string; port?: number }): Observable<any> {
    return this.http.put(`${this.base}/routers/${id}`, data, this.h());
  }

  removeRouter(id: number): Observable<any> {
    return this.http.delete(`${this.base}/routers/${id}`, this.h());
  }

  // ── Mikrotik info (router_id opcional) ──────────────────────────────────────

  getRouterInfo(routerId?: number | null): Observable<any> {
    return this.http.get(`${this.base}/router-info`, { ...this.h(), ...this.params(routerId) });
  }

  getConnectedClients(routerId?: number | null): Observable<any> {
    return this.http.get(`${this.base}/clients`, { ...this.h(), ...this.params(routerId) });
  }

  getQueues(routerId?: number | null): Observable<any> {
    return this.http.get(`${this.base}/queues`, { ...this.h(), ...this.params(routerId) });
  }

  createQueue(data: any, routerId?: number | null): Observable<any> {
    return this.http.post(`${this.base}/queues`, { ...data, router_id: routerId ?? undefined }, this.h());
  }

  updateQueue(id: string, data: any, routerId?: number | null): Observable<any> {
    return this.http.put(`${this.base}/queues/${id}`, { ...data, router_id: routerId ?? undefined }, this.h());
  }

  deleteQueue(id: string, routerId?: number | null): Observable<any> {
    return this.http.delete(`${this.base}/queues/${id}`, { ...this.h(), ...this.params(routerId) });
  }

  suspendBulk(userIds: number[], routerId?: number | null): Observable<any> {
    return this.http.post(`${this.base}/suspend-bulk`, { user_ids: userIds, router_id: routerId ?? undefined }, this.h());
  }

  getRouterConfig(routerId?: number | null): Observable<any> {
    return this.http.get(`${this.base}/router-config`, { ...this.h(), ...this.params(routerId) });
  }

  saveRouterConfig(data: any): Observable<any> {
    return this.http.post(`${this.base}/router-config`, data, this.h());
  }

  getLanSegments(routerId?: number | null): Observable<any> {
    return this.http.get(`${this.base}/getLanSegments`, { ...this.h(), ...this.params(routerId) });
  }

  getIpAvalibles(vlan: string, routerId?: number | null, segment?: string): Observable<any> {
    return this.http.post(`${this.base}/getIpAvalibles`, { vlan, segment, router_id: routerId ?? undefined }, this.h());
  }

  /** Clientes que están compartiendo una misma IP. */
  getIpConflicts(): Observable<any> {
    return this.http.get(`${this.base}/ip-conflicts`, this.h());
  }

  /**
   * Copia al sistema la IP que cada cliente tiene en el router.
   * Con simular=true no escribe nada: sólo informa qué cambiaría.
   */
  syncIps(simular: boolean, routerId?: number | null): Observable<any> {
    return this.http.post(`${this.base}/sync-ips`, { simular, router_id: routerId ?? undefined }, this.h());
  }

  /** Le da al cliente una IP libre y reescribe el ARP del router. */
  migrarIp(data: { service_id: number; new_ip: string; vlan: string; router_id?: number | null }): Observable<any> {
    return this.http.post(`${this.base}/migrarIp`, data, this.h());
  }
}
