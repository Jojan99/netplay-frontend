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
  /** Nombre de la persona, para mostrar. El usuario es la cédula. */
  nombre?: string;
  /**
   * Dueño de la plataforma: le aparece la Consola de Netvula.
   *
   * Es sólo para decidir si se muestra el menú. El permiso de verdad lo
   * comprueba el servidor en cada pedido (users.es_plataforma).
   */
  es_plataforma?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY   = 'token';
  private readonly USER_KEY    = 'auth_user';
  private readonly MODULES_KEY = 'allowed_modules';

  login(data: any): void {
    // Limpiar todo antes de guardar para evitar mezcla entre sesiones
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.MODULES_KEY);
    localStorage.removeItem('employee_id');
    localStorage.removeItem('user_role');

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
      nombre:       data.nombre       ?? '',
      es_plataforma: !!data.es_plataforma,
    };
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    localStorage.setItem('employee_id', (data.employee_id ?? '').toString());
    localStorage.setItem('user_role', (data.profile_name ?? '').toUpperCase());
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
    localStorage.removeItem('employee_id');
    localStorage.removeItem('user_role');
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

  /** Nombre completo para mostrar ("Jojanny Manuel Pombo"); si no hay, la cédula. */
  getNombre(): string {
    const u = this.getUser();
    return AuthService.formatear(u?.nombre ?? '') || u?.username || '';
  }

  /** Sólo el primer nombre, para el saludo. */
  getPrimerNombre(): string {
    const n = AuthService.formatear(this.getUser()?.nombre ?? '');
    return n ? n.split(' ')[0] : (this.getUser()?.username ?? '');
  }

  /** Guarda el nombre en la sesión (las sesiones viejas no lo traían). */
  setNombre(nombre: string): void {
    const u = this.getUser();
    if (!u) return;
    localStorage.setItem(this.USER_KEY, JSON.stringify({ ...u, nombre }));
  }

  /** ¿Es el dueño de la plataforma? */
  esPlataforma(): boolean { return this.getUser()?.es_plataforma === true; }

  /**
   * Refresca la marca de plataforma en la sesión.
   *
   * Las sesiones abiertas antes de que existiera la marca no la traen; el
   * panel la vuelve a pedir al entrar, como ya hace con el nombre.
   */
  setPlataforma(es: boolean): void {
    const u = this.getUser();
    if (!u || u.es_plataforma === es) return;
    localStorage.setItem(this.USER_KEY, JSON.stringify({ ...u, es_plataforma: es }));
  }

  /** De "JOJANNY MANUEL POMBO" a "Jojanny Manuel Pombo". */
  static formatear(nombre: string): string {
    return nombre.trim().toLocaleLowerCase('es').replace(/\s+/g, ' ')
      .split(' ').map(p => p ? p.charAt(0).toLocaleUpperCase('es') + p.slice(1) : p).join(' ');
  }
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
