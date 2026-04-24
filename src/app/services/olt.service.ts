import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OltService {

  env = environment

  constructor(private http: HttpClient) { }

  getAuthToken(): string | null {
    return localStorage.getItem('token');
  }

  getHeaders(): HttpHeaders {
    return new HttpHeaders({
      "Content-Type": "application/json",
      'Authorization': `Bearer ${this.getAuthToken()}`
    });
  }

  // ── Legacy ────────────────────────────────────────────────────────────────

  getOntPortFind(): Observable<any> {
    return this.http.get<any>(this.env.rootUrl + 'api/management/getOntPort', { headers: this.getHeaders() });
  }

  getOntdetail(): Observable<any> {
    return this.http.get<any>(this.env.rootUrl + 'api/management/getCpuStatusSnmpnew', { headers: this.getHeaders() });
  }

  getOntStatusAll(): Observable<any> {
    return this.http.get<any>(this.env.rootUrl + 'api/management/getOntStatusAll', { headers: this.getHeaders() });
  }

  // ── OLT CRUD ─────────────────────────────────────────────────────────────

  listOlts(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt`, { headers: this.getHeaders() });
  }

  createOlt(data: any): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  updateOlt(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.env.rootUrl}api/management/olt/${id}`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  deleteOlt(id: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/management/olt/${id}`, { headers: this.getHeaders() });
  }

  // ── ONT Queries ───────────────────────────────────────────────────────────

  getUnauthONTs(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/unauth`, { headers: this.getHeaders() });
  }

  getAuthorizedONTs(oltId: number, force = false): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/onts?force=${force}`, { headers: this.getHeaders() });
  }

  getOntInfo(oltId: number, fsp: string, ontId: number): Observable<any> {
    const params = new HttpParams().set('fsp', fsp).set('ont_id', ontId);
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/info`, { headers: this.getHeaders(), params });
  }

  getServicePorts(oltId: number, fsp?: string, ontId?: number): Observable<any> {
    let params = new HttpParams();
    if (fsp)    params = params.set('fsp', fsp);
    if (ontId !== undefined) params = params.set('ont_id', ontId);
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/service-ports`, { headers: this.getHeaders(), params });
  }

  getProfiles(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/profiles`, { headers: this.getHeaders() });
  }

  // ── ONT Write Operations ───────────────────────────────────────────────────

  registerONT(oltId: number, data: { fsp: string; serial?: string; description?: string; ont_id?: number | null; line_profile_id?: number | null; srv_profile_id?: number | null; vlan?: number | null }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/register`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  deleteONT(oltId: number, data: { fsp: string; ont_id: number }): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont`, { headers: this.getHeaders(), body: JSON.stringify(data) });
  }

  deactivateONT(oltId: number, data: { fsp: string; ont_id: number }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/deactivate`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  activateONT(oltId: number, data: { fsp: string; ont_id: number }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/activate`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  transferONT(oltId: number, data: { from_fsp: string; ont_id: number; to_fsp: string }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/transfer`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  autoAssignONT(oltId: number, data: { fsp: string; ont_id: number; vlan?: number; description?: string }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/auto-assign`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  syncProfiles(oltId: number): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/profiles/sync`, '{}', { headers: this.getHeaders() });
  }

  assignClientToOnt(oltId: number, fsp: string, ontId: number, userDataId: number | null): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/assign-client`,
      JSON.stringify({ fsp, ont_id: ontId, user_data_id: userDataId }), { headers: this.getHeaders() });
  }

  getOntByUserId(userId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/ont/by-user/${userId}`, { headers: this.getHeaders() });
  }

  cliCommand(oltId: number, command: string): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/cli`, JSON.stringify({ command }), { headers: this.getHeaders() });
  }
}
