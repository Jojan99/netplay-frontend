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
  login(username: string, password: string, recordar = false): Observable<any> {
    return this.http.post(`${this.baseUrl}/login`, { username, password, recordar });
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}, this.headers());
  }

  me(): Observable<any> {
    return this.http.get(`${this.baseUrl}/me`, this.headers());
  }

  // ── Mi WiFi (equipo del cliente por TR-069) ─────────────────────────────
  getRouter(): Observable<any> {
    return this.http.get(`${this.baseUrl}/router`, this.headers());
  }

  /** Con `todas`, la contraseña queda igual en todas sus redes (2.4 y 5 GHz). */
  cambiarWifiCliente(indice: number, nombre: string | null, clave: string | null, todas = false): Observable<any> {
    return this.http.post(`${this.baseUrl}/router/wifi`, { indice, nombre, clave, todas }, this.headers());
  }

  bloquearEquipo(mac: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/router/bloquear`, { mac }, this.headers());
  }

  desbloquearEquipo(mac: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/router/desbloquear`, { mac }, this.headers());
  }

  refrescarRouter(): Observable<any> {
    return this.http.post(`${this.baseUrl}/router/refrescar`, {}, this.headers());
  }

  /** `canal` null vuelve la red a canal automático. */
  cambiarCanalCliente(indice: number, canal: number | null): Observable<any> {
    return this.http.post(`${this.baseUrl}/router/canal`, { indice, canal }, this.headers());
  }

  reiniciarRouter(): Observable<any> {
    return this.http.post(`${this.baseUrl}/router/reiniciar`, {}, this.headers());
  }

  // ── Consumo de datos y velocidad ─────────────────────────────────────────
  /** Últimos 30 días, total del mes y velocidad del plan. */
  getConsumo(): Observable<any> {
    return this.http.get(`${this.baseUrl}/consumo`, this.headers());
  }

  /** Mide unos segundos la velocidad real en la red de la empresa. */
  medirVelocidad(): Observable<any> {
    return this.http.post(`${this.baseUrl}/velocidad`, {}, this.headers());
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

  sendInvoiceEmail(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/invoices/${id}/send-email`, {}, this.headers());
  }

  sendInvoice(id: number, channel: 'whatsapp' | 'email' | 'both'): Observable<any> {
    return this.http.post(`${this.baseUrl}/invoices/${id}/send?channel=${channel}`, {}, this.headers());
  }

  getSendHistory(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/invoices/${id}/send-history`, this.headers());
  }

  generatePaymentLink(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/invoices/${id}/pay-link`, {}, this.headers());
  }

  initiatePayment(amount: number, invoiceIds: number[]): Observable<any> {
    return this.http.post(`${this.baseUrl}/payment/initiate`, { amount, invoice_ids: invoiceIds }, this.headers());
  }

  getPaymentResult(ref: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/payment/result/${encodeURIComponent(ref)}`, this.headers());
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
  // ── Cuenta: estado, pagos, contratos, actividad ──
  getStatement(): Observable<any> {
    return this.http.get(`${this.baseUrl}/statement`, this.headers());
  }

  getStatus(): Observable<any> {
    return this.http.get(`${this.baseUrl}/status`, this.headers());
  }
  getPayments(): Observable<any> {
    return this.http.get(`${this.baseUrl}/payments`, this.headers());
  }
  getReceiptUrl(invoiceId: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/payments/${invoiceId}/receipt`, this.headers());
  }
  getContracts(): Observable<any> {
    return this.http.get(`${this.baseUrl}/contracts`, this.headers());
  }
  getActivity(): Observable<any> {
    return this.http.get(`${this.baseUrl}/activity`, this.headers());
  }

  getProfile(): Observable<any> {
    return this.http.get(`${this.baseUrl}/profile`, this.headers());
  }

  updateProfile(data: { phone?: string; address?: string; email?: string }): Observable<any> {
    return this.http.put(`${this.baseUrl}/profile`, data, this.headers());
  }

  changePassword(currentPassword: string, newPassword: string, newPasswordConfirmation: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
      new_password_confirmation: newPasswordConfirmation,
    }, this.headers());
  }
}
