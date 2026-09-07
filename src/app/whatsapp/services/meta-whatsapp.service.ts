import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MetaWhatsappService {
  private get base(): string {
    return `${environment.rootUrl}api/company/whatsapp/meta`;
  }

  constructor(private http: HttpClient) {}

  private h(): { headers: HttpHeaders } {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
      }),
    };
  }

  // ── Phone Info ───────────────────────────────────────────────────────────────
  getPhoneInfo(): Observable<any> {
    return this.http.get(`${this.base}/phone-info`, this.h());
  }

  // ── Templates ────────────────────────────────────────────────────────────────
  getTemplates(): Observable<any> {
    return this.http.get(`${this.base}/templates`, this.h());
  }

  createTemplate(data: any): Observable<any> {
    return this.http.post(`${this.base}/templates`, JSON.stringify(data), this.h());
  }

  deleteTemplate(name: string): Observable<any> {
    return this.http.delete(`${this.base}/templates/${name}`, this.h());
  }

  // ── Automatizaciones (evento → plantilla) ────────────────────────────────────
  getTemplateBindings(): Observable<any> {
    return this.http.get(`${this.base}/template-bindings`, this.h());
  }

  saveTemplateBinding(data: any): Observable<any> {
    return this.http.post(`${this.base}/template-bindings`, JSON.stringify(data), this.h());
  }

  // ── Conversation Window ──────────────────────────────────────────────────────
  checkWindow(phone: string): Observable<any> {
    return this.http.get(`${this.base}/conversation-window/${phone}`, this.h());
  }

  // ── Send Test ────────────────────────────────────────────────────────────────
  sendTest(data: any): Observable<any> {
    return this.http.post(`${this.base}/send-test`, JSON.stringify(data), this.h());
  }

  // ── Logs ─────────────────────────────────────────────────────────────────────
  getLogs(): Observable<any> {
    return this.http.get(`${this.base}/logs`, this.h());
  }

  // ── Validate Phone ───────────────────────────────────────────────────────────
  validatePhone(phone: string): Observable<any> {
    return this.http.post(`${this.base}/validate-phone`, JSON.stringify({ phone }), this.h());
  }

  // ── Automatizaciones programadas ────────────────────────────────────────────
  /** A cuántos clientes les saldría hoy este aviso. */
  previewBinding(event: string): Observable<any> {
    return this.http.get(`${this.base}/template-bindings/${event}/preview`, this.h());
  }

  /** Manda la plantilla del aviso a un número, con datos de ejemplo. */
  testBinding(data: any): Observable<any> {
    return this.http.post(`${this.base}/template-bindings/test`, JSON.stringify(data), this.h());
  }

  // ── Comunicados (envíos masivos) ────────────────────────────────────────────
  campaignOptions(): Observable<any> {
    return this.http.get(`${this.base}/campaigns/options`, this.h());
  }

  campaigns(): Observable<any> {
    return this.http.get(`${this.base}/campaigns`, this.h());
  }

  campaign(id: number): Observable<any> {
    return this.http.get(`${this.base}/campaigns/${id}`, this.h());
  }

  /** Cuántos recibirían con estos filtros, sin enviar nada. */
  campaignAudience(params: string): Observable<any> {
    return this.http.get(`${this.base}/campaigns/audience?${params}`, this.h());
  }

  /** Clientes que cumplen los filtros, para ir marcando exclusiones. */
  campaignClients(params: string): Observable<any> {
    return this.http.get(`${this.base}/campaigns/clients?${params}`, this.h());
  }

  saveCampaign(data: any): Observable<any> {
    return this.http.post(`${this.base}/campaigns`, JSON.stringify(data), this.h());
  }

  testCampaign(id: number, phone: string): Observable<any> {
    return this.http.post(`${this.base}/campaigns/${id}/test`, JSON.stringify({ phone }), this.h());
  }

  sendCampaign(id: number): Observable<any> {
    return this.http.post(`${this.base}/campaigns/${id}/send`, '{}', this.h());
  }

  cancelCampaign(id: number): Observable<any> {
    return this.http.post(`${this.base}/campaigns/${id}/cancel`, '{}', this.h());
  }

  // ── Bot Config ───────────────────────────────────────────────────────────────
  getBotConfig(): Observable<any> {
    return this.http.get(`${environment.rootUrl}api/company/whatsapp/bot-config`, this.h());
  }

  updateBotConfig(data: any): Observable<any> {
    return this.http.put(`${environment.rootUrl}api/company/whatsapp/bot-config`, JSON.stringify(data), this.h());
  }
}
