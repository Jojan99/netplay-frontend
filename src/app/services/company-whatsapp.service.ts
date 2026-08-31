import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CompanyWhatsappService {
  env = environment;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });
  }

  private get base(): string {
    return `${this.env.rootUrl}api/company/whatsapp`;
  }

  // ── Config ────────────────────────────────────────────────────────────────────

  getConfig(): Observable<any> {
    return this.http.get(`${this.base}/config`, { headers: this.getHeaders() });
  }

  updateConfig(data: {
    wa_provider?: string | null;
    wa_instance_id?: string | null;
    wa_phone_number_id?: string | null;
    wa_business_id?: string | null;
    wa_access_token?: string | null;
    whatsapp_enabled?: boolean;
  }): Observable<any> {
    return this.http.put(
      `${this.base}/config`,
      JSON.stringify(data),
      { headers: this.getHeaders() }
    );
  }

  // ── Instances ─────────────────────────────────────────────────────────────────

  getInstances(): Observable<any> {
    return this.http.get(`${this.base}/instances`, { headers: this.getHeaders() });
  }

  createInstance(name: string): Observable<any> {
    return this.http.post(
      `${this.base}/instances`,
      JSON.stringify({ name }),
      { headers: this.getHeaders() }
    );
  }

  /** QR como Blob (el backend proxia la imagen PNG del whatsapp-service) */
  getQrBlob(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/instances/${id}/qr`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` }),
      responseType: 'blob',
    });
  }

  getInstanceStatus(id: string): Observable<any> {
    return this.http.get(`${this.base}/instances/${id}/status`, { headers: this.getHeaders() });
  }

  deleteInstance(id: string): Observable<any> {
    return this.http.delete(`${this.base}/instances/${id}`, { headers: this.getHeaders() });
  }

  // ── Suscripción ───────────────────────────────────────────────────────────────

  /** Activa o renueva la suscripción WA de la empresa. */
  subscribeWhatsApp(planId = 'plan_pro', billingCycle = 'yearly'): Observable<any> {
    return this.http.post(
      `${this.base}/subscribe`,
      JSON.stringify({ plan_id: planId, billing_cycle: billingCycle }),
      { headers: this.getHeaders() }
    );
  }

  // ── Plan requests ─────────────────────────────────────────────────────────────

  submitPlanRequest(notes = ''): Observable<any> {
    return this.http.post(
      `${this.base}/plan-request`,
      JSON.stringify({ notes }),
      { headers: this.getHeaders() }
    );
  }

  listPlanRequests(): Observable<any> {
    return this.http.get(`${this.base}/plan-requests`, { headers: this.getHeaders() });
  }

  resolvePlanRequest(id: number, action: 'approve' | 'reject', notes = ''): Observable<any> {
    return this.http.put(
      `${this.base}/plan-requests/${id}`,
      JSON.stringify({ action, notes }),
      { headers: this.getHeaders() }
    );
  }

  // ── Users ─────────────────────────────────────────────────────────────────────

  toggleUserWhatsapp(userId: string | number, enabled: boolean): Observable<any> {
    return this.http.put(
      `${this.env.rootUrl}api/company/whatsapp/users/${userId}/toggle`,
      JSON.stringify({ whatsapp_enabled: enabled }),
      { headers: this.getHeaders() }
    );
  }

  // ── Groups ────────────────────────────────────────────────────────────────────

  getGroups(): Observable<any> {
    return this.http.get(`${this.base}/groups`, { headers: this.getHeaders() });
  }

  // ── Notification Routes ───────────────────────────────────────────────────────

  listNotificationRoutes(): Observable<any> {
    return this.http.get(`${this.env.rootUrl}api/company/notification-routes`, { headers: this.getHeaders() });
  }

  createNotificationRoute(data: { event_type: string; destination: string; label?: string }): Observable<any> {
    return this.http.post(`${this.env.rootUrl}api/company/notification-routes`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  updateNotificationRoute(id: number, data: { enabled?: boolean; label?: string }): Observable<any> {
    return this.http.put(`${this.env.rootUrl}api/company/notification-routes/${id}`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  deleteNotificationRoute(id: number): Observable<any> {
    return this.http.delete(`${this.env.rootUrl}api/company/notification-routes/${id}`, { headers: this.getHeaders() });
  }
}
