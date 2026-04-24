import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Servicio para el whatsapp-service.
 * Todas las llamadas pasan por el proxy Laravel (HTTPS) en lugar de ir
 * directamente a http://181.48.150.43:3001 (Mixed Content).
 * El proxy inyecta automáticamente el x-api-key de la empresa desde la DB.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappService {

  /** Base del proxy en Laravel (HTTPS). */
  private get WA_PROXY(): string {
    return `${environment.rootUrl}api/wa-proxy`;
  }

  constructor(private http: HttpClient) {}

  /** Headers con JWT para el proxy Laravel. */
  private h(): { headers: HttpHeaders } {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
      }),
    };
  }

  /**
   * @deprecated Las keys ya no se cachean; el proxy Laravel las inyecta.
   * Se mantiene para no romper código existente que llame a ensureApiKey().
   */
  ensureApiKey(): Observable<void> {
    return of(undefined);
  }

  // ── Empresa ──────────────────────────────────────────────────────────────────
  getCompanyMe(): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/crm/companies/me`, this.h());
  }

  getDashboard(): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/crm/dashboard`, this.h());
  }

  getStats(): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/crm/stats`, this.h());
  }

  // ── Instancias ───────────────────────────────────────────────────────────────
  getInstances(): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/instances`, this.h());
  }

  createInstance(name: string): Observable<any> {
    return this.http.post(`${this.WA_PROXY}/instances`, { name }, this.h());
  }

  getInstanceStatus(instanceId: string): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/instances/${instanceId}/status`, this.h());
  }

  /** URL del QR (para <img src> o petición autenticada). */
  getQrUrl(instanceId: string): string {
    return `${this.WA_PROXY}/instances/${instanceId}/qr-image`;
  }

  /** QR como Blob usando el proxy (requiere pasar el JWT). */
  getQrBlob(instanceId: string): Observable<Blob> {
    return this.http.get(`${this.WA_PROXY}/instances/${instanceId}/qr-image`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` }),
      responseType: 'blob',
    });
  }

  deleteInstance(instanceId: string): Observable<any> {
    return this.http.delete(`${this.WA_PROXY}/crm/instances/${instanceId}`, this.h());
  }

  // ── Envío ────────────────────────────────────────────────────────────────────
  sendText(instanceId: string, number: string, message: string): Observable<any> {
    return this.http.post(`${this.WA_PROXY}/instances/${instanceId}/send`, { number, message }, this.h());
  }

  sendImage(instanceId: string, number: string, url: string, caption?: string): Observable<any> {
    return this.http.post(`${this.WA_PROXY}/instances/${instanceId}/send/image`, { number, url, caption }, this.h());
  }

  sendDocument(instanceId: string, number: string, url: string, filename?: string, caption?: string): Observable<any> {
    return this.http.post(`${this.WA_PROXY}/instances/${instanceId}/send/document`, { number, url, filename, caption }, this.h());
  }

  sendAudio(instanceId: string, number: string, url: string, ptt = false): Observable<any> {
    return this.http.post(`${this.WA_PROXY}/instances/${instanceId}/send/audio`, { number, url, ptt }, this.h());
  }

  sendVideo(instanceId: string, number: string, url: string, caption?: string): Observable<any> {
    return this.http.post(`${this.WA_PROXY}/instances/${instanceId}/send/video`, { number, url, caption }, this.h());
  }

  // ── Logs & Cola ──────────────────────────────────────────────────────────────
  getLogs(instanceId: string, limit = 100): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/crm/instances/${instanceId}/logs?limit=${limit}`, this.h());
  }

  getQueue(instanceId: string): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/crm/instances/${instanceId}/queue`, this.h());
  }

  // ── Programados ──────────────────────────────────────────────────────────────
  getScheduled(status?: string): Observable<any> {
    const q = status ? `?status=${status}` : '';
    return this.http.get(`${this.WA_PROXY}/crm/scheduled${q}`, this.h());
  }

  createScheduled(instanceId: string, payload: any): Observable<any> {
    return this.http.post(`${this.WA_PROXY}/crm/instances/${instanceId}/scheduled`, payload, this.h());
  }

  cancelScheduled(id: number): Observable<any> {
    return this.http.delete(`${this.WA_PROXY}/crm/scheduled/${id}`, this.h());
  }

  deleteScheduled(id: number): Observable<any> {
    return this.http.delete(`${this.WA_PROXY}/crm/scheduled/${id}/delete`, this.h());
  }

  // ── Webhook ──────────────────────────────────────────────────────────────────
  getWebhook(instanceId: string): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/crm/instances/${instanceId}/webhook`, this.h());
  }

  setWebhook(instanceId: string, url: string, secret?: string): Observable<any> {
    return this.http.put(`${this.WA_PROXY}/crm/instances/${instanceId}/webhook`, { url, secret }, this.h());
  }

  deleteWebhook(instanceId: string): Observable<any> {
    return this.http.delete(`${this.WA_PROXY}/crm/instances/${instanceId}/webhook`, this.h());
  }

  getWebhookLogs(instanceId: string): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/crm/instances/${instanceId}/webhook/logs`, this.h());
  }

  retryWebhook(instanceId: string, logId: number): Observable<any> {
    return this.http.post(`${this.WA_PROXY}/crm/instances/${instanceId}/webhook/retry/${logId}`, {}, this.h());
  }

  // ── Rate Limit ───────────────────────────────────────────────────────────────
  getRateLimit(instanceId: string): Observable<any> {
    return this.http.get(`${this.WA_PROXY}/crm/instances/${instanceId}/rate-limit`, this.h());
  }

  setRateLimit(instanceId: string, limitPerMinute: number, delayMs: number): Observable<any> {
    return this.http.put(`${this.WA_PROXY}/crm/instances/${instanceId}/rate-limit`, { limitPerMinute, delayMs }, this.h());
  }
}
