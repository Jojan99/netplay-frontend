import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PaymentProofService {
  private readonly baseUrl = `${environment.rootUrl}api`;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
    });
  }

  list(params?: any): Observable<any> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          query.append(key, String(value));
        }
      });
    }
    return this.http.get(`${this.baseUrl}/payment-proofs?${query.toString()}`, { headers: this.getHeaders() });
  }

  get(id: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/payment-proofs/${id}`, { headers: this.getHeaders() });
  }

  approve(id: number, payload: any = {}): Observable<any> {
    return this.http.post(`${this.baseUrl}/payment-proofs/${id}/approve`, JSON.stringify(payload), { headers: this.getHeaders() });
  }

  reject(id: number, payload: any = {}): Observable<any> {
    return this.http.post(`${this.baseUrl}/payment-proofs/${id}/reject`, JSON.stringify(payload), { headers: this.getHeaders() });
  }

  suspicious(id: number, payload: any = {}): Observable<any> {
    return this.http.post(`${this.baseUrl}/payment-proofs/${id}/suspicious`, JSON.stringify(payload), { headers: this.getHeaders() });
  }

  revert(id: number, payload: any = {}): Observable<any> {
    return this.http.post(`${this.baseUrl}/payment-proofs/${id}/revert`, JSON.stringify(payload), { headers: this.getHeaders() });
  }
}
