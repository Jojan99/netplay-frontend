import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class EmployeeService {
  private env = environment;
  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });
  }

  private get base(): string { return `${this.env.rootUrl}api/employees`; }

  // ── Empleados ─────────────────────────────────────────────────────────────
  getAll(params: any = {}): Observable<any> {
    const q = new URLSearchParams(params).toString();
    return this.http.get(`${this.base}${q ? '?' + q : ''}`, { headers: this.getHeaders() });
  }
  getAvailableStaff(): Observable<any> {
    return this.http.get(`${this.base}/available-staff`, { headers: this.getHeaders() });
  }
  getById(id: number): Observable<any> {
    return this.http.get(`${this.base}/${id}`, { headers: this.getHeaders() });
  }
  create(data: any): Observable<any> {
    return this.http.post(this.base, JSON.stringify(data), { headers: this.getHeaders() });
  }
  update(id: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/${id}`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  delete(id: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`, { headers: this.getHeaders() });
  }

  // ── Contrato laboral ──────────────────────────────────────────────────────
  upsertLaborContract(id: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/${id}/labor-contract`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  // ── Afiliaciones ──────────────────────────────────────────────────────────
  upsertAffiliation(id: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/${id}/affiliation`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  // ── Cuenta bancaria ───────────────────────────────────────────────────────
  upsertBankAccount(id: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/${id}/bank-account`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  // ── Dotaciones ────────────────────────────────────────────────────────────
  getEquipment(id: number): Observable<any> {
    return this.http.get(`${this.base}/${id}/equipment`, { headers: this.getHeaders() });
  }
  createEquipment(id: number, data: any): Observable<any> {
    return this.http.post(`${this.base}/${id}/equipment`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  updateEquipment(id: number, eqId: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/${id}/equipment/${eqId}`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  deleteEquipment(id: number, eqId: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}/equipment/${eqId}`, { headers: this.getHeaders() });
  }

  // ── Descargos ─────────────────────────────────────────────────────────────
  getDisciplinary(id: number): Observable<any> {
    return this.http.get(`${this.base}/${id}/disciplinary`, { headers: this.getHeaders() });
  }
  createDisciplinary(id: number, data: any): Observable<any> {
    return this.http.post(`${this.base}/${id}/disciplinary`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  updateDisciplinary(id: number, recId: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/${id}/disciplinary/${recId}`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  deleteDisciplinary(id: number, recId: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}/disciplinary/${recId}`, { headers: this.getHeaders() });
  }

  // ── Ubicación (técnicos) ──────────────────────────────────────────────────
  updateMyLocation(latitude: number, longitude: number): Observable<any> {
    return this.http.put(`${this.base}/my-location`, { latitude, longitude }, { headers: this.getHeaders() });
  }

  getTechnicianLocations(): Observable<any> {
    return this.http.get(`${this.base}/technician-locations`, { headers: this.getHeaders() });
  }

  // ── Nómina ────────────────────────────────────────────────────────────────
  getPayrolls(id: number): Observable<any> {
    return this.http.get(`${this.base}/${id}/payroll`, { headers: this.getHeaders() });
  }
  createPayroll(id: number, data: any): Observable<any> {
    return this.http.post(`${this.base}/${id}/payroll`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  updatePayroll(id: number, payId: number, data: any): Observable<any> {
    return this.http.put(`${this.base}/${id}/payroll/${payId}`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  deletePayroll(id: number, payId: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}/payroll/${payId}`, { headers: this.getHeaders() });
  }
}
