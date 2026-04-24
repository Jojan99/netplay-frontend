import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly base = environment.rootUrl + 'api/company/';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token') ?? ''}`,
    });
  }

  register(data: {
    name: string;
    nit: string;
    email: string;
    phone: string;
    address: string;
    admin_name: string;
    admin_lastname: string;
    admin_password: string;
  }): Observable<any> {
    return this.http.post(this.base + 'register', data);
  }

  getStaff(): Observable<any> {
    return this.http.get(this.base + 'staff', { headers: this.getHeaders() });
  }

  getProfiles(): Observable<any> {
    return this.http.get(this.base + 'profiles', { headers: this.getHeaders() });
  }

  getMyModules(): Observable<any> {
    return this.http.get(this.base + 'my-modules', { headers: this.getHeaders() });
  }

  getProfileModules(profileId: number): Observable<any> {
    return this.http.get(this.base + `profiles/${profileId}/modules`, { headers: this.getHeaders() });
  }

  updateProfileModules(profileId: number, modules: string[]): Observable<any> {
    return this.http.put(this.base + `profiles/${profileId}/modules`, { modules }, { headers: this.getHeaders() });
  }

  createStaff(data: {
    names: string;
    lastname: string;
    email: string;
    username: string;
    password: string;
    profile_id: number;
  }): Observable<any> {
    return this.http.post(this.base + 'staff/create', data, { headers: this.getHeaders() });
  }

  updateBillingConfig(schedules: {
    grupo: number;
    billing_day: number;
    billing_hour: number;
    active: boolean;
  }[]): Observable<any> {
    return this.http.put(this.base + 'billing-config', { schedules }, { headers: this.getHeaders() });
  }

  getAutoSuspendConfig(): Observable<any> {
    return this.http.get(this.base + 'auto-suspend', { headers: this.getHeaders() });
  }

  saveAutoSuspendConfig(cfg: { enabled: boolean; days_overdue: number; suspension_day: number }): Observable<any> {
    return this.http.put(this.base + 'auto-suspend', cfg, { headers: this.getHeaders() });
  }

  runAutoSuspend(): Observable<any> {
    return this.http.post(this.base + 'auto-suspend/run', {}, { headers: this.getHeaders() });
  }
}
