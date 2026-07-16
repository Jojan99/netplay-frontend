import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ContractService {
  private env = environment;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });
  }

  private get base(): string {
    return `${this.env.rootUrl}api/contracts`;
  }

  // ── Plantillas ────────────────────────────────────────────────────────────

  getAll(): Observable<any> {
    return this.http.get(this.base, { headers: this.getHeaders() });
  }

  getById(id: number): Observable<any> {
    return this.http.get(`${this.base}/${id}`, { headers: this.getHeaders() });
  }

  create(data: { title: string; content: string }): Observable<any> {
    return this.http.post(this.base, JSON.stringify(data), { headers: this.getHeaders() });
  }

  update(id: number, data: { title: string; content: string; active: boolean }): Observable<any> {
    return this.http.put(`${this.base}/${id}`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  delete(id: number): Observable<any> {
    return this.http.delete(`${this.base}/${id}`, { headers: this.getHeaders() });
  }

  // ── Asignación a clientes ─────────────────────────────────────────────────

  assign(contractId: number, userId: number): Observable<any> {
    return this.http.post(
      `${this.base}/assign`,
      JSON.stringify({ contract_id: contractId, user_id: userId }),
      { headers: this.getHeaders() }
    );
  }

  getByUser(userId: number): Observable<any> {
    return this.http.get(`${this.base}/client/${userId}`, { headers: this.getHeaders() });
  }

  getClientContractById(clientContractId: number): Observable<any> {
    return this.http.get(`${this.base}/client-contract/${clientContractId}`, { headers: this.getHeaders() });
  }

  deleteClientContract(clientContractId: number): Observable<any> {
    return this.http.delete(`${this.base}/client-contract/${clientContractId}`, { headers: this.getHeaders() });
  }

  downloadPdf(clientContractId: number): Observable<Blob> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    return this.http.get(`${this.base}/pdf/${clientContractId}`, { headers, responseType: 'blob' });
  }

  // ── Envío ─────────────────────────────────────────────────────────────────

  sendByEmail(clientContractId: number, email: string): Observable<any> {
    return this.http.post(
      `${this.base}/send-email/${clientContractId}`,
      JSON.stringify({ email }),
      { headers: this.getHeaders() }
    );
  }

  sendByWhatsApp(clientContractId: number, phone: string): Observable<any> {
    return this.http.post(
      `${this.base}/send-whatsapp/${clientContractId}`,
      JSON.stringify({ phone }),
      { headers: this.getHeaders() }
    );
  }

  getSignUrl(token: string): string {
    return `${this.env.rootUrl}contrato/firmar/${token}`;
  }

  // ── Upload PDF → HTML ─────────────────────────────────────────────────────

  uploadPdf(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('pdf', file);
    const headers = new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });
    return this.http.post(`${this.env.rootUrl}api/contracts/upload-pdf`, formData, { headers });
  }

  // ── Upload PDF Base (fondo exacto) ──────────────────────────────────────────

  uploadPdfBase(contractId: number, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('pdf', file);
    const headers = new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });
    return this.http.post(`${this.env.rootUrl}api/contracts/${contractId}/pdf-base`, formData, { headers });
  }

  // ── Logo de plantilla ─────────────────────────────────────────────────────

  uploadLogo(contractId: number, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('logo', file);
    const headers = new HttpHeaders({
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    });
    return this.http.post(`${this.env.rootUrl}api/contracts/${contractId}/logo`, formData, { headers });
  }
}
