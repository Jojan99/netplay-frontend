import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';
import { EgressesInterface } from '../models/egresses-interface';

/** Filtros de la pantalla de Egresos: los mismos para lista, tablero y CSV. */
export interface FiltrosEgresos {
  search?: string;
  from?: string;
  to?: string;
  category?: string;
  payment_method_id?: number | null;
  sin_categoria?: boolean;
  sin_metodo?: boolean;
  sin_fecha?: boolean;
  ids?: number[];
  page?: number;
  per_page?: number;
}


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

  /** Tablero de cartera y cobranza: mora, antigüedad, recaudo y deudores. */
  getCartera(): Observable<any> {
    const url = this.env.rootUrl + 'api/cartera/resumen';
    return this.http.get<any>(url, { headers: this.getHeaders() });
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

  /**
   * Los clientes de la cartera. Con `incluirAlDia` entran también los que no
   * deben nada: sin eso, un cliente que termina de pagar desaparece de la
   * pantalla y no hay forma de abrir su historial desde acá.
   */
  getClientsPaginated(search: string, page: number, perPage: number, incluirAlDia = false): Observable<any> {
    let params = new HttpParams()
      .set('page', page)
      .set('per_page', perPage);
    if (search) params = params.set('search', search);
    if (incluirAlDia) params = params.set('al_dia', '1');
    return this.http.get<any>(this.env.rootUrl + 'api/facturation/clients', { headers: this.getHeaders(), params });
  }

  getClientInvoices(cabId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/facturation/clients/${cabId}/invoices`, { headers: this.getHeaders() });
  }

  /**
   * Cobrar una factura entera.
   *
   * La observación es para la referencia de la transferencia o el número de
   * recibo: queda en el movimiento y en la factura, que es lo que después
   * permite explicar un pago sin tener que acordarse.
   */
  payInvoice(detId: number, clientName: string, paymentMethodId?: number | null, observacion?: string | null): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/facturation/invoices/${detId}/pay`,
      JSON.stringify({ client_name: clientName, payment_method_id: paymentMethodId ?? null, observacion: observacion || null }),
      { headers: this.getHeaders() });
  }

  /** Deshacer un pago: la factura vuelve a quedar pendiente. */
  revertirPago(detId: number, motivo: string): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/facturation/invoices/${detId}/revertir`,
      JSON.stringify({ motivo }), { headers: this.getHeaders() });
  }

  /**
   * Borrar una factura que nunca debió existir.
   *
   * Sólo administración, y sólo si no se tocó plata. Para el resto está
   * anular, que deja rastro y no pierde el consecutivo.
   */
  borrarFactura(detId: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/facturation/invoices/${detId}`, { headers: this.getHeaders() });
  }

  /** Anular una factura mal hecha, sin borrarla. */
  anularFactura(detId: number, motivo: string): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/facturation/invoices/${detId}/anular`,
      JSON.stringify({ motivo }), { headers: this.getHeaders() });
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

  /** Sólo el token: para multipart el navegador pone su propio Content-Type. */
  private getAuthHeaders(): HttpHeaders {
    return new HttpHeaders({ 'Authorization': `Bearer ${this.getAuthToken()}` });
  }

  /** Los filtros de la pantalla de egresos, iguales para lista, tablero y CSV. */
  private egresosParams(f: FiltrosEgresos): HttpParams {
    let params = new HttpParams();
    if (f.search)            params = params.set('search', f.search);
    if (f.from)              params = params.set('from', f.from);
    if (f.to)                params = params.set('to', f.to);
    if (f.category)          params = params.set('category', f.category);
    if (f.payment_method_id) params = params.set('payment_method_id', f.payment_method_id);
    if (f.sin_categoria)     params = params.set('sin_categoria', 1);
    if (f.sin_metodo)        params = params.set('sin_metodo', 1);
    if (f.sin_fecha)         params = params.set('sin_fecha', 1);
    if (f.ids?.length)       params = params.set('ids', f.ids.join(','));
    if (f.page)              params = params.set('page', f.page);
    if (f.per_page)          params = params.set('per_page', f.per_page);
    return params;
  }

  getEgresosPaginated(f: FiltrosEgresos): Observable<any> {
    return this.http.get<any>(this.env.rootUrl + 'api/egresos/list',
      { headers: this.getHeaders(), params: this.egresosParams(f) });
  }

  /** Tablero: totales, comparaciones, categorías, evolución y avisos. */
  getEgresosTablero(f: FiltrosEgresos): Observable<any> {
    return this.http.get<any>(this.env.rootUrl + 'api/egresos/tablero',
      { headers: this.getHeaders(), params: this.egresosParams(f) });
  }

  createEgresoV2(data: FormData): Observable<any> {
    return this.http.post<any>(this.env.rootUrl + 'api/egresos/create-v2',
      data, { headers: this.getAuthHeaders() });
  }

  /** POST con _method=PUT: PHP no lee multipart en un PUT de verdad. */
  updateEgreso(id: number, data: FormData): Observable<any> {
    data.append('_method', 'PUT');
    return this.http.post<any>(`${this.env.rootUrl}api/egresos/${id}`,
      data, { headers: this.getAuthHeaders() });
  }

  deleteEgreso(id: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/egresos/${id}`, { headers: this.getHeaders() });
  }

  /** Crea el siguiente egreso de uno recurrente (sólo cuando el usuario lo pide). */
  repetirEgreso(id: number): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/egresos/${id}/repetir`, '{}', { headers: this.getHeaders() });
  }

  /** El comprobante vive en carpeta privada: se baja con el token, no por URL pública. */
  getComprobanteEgreso(id: number): Observable<Blob> {
    return this.http.get(`${this.env.rootUrl}api/egresos/${id}/comprobante`,
      { headers: this.getHeaders(), responseType: 'blob' });
  }

  exportEgresosCSV(f: FiltrosEgresos): Observable<Blob> {
    return this.http.get(`${this.env.rootUrl}api/egresos/export`,
      { headers: this.getHeaders(), params: this.egresosParams(f), responseType: 'blob' });
  }

  // ── Categorías de egreso (por empresa) ────────────────────────────────────

  getCategoriasEgreso(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/egresos/categorias`, { headers: this.getHeaders() });
  }

  crearCategoriaEgreso(name: string, color?: string | null): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/egresos/categorias`,
      JSON.stringify({ name, color: color ?? null }), { headers: this.getHeaders() });
  }

  actualizarCategoriaEgreso(id: number, data: { name?: string; color?: string | null }): Observable<any> {
    return this.http.put<any>(`${this.env.rootUrl}api/egresos/categorias/${id}`,
      JSON.stringify(data), { headers: this.getHeaders() });
  }

  alternarCategoriaEgreso(id: number): Observable<any> {
    return this.http.patch<any>(`${this.env.rootUrl}api/egresos/categorias/${id}/toggle`,
      '{}', { headers: this.getHeaders() });
  }

  eliminarCategoriaEgreso(id: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/egresos/categorias/${id}`, { headers: this.getHeaders() });
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

  getSendHistory(invoiceId: number | string): Observable<any> {
    return this.http.get<any>(
      `${this.env.rootUrl}api/generatePdf/sendHistory/${invoiceId}`,
      { headers: this.getHeaders() }
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

  // ── Logs de envío de facturas ─────────────────────────────────────────────

  getSendLogs(params: {
    channel?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    sent_to_email?: string;
    number_facture?: string;
    page?: number;
    per_page?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        httpParams = httpParams.set(key, value);
      }
    });
    return this.http.get<any>(
      `${this.env.rootUrl}api/generatePdf/send-logs`,
      { headers: this.getHeaders(), params: httpParams }
    );
  }
}
