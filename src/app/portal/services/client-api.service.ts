import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClientAuthService } from './client-auth.service';

@Injectable({ providedIn: 'root' })
export class ClientApiService {
  private http    = inject(HttpClient);
  private auth    = inject(ClientAuthService);
  private baseUrl = `${environment.rootUrl}api/client`;

  private headers(): { headers: HttpHeaders } {
    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${this.auth.getToken() ?? ''}`,
        'Content-Type': 'application/json',
      }),
    };
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/login`, { username, password });
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}, this.headers());
  }

  me(): Observable<any> {
    return this.http.get(`${this.baseUrl}/me`, this.headers());
  }

  // ── Facturas ─────────────────────────────────────────────────────────────
  getInvoices(): Observable<any> {
    return this.http.get(`${this.baseUrl}/invoices`, this.headers());
  }

  getInvoice(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/invoices/${id}`, this.headers());
  }

  getInvoicePdfUrl(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/invoices/${id}/pdf-url`, this.headers());
  }

  sendInvoiceWhatsapp(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/invoices/${id}/send-whatsapp`, {}, this.headers());
  }

  // ── Tickets / Reportes ───────────────────────────────────────────────────
  getTickets(): Observable<any> {
    return this.http.get(`${this.baseUrl}/tickets`, this.headers());
  }

  getTicket(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/tickets/${id}`, this.headers());
  }

  createTicket(category: string, description: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/tickets`, { category, description }, this.headers());
  }

  // ── Perfil ───────────────────────────────────────────────────────────────
  getProfile(): Observable<any> {
    return this.http.get(`${this.baseUrl}/profile`, this.headers());
  }

  updateProfile(data: { phone?: string; address?: string; email?: string }): Observable<any> {
    return this.http.put(`${this.baseUrl}/profile`, data, this.headers());
  }
}
