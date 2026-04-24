import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
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

  // ── Items ────────────────────────────────────────────────────────────────────

  getItems(): Observable<any> {
    return this.http.get(`${this.env.rootUrl}api/inventory/items`, { headers: this.getHeaders() });
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

  // ── Movements ────────────────────────────────────────────────────────────────

  getMovements(): Observable<any> {
    return this.http.get(`${this.env.rootUrl}api/inventory/movements`, { headers: this.getHeaders() });
  }

  getItemMovements(inventoryId: number): Observable<any> {
    return this.http.get(`${this.env.rootUrl}api/inventory/movements/${inventoryId}`, { headers: this.getHeaders() });
  }

  createMovement(data: {
    inventory_id: number;
    type: 'entrada' | 'salida' | 'ajuste';
    quantity: number;
    unit_price?: number;
    description?: string;
    reference?: string;
  }): Observable<any> {
    return this.http.post(
      `${this.env.rootUrl}api/inventory/movements`,
      JSON.stringify(data),
      { headers: this.getHeaders() }
    );
  }
}
