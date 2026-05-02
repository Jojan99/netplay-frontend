import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class LandingAdminService {
  private http    = inject(HttpClient);
  private baseUrl = `${environment.rootUrl}api/landing-admin`;

  // El authInterceptor existente ya inyecta el Bearer token del admin
  getConfig(): Observable<any>  { return this.http.get(`${this.baseUrl}/config`); }
  saveConfig(data: any): Observable<any> { return this.http.post(`${this.baseUrl}/config`, data); }

  getSections(): Observable<any>              { return this.http.get(`${this.baseUrl}/sections`); }
  createSection(data: any): Observable<any>   { return this.http.post(`${this.baseUrl}/sections`, data); }
  updateSection(id: number, data: any): Observable<any> { return this.http.put(`${this.baseUrl}/sections/${id}`, data); }
  deleteSection(id: number): Observable<any>  { return this.http.delete(`${this.baseUrl}/sections/${id}`); }
  reorderSections(order: number[]): Observable<any> { return this.http.put(`${this.baseUrl}/sections/reorder`, { order }); }

  getNav(): Observable<any>               { return this.http.get(`${this.baseUrl}/nav`); }
  createNav(data: any): Observable<any>   { return this.http.post(`${this.baseUrl}/nav`, data); }
  updateNav(id: number, data: any): Observable<any> { return this.http.put(`${this.baseUrl}/nav/${id}`, data); }
  deleteNav(id: number): Observable<any>  { return this.http.delete(`${this.baseUrl}/nav/${id}`); }
}
