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
}
