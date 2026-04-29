import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TransferOrder {
  id?: number;
  company_id?: number;
  user_data_id: number;
  old_router_id?: number;
  new_router_id?: number;
  old_address: string;
  new_address: string;
  new_neighborhood?: string;
  old_ip?: string;
  new_ip?: string;
  scheduled_date: string;
  scheduled_time: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  payment_status: 'not_required' | 'pending' | 'paid' | 'verified' | 'rejected';
  transfer_cost: number;
  payment_amount?: number;
  payment_reference?: string;
  payment_image_url?: string;
  technician_1_id?: number;
  technician_2_id?: number;
  commission_amount: number;
  observations?: string;
  technical_notes?: string;
  created_by?: number;
  assigned_by?: number;
  started_at?: string;
  finished_at?: string;

  client?: any;
  oldRouter?: any;
  newRouter?: any;
  technician1?: any;
  technician2?: any;
}

export interface TransferFilter {
  status?: string;
  payment_status?: string;
  technician_id?: number;
  date_from?: string;
  date_to?: string;
  per_page?: number;
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class TransferService {
  private baseUrl = '/api/transfers';

  constructor(private http: HttpClient) {}

  getAll(filter?: TransferFilter): Observable<any> {
    let params = new HttpParams();
    if (filter) {
      if (filter.status) params = params.set('status', filter.status);
      if (filter.payment_status) params = params.set('payment_status', filter.payment_status);
      if (filter.technician_id) params = params.set('technician_id', filter.technician_id.toString());
      if (filter.date_from) params = params.set('date_from', filter.date_from);
      if (filter.date_to) params = params.set('date_to', filter.date_to);
      if (filter.per_page) params = params.set('per_page', filter.per_page.toString());
      if (filter.page) params = params.set('page', filter.page.toString());
    }
    return this.http.get(this.baseUrl, { params });
  }

  getById(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}`);
  }

  create(data: Partial<TransferOrder>): Observable<any> {
    return this.http.post(this.baseUrl, data);
  }

  update(id: number, data: Partial<TransferOrder>): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}`, data);
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  confirm(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/confirm`, {});
  }

  start(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/start`, {});
  }

  complete(id: number, data?: { new_ip?: string; technical_notes?: string; update_client_address?: boolean }): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/complete`, data || {});
  }

  cancel(id: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/cancel`, {});
  }

  updatePayment(id: number, data: { payment_status: string; payment_amount?: number; payment_reference?: string }): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}/payment`, data);
  }

  assignTechnicians(id: number, data: { technician_1_id?: number; technician_2_id?: number; commission_amount?: number }): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}/technicians`, data);
  }

  getCommission(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/commission`);
  }

  getDashboard(): Observable<any> {
    return this.http.get(`${this.baseUrl}/dashboard`);
  }

  getTechnicians(): Observable<any> {
    return this.http.get(`${this.baseUrl}/technicians`);
  }

  getRouters(): Observable<any> {
    return this.http.get(`${this.baseUrl}/routers`);
  }
}