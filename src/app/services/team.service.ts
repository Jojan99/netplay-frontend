import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';

/** Chat interno y llamadas entre agentes. */
@Injectable({ providedIn: 'root' })
export class TeamService {
  constructor(private http: HttpClient) {}
  private url(p: string) { return `${environment.rootUrl}api/management/${p}`; }
  private headers() { return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}`, Accept: 'application/json' }); }

  members() { return this.http.get<any>(this.url('team/members'), { headers: this.headers() }); }
  messages(withId: string | number, before?: number) {
    return this.http.get<any>(this.url('team/messages'), { headers: this.headers(), params: { with: String(withId), ...(before ? { before: String(before) } : {}) } });
  }
  send(to: number | null, content: string) { return this.http.post<any>(this.url('team/messages'), { to, content }, { headers: this.headers() }); }
  read(withId: string | number) { return this.http.post<any>(this.url('team/read'), { with: String(withId) }, { headers: this.headers() }); }
  sendFile(to: number | null, file: File, content = '') {
    const fd = new FormData(); fd.append('file', file); if (to != null) fd.append('to', String(to)); if (content) fd.append('content', content);
    return this.http.post<any>(this.url('team/messages'), fd, { headers: this.headers() });
  }
  signal(to: number, type: string, payload: any = null, callId = '', extra: { participants?: number[]; group?: boolean } = {}) {
    return this.http.post<any>(this.url('team/call/signal'), { to, type, payload, call_id: callId, ...extra }, { headers: this.headers() });
  }
  ice() { return this.http.get<any>(this.url('team/ice'), { headers: this.headers() }); }
}
