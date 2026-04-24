import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MikrotikService {
  private base = `${environment.rootUrl}api/management`;

  constructor(private http: HttpClient) {}

  private h() {
    return {
      headers: new HttpHeaders({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') ?? ''}`,
      }),
    };
  }

  getRouterInfo(): Observable<any> {
    return this.http.get(`${this.base}/router-info`, this.h());
  }

  getConnectedClients(): Observable<any> {
    return this.http.get(`${this.base}/clients`, this.h());
  }

  getQueues(): Observable<any> {
    return this.http.get(`${this.base}/queues`, this.h());
  }

  createQueue(data: any): Observable<any> {
    return this.http.post(`${this.base}/queues`, data, this.h());
  }

  updateQueue(id: string, data: any): Observable<any> {
    return this.http.put(`${this.base}/queues/${id}`, data, this.h());
  }

  deleteQueue(id: string): Observable<any> {
    return this.http.delete(`${this.base}/queues/${id}`, this.h());
  }

  suspendBulk(userIds: number[]): Observable<any> {
    return this.http.post(`${this.base}/suspend-bulk`, { user_ids: userIds }, this.h());
  }

  getRouterConfig(): Observable<any> {
    return this.http.get(`${this.base}/router-config`, this.h());
  }

  saveRouterConfig(data: any): Observable<any> {
    return this.http.post(`${this.base}/router-config`, data, this.h());
  }
}
