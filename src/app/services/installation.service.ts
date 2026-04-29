import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface InstallationOrder {
  id?: number;
  company_id?: number;
  user_data_id?: number;
  client_name: string;
  client_dni: string;
  client_phone: string;
  client_email?: string;
  address: string;
  neighborhood?: string;
  internet_plan_id?: number;
  scheduled_date: string;
  scheduled_time: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'verified' | 'rejected';
  payment_amount?: number | null;
  payment_reference?: string;
  payment_image_url?: string;
  payment_method_id?: number | null;
  technician_ids?: number[];
  installation_cost?: number | null;
  commission_amount?: number | null;
  observations?: string;
  technical_notes?: string;
  created_by?: number;
  assigned_by?: number;
  started_at?: string;
  finished_at?: string;

  client?: any;
  plan?: any;
  paymentMethod?: any;
  logs?: InstallationLog[];
}

export interface InstallationLog {
  id?: number;
  installation_id: number;
  action: string;
  description: string;
  notes?: string;
  created_by?: number;
  created_by_name?: string;
  created_at?: string;
}

export interface InstallationFilter {
  status?: string;
  payment_status?: string;
  technician_id?: number;
  date_from?: string;
  date_to?: string;
  per_page?: number;
  page?: number;
}

@Injectable({ providedIn: 'root' })
export class InstallationService {
  private baseUrl = '/api/installations';

  constructor(private http: HttpClient) {}

  getAll(filter?: InstallationFilter): Observable<any> {
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

  create(data: Partial<InstallationOrder>): Observable<any> {
    return this.http.post(this.baseUrl, data);
  }

  update(id: number, data: Partial<InstallationOrder>): Observable<any> {
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

  complete(id: number, notes?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/complete`, { technical_notes: notes });
  }

  cancel(id: number, reason?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/cancel`, { reason });
  }

  updatePayment(id: number, data: { payment_status: string; payment_amount?: number; payment_reference?: string; payment_method_id?: number }): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}/payment`, data);
  }

  assignTechnicians(id: number, data: { technician_ids?: number[]; commission_amount?: number }): Observable<any> {
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

  getPlans(): Observable<any> {
    return this.http.get(`${this.baseUrl}/plans`);
  }

  getPaymentMethods(): Observable<any> {
    return this.http.get(`${this.baseUrl}/payment-methods`);
  }

  getLogs(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}/logs`);
  }

  createLog(id: number, data: { action: string; description: string; notes?: string }): Observable<any> {
    return this.http.post(`${this.baseUrl}/${id}/logs`, data);
  }
}