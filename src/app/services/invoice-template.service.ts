import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface InvoiceTemplate {
  id?: number;
  company_id?: number;
  name: string;
  type: 'classic' | 'modern' | 'minimal' | 'receipt';
  config: InvoiceTemplateConfig;
  is_default: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceTemplateConfig {
  primary_color?: string;
  accent_color?: string;
  show_logo?: boolean;
  show_activity?: boolean;
  show_iva_condition?: boolean;
  show_payment_info?: boolean;
  show_footer?: boolean;
  show_balance?: boolean;
  font_family?: string;
  layout?: 'default' | 'compact' | 'wide';
}

@Injectable({
  providedIn: 'root'
})
export class InvoiceTemplateService {
  private baseUrl = environment.rootUrl + 'api/company/invoice-templates';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') ?? '';
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    });
  }

  getAll(): Observable<any> {
    return this.http.get(this.baseUrl, { headers: this.getHeaders() });
  }

  getById(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/${id}`, { headers: this.getHeaders() });
  }

  create(template: Partial<InvoiceTemplate>): Observable<any> {
    return this.http.post(this.baseUrl, template, { headers: this.getHeaders() });
  }

  update(id: number, template: Partial<InvoiceTemplate>): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}`, template, { headers: this.getHeaders() });
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.baseUrl}/${id}`, { headers: this.getHeaders() });
  }

  setDefault(id: number): Observable<any> {
    return this.http.put(`${this.baseUrl}/${id}/set-default`, {}, { headers: this.getHeaders() });
  }

  preview(type: string, config: InvoiceTemplateConfig): Observable<any> {
    return this.http.get(`${this.baseUrl}/preview`, {
      headers: this.getHeaders(),
      params: { type, config: JSON.stringify(config) }
    });
  }
}
