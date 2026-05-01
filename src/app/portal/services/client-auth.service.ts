import { Injectable } from '@angular/core';

export interface ClientUser {
  user_id:    number;
  company_id: number;
  profile_id: number;
  client: {
    id:       number;
    names:    string;
    lastname: string;
    email:    string;
    phone:    string;
    address:  string;
  } | null;
  company: {
    id:      number;
    name:    string;
    slug:    string;
    logo:    string | null;
    phone:   string | null;
    email:   string | null;
    address: string | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class ClientAuthService {
  private readonly TOKEN_KEY = 'client_token';
  private readonly USER_KEY  = 'client_user';

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  save(data: any): void {
    if (!this.isBrowser()) return;
    localStorage.setItem(this.TOKEN_KEY, data.access_token);
    const user: ClientUser = {
      user_id:    data.user_id    ?? 0,
      company_id: data.company_id ?? 0,
      profile_id: data.profile_id ?? 0,
      client:     data.client     ?? null,
      company:    data.company    ?? null,
    };
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  logout(): void {
    if (!this.isBrowser()) return;
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  getToken(): string | null {
    if (!this.isBrowser()) return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getUser(): ClientUser | null {
    if (!this.isBrowser()) return null;
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  getFullName(): string {
    const u = this.getUser();
    if (!u?.client) return '';
    return `${u.client.names} ${u.client.lastname}`;
  }

  getCompanyName(): string {
    return this.getUser()?.company?.name ?? '';
  }

  getCompanyLogo(): string {
    return this.getUser()?.company?.logo ?? '';
  }
}
