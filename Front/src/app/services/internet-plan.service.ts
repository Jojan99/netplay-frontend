import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InternetPlanService {
  private get base(): string { return `${environment.rootUrl}api/plans`; }

  constructor(private http: HttpClient) {}

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });
  }

  getAll(): Observable<any> {
    return this.http.get(this.base, { headers: this.headers() });
  }

  create(data: any): Observable<any> {
    return this.http.post(this.base, JSON.stringify(data), { headers: this.headers() });
  }

  update(id: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/${id}`, JSON.stringify(data), { headers: this.headers() });
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`, { headers: this.headers() });
  }

  toggle(id: number): Observable<any> {
    return this.http.patch(`${this.base}/${id}/toggle`, {}, { headers: this.headers() });
  }
}
