import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { EgressesInterface } from '../models/egresses-interface';


@Injectable({
  providedIn: 'root'
})
export class FinanceService {
  env = environment

  constructor(private http: HttpClient,

    
  ) { }

  getHeaders(): HttpHeaders {
    return new HttpHeaders({
      "Content-Type": "application/json",
      'Authorization': `Bearer ${this.getAuthToken()}`
    });
  }

  
  getAuthToken(): string | null {
    return localStorage.getItem('token'); // Recupera el token desde localStorage
  }

  getDataInfoPenddingFacture(){

    const url = this.env.rootUrl + 'api/facturation/getDataInfoPenddingFacture'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

  getEgresses(){

    const url = this.env.rootUrl + 'api/egresos/getEgresosAll'
    return this.http.get<any>(url, { headers: this.getHeaders() })
  }

  getSearch(value:any){

    var parameter = JSON.stringify({
      value: value,

    });
    const url = this.env.rootUrl + 'api/shearch/SearchFinancesPaid'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });

  }
  getDateFacturePending(cab_id:any){

    var parameter = JSON.stringify({
      cab_id: cab_id,

    });
    const url = this.env.rootUrl + 'api/facturation/getDateFacturePending'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });

  }

   getFactureLog(facture:any){

    var parameter = JSON.stringify({
      id: facture,

    });

    const url = `${this.env.rootUrl}api/facturation/getFacturationLog/${facture}`;

    return this.http.get<any>(url,{ headers: this.getHeaders() });

  }


  

  createEgresse(egresses : EgressesInterface ):Observable<any> {
    var parameter = JSON.stringify({
      concept: egresses.concept,
      value: egresses.value
    });
    const url = this.env.rootUrl + 'api/egresos/createEgresos'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }

  createpaidFacturation(det_id: any,id_user:any,price_total:any,number_facture:any): Observable<any> {
    const parameter = JSON.stringify({
        det_id: det_id,
        id_user: id_user,
        price_total:price_total,
        number_facture:number_facture
    });
    const url = this.env.rootUrl + 'api/facturation/createpaidFacturation';
    return this.http.post(url, parameter, { headers: this.getHeaders() });
}

  updateDetFacturation(numberPorcen:any,numberday:any,facture_id:any,facture_price:any){
    var parameter = JSON.stringify({
      id_facture: facture_id,
      price_total: facture_price,
      discount: 1,
      days_facture:numberday,
      porcentage_discount:numberPorcen

    });
    const url = this.env.rootUrl + 'api/facturation/updateDetFacturation'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }

  createDiscountFacturation(id_user:any,det_id:any,abonoValue:any,number_facture :any, discount:any):Observable<any> {

    var parameter = JSON.stringify({
      det_id: det_id,
      discount: discount,
      price_discount: abonoValue,
      id_user: id_user,
      number_facture:number_facture

    });
    const url = this.env.rootUrl + 'api/facturation/createDiscountFacturation'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });

  }

  // ── Resumen Financiero ───────────────────────────────────────────────────────

  getResumen(from: string, to: string): Observable<any> {
    const url = `${this.env.rootUrl}api/egresos/resumen?from=${from}&to=${to}`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  getIngresos(from: string, to: string): Observable<any> {
    const url = `${this.env.rootUrl}api/egresos/ingresos?from=${from}&to=${to}`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  createEgresoManual(data: { concept: string; value: number; user_id: number }): Observable<any> {
    const url = this.env.rootUrl + 'api/egresos/createEgresos';
    return this.http.post<any>(url, JSON.stringify(data), { headers: this.getHeaders() });
  }

  // ── Finance v2 ─────────────────────────────────────────────────────────

  getClientsPaginated(search: string, page: number, perPage: number): Observable<any> {
    let params = new HttpParams()
      .set('page', page)
      .set('per_page', perPage);
    if (search) params = params.set('search', search);
    return this.http.get<any>(this.env.rootUrl + 'api/facturation/clients', { headers: this.getHeaders(), params });
  }

  getClientInvoices(cabId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/facturation/clients/${cabId}/invoices`, { headers: this.getHeaders() });
  }

  payInvoice(detId: number, clientName: string, paymentMethodId?: number | null): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/facturation/invoices/${detId}/pay`,
      JSON.stringify({ client_name: clientName, payment_method_id: paymentMethodId ?? null }), { headers: this.getHeaders() });
  }

  abonarInvoice(detId: number, amount: number, clientName: string, paymentMethodId?: number | null): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/facturation/invoices/${detId}/abonar`,
      JSON.stringify({ amount, client_name: clientName, payment_method_id: paymentMethodId ?? null }), { headers: this.getHeaders() });
  }

  liquidateBulk(detIds: number[], clientName: string, userId: number, paymentMethodId?: number | null): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/facturation/liquidate-bulk`,
      JSON.stringify({ det_ids: detIds, client_name: clientName, user_id: userId, payment_method_id: paymentMethodId ?? null }),
      { headers: this.getHeaders() });
  }

  updateInvoiceNew(detId: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.env.rootUrl}api/facturation/invoices/${detId}`,
      JSON.stringify(data), { headers: this.getHeaders() });
  }

  exportPaymentsCSV(from?: string, to?: string, cabId?: number): Observable<Blob> {
    let params = new HttpParams();
    if (from)  params = params.set('from', from);
    if (to)    params = params.set('to', to);
    if (cabId) params = params.set('cab_id', cabId);
    return this.http.get(`${this.env.rootUrl}api/facturation/export`,
      { headers: this.getHeaders(), params, responseType: 'blob' });
  }

  getPaymentLogs(search: string, from: string, to: string, page: number, perPage: number): Observable<any> {
    let params = new HttpParams().set('page', page).set('per_page', perPage);
    if (search) params = params.set('search', search);
    if (from)   params = params.set('from', from);
    if (to)     params = params.set('to', to);
    return this.http.get<any>(this.env.rootUrl + 'api/facturation/logs', { headers: this.getHeaders(), params });
  }

  // ── Egresos v2 ─────────────────────────────────────────────────────────

  getEgresosPaginated(search: string, from: string, to: string, category: string, page: number, perPage: number): Observable<any> {
    let params = new HttpParams().set('page', page).set('per_page', perPage);
    if (search)   params = params.set('search', search);
    if (from)     params = params.set('from', from);
    if (to)       params = params.set('to', to);
    if (category) params = params.set('category', category);
    return this.http.get<any>(this.env.rootUrl + 'api/egresos/list', { headers: this.getHeaders(), params });
  }

  createEgresoV2(data: { concept: string; category: string; value: number; payment_method_id?: number | null }): Observable<any> {
    return this.http.post<any>(this.env.rootUrl + 'api/egresos/create-v2',
      JSON.stringify(data), { headers: this.getHeaders() });
  }

  updateEgreso(id: number, data: { concept: string; category: string; value: number }): Observable<any> {
    return this.http.put<any>(`${this.env.rootUrl}api/egresos/${id}`,
      JSON.stringify(data), { headers: this.getHeaders() });
  }

  deleteEgreso(id: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/egresos/${id}`, { headers: this.getHeaders() });
  }

  exportEgresosCSV(from?: string, to?: string): Observable<Blob> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to)   params = params.set('to', to);
    return this.http.get(`${this.env.rootUrl}api/egresos/export`,
      { headers: this.getHeaders(), params, responseType: 'blob' });
  }

  // ── Perfil de usuario ─────────────────────────────────────────────────────

  getMe(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/oauth/me`, { headers: this.getHeaders() });
  }

  updateProfile(data: { names?: string; lastname?: string; phone?: string; email?: string }): Observable<any> {
    return this.http.put<any>(`${this.env.rootUrl}api/oauth/profile`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  changePassword(data: { current_password: string; new_password: string; new_password_confirmation: string }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/oauth/changePassword`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  // ── Métodos de pago ───────────────────────────────────────────────────────

  getPaymentMethods(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/payment-methods`, { headers: this.getHeaders() });
  }

  getActivePaymentMethods(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/payment-methods/active`, { headers: this.getHeaders() });
  }

  getPaymentMethodSummary(period?: string): Observable<any> {
    let params = new HttpParams();
    if (period) params = params.set('period', period);
    return this.http.get<any>(`${this.env.rootUrl}api/payment-methods/summary`, { headers: this.getHeaders(), params });
  }

  getPaymentsByMethod(methodName: string, period: string, page = 1, perPage = 15, search = ''): Observable<any> {
    let params = new HttpParams()
      .set('method_name', methodName)
      .set('period', period)
      .set('page', page)
      .set('per_page', perPage);
    if (search) params = params.set('search', search);
    return this.http.get<any>(`${this.env.rootUrl}api/payment-methods/payments`, { headers: this.getHeaders(), params });
  }

  createPaymentMethod(name: string): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/payment-methods`,
      JSON.stringify({ name }), { headers: this.getHeaders() });
  }

  updatePaymentMethod(id: number, name: string): Observable<any> {
    return this.http.put<any>(`${this.env.rootUrl}api/payment-methods/${id}`,
      JSON.stringify({ name }), { headers: this.getHeaders() });
  }

  togglePaymentMethod(id: number): Observable<any> {
    return this.http.patch<any>(`${this.env.rootUrl}api/payment-methods/${id}/toggle`,
      '{}', { headers: this.getHeaders() });
  }

  deletePaymentMethod(id: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/payment-methods/${id}`, { headers: this.getHeaders() });
  }

  // ── Envío de facturas ──────────────────────────────────────────────────────

  sendInvoiceByWhatsApp(invoiceId: number | string): Observable<any> {
    return this.http.post<any>(
      `${this.env.rootUrl}api/generatePdf/sendInvoiceByWhatsApp/${invoiceId}`,
      {}, { headers: this.getHeaders() }
    );
  }

  sendInvoiceByEmail(invoiceId: number | string): Observable<any> {
    return this.http.post<any>(
      `${this.env.rootUrl}api/generatePdf/sendInvoiceByEmail/${invoiceId}`,
      {}, { headers: this.getHeaders() }
    );
  }

  sendInvoice(invoiceId: number | string, channel: 'whatsapp' | 'email' | 'both' = 'whatsapp'): Observable<any> {
    return this.http.post<any>(
      `${this.env.rootUrl}api/generatePdf/sendInvoice/${invoiceId}?channel=${channel}`,
      {}, { headers: this.getHeaders() }
    );
  }

  // ── Compromisos de pago ───────────────────────────────────────────────────

  getCommitments(cabId: number): Observable<any> {
    return this.http.get<any>(
      `${this.env.rootUrl}api/facturation/commitments`,
      { headers: this.getHeaders(), params: new HttpParams().set('cab_id', cabId) }
    );
  }

  createCommitment(data: {
    cab_id: number; user_id: number; commitment_date: string;
    amount_committed?: number | null; notes?: string; auto_suspend: boolean;
  }): Observable<any> {
    return this.http.post<any>(
      `${this.env.rootUrl}api/facturation/commitments`,
      JSON.stringify(data), { headers: this.getHeaders() }
    );
  }

  cancelCommitment(id: number): Observable<any> {
    return this.http.put<any>(
      `${this.env.rootUrl}api/facturation/commitments/${id}/cancel`,
      '{}', { headers: this.getHeaders() }
    );
  }

  fulfillCommitment(id: number): Observable<any> {
    return this.http.put<any>(
      `${this.env.rootUrl}api/facturation/commitments/${id}/fulfill`,
      '{}', { headers: this.getHeaders() }
    );
  }
}
