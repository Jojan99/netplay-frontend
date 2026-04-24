import { Injectable } from '@angular/core';

export interface AuthUser {
  userId: number;
  company_id: number;
  profile_id: number;
  profile_name: string;
  username: string;
  email: string;
  company_name: string;
  company_logo: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY   = 'token';
  private readonly USER_KEY    = 'auth_user';
  private readonly MODULES_KEY = 'allowed_modules';

  login(data: any): void {
    localStorage.setItem(this.TOKEN_KEY, data.access_token);
    const user: AuthUser = {
      userId:       data.userId       ?? 0,
      company_id:   data.company_id   ?? 0,
      profile_id:   data.profile_id   ?? 0,
      profile_name: (data.profile_name ?? '').toUpperCase(),
      username:     data.user?.user   ?? '',
      email:        data.user?.email  ?? '',
      company_name: data.company_name ?? '',
      company_logo: data.company_logo ?? '',
    };
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  setModules(modules: string[]): void {
    localStorage.setItem(this.MODULES_KEY, JSON.stringify(modules));
  }

  getAllowedModules(): string[] {
    const raw = localStorage.getItem(this.MODULES_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.MODULES_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  getUser(): AuthUser | null {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  getProfileId(): number   { return this.getUser()?.profile_id   ?? 0; }
  getProfileName(): string { return this.getUser()?.profile_name ?? ''; }
  getCompanyId(): number   { return this.getUser()?.company_id   ?? 0; }
  getCompanyName(): string { return this.getUser()?.company_name ?? 'NetPlay'; }
  getCompanyLogo(): string { return this.getUser()?.company_logo ?? ''; }
  getUsername(): string    { return this.getUser()?.username     ?? ''; }

  isAdmin():    boolean { return this.getProfileName() === 'ADMIN'; }
  isTecnico():  boolean { return this.getProfileName() === 'TECNICO'; }
  isContador(): boolean { return this.getProfileName() === 'CONTADOR'; }

  getRoleName(): string {
    const map: Record<string, string> = {
      'ADMIN':    'Administrador',
      'TECNICO':  'Técnico',
      'CONTADOR': 'Contador',
      'USER':     'Usuario',
    };
    return map[this.getProfileName()] ?? this.getProfileName() ?? 'Sin rol';
  }
}
