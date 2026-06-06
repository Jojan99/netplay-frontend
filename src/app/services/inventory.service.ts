import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  env = environment;

  constructor(private http: HttpClient) {}

  getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.getAuthToken()}`,
    });
  }

  getAuthToken(): string | null {
    return localStorage.getItem('token');
  }

  // ── Categories ──────────────────────────────────────────────────────────────

  getCategories(): Observable<any> {
    return this.http.get(`${this.env.rootUrl}api/inventory/categories`, { headers: this.getHeaders() });
  }

  createCategory(data: { name: string; description?: string }): Observable<any> {
    return this.http.post(
      `${this.env.rootUrl}api/inventory/categories`,
      JSON.stringify(data),
      { headers: this.getHeaders() }
    );
  }

  updateCategory(id: number, data: { name?: string; description?: string }): Observable<any> {
    return this.http.put(
      `${this.env.rootUrl}api/inventory/categories/${id}`,
      JSON.stringify(data),
      { headers: this.getHeaders() }
    );
  }

  deleteCategory(id: number): Observable<any> {
    return this.http.delete(`${this.env.rootUrl}api/inventory/categories/${id}`, { headers: this.getHeaders() });
  }

  // ── Items ────────────────────────────────────────────────────────────────────

  getItems(params?: {
    q?: string;
    category_id?: number;
    location?: string;
    low_stock?: boolean;
    sort_by?: string;
    sort_direction?: string;
    per_page?: number;
    page?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }
    return this.http.get(`${this.env.rootUrl}api/inventory/items`, {
      headers: this.getHeaders(),
      params: httpParams,
    });
  }

  getItem(id: number): Observable<any> {
    return this.http.get(`${this.env.rootUrl}api/inventory/items/${id}`, { headers: this.getHeaders() });
  }

  createItem(data: any): Observable<any> {
    return this.http.post(
      `${this.env.rootUrl}api/inventory/items`,
      JSON.stringify(data),
      { headers: this.getHeaders() }
    );
  }

  updateItem(id: number, data: any): Observable<any> {
    return this.http.put(
      `${this.env.rootUrl}api/inventory/items/${id}`,
      JSON.stringify(data),
      { headers: this.getHeaders() }
    );
  }

  deleteItem(id: number): Observable<any> {
    return this.http.delete(`${this.env.rootUrl}api/inventory/items/${id}`, { headers: this.getHeaders() });
  }

  getLowStock(): Observable<any> {
    return this.http.get(`${this.env.rootUrl}api/inventory/low-stock`, { headers: this.getHeaders() });
  }

  getLocations(): Observable<any> {
    return this.http.get(`${this.env.rootUrl}api/inventory/locations`, { headers: this.getHeaders() });
  }

  // ── Movements ────────────────────────────────────────────────────────────────

  getMovements(params?: {
    inventory_id?: number;
    type?: string;
    reference?: string;
    date_from?: string;
    date_to?: string;
    per_page?: number;
    page?: number;
  }): Observable<any> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }
    return this.http.get(`${this.env.rootUrl}api/inventory/movements`, {
      headers: this.getHeaders(),
      params: httpParams,
    });
  }

  getItemMovements(inventoryId: number, page?: number, perPage?: number): Observable<any> {
    let params = new HttpParams();
    if (page) params = params.set('page', String(page));
    if (perPage) params = params.set('per_page', String(perPage));
    return this.http.get(`${this.env.rootUrl}api/inventory/movements/${inventoryId}`, {
      headers: this.getHeaders(),
      params,
    });
  }

  createMovement(data: {
    inventory_id:   number;
    type:           'entrada' | 'salida' | 'ajuste';
    quantity:       number;
    unit_price?:    number;
    description?:   string;
    reference?:     string;
    serial_number?: string;
    batch_number?:  string;
    expiry_date?:   string;
  }): Observable<any> {
    return this.http.post(
      `${this.env.rootUrl}api/inventory/movements`,
      JSON.stringify(data),
      { headers: this.getHeaders() }
    );
  }
}
