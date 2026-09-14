import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { RouteProps } from '../common/components';
import { AuthService } from './auth.service';

export interface ModuloDelMenu { titulo: string; href: string; grupo: string; icono?: string; }

export type TipoDeVentana = 'cliente' | 'equipo' | 'ticket' | 'facturas' | 'alertas';

export interface ClienteCorto { id: number; nombre: string; }

export interface VentanaRapida {
  id: number;
  tipo: TipoDeVentana;
  cliente: ClienteCorto | null;
  x: number;
  y: number;
  /** Orden de apilado: la de número más alto va encima. */
  orden: number;
  min: boolean;
}

export const TIPOS_DE_VENTANA: Record<TipoDeVentana, { titulo: string; sub: string; modulo: string | null }> = {
  cliente:  { titulo: 'Buscar cliente',      sub: 'Servicio, deuda y equipo',   modulo: null },
  equipo:   { titulo: 'Equipo del cliente',  sub: 'ONT y señal en vivo',        modulo: 'olt-admin' },
  ticket:   { titulo: 'Crear ticket',        sub: 'Con diagnóstico automático', modulo: 'created-ticket' },
  facturas: { titulo: 'Facturas pendientes', sub: 'Saldo y estado de cuenta',   modulo: 'finanzas' },
  alertas:  { titulo: 'Alertas de red',      sub: 'Abiertas ahora',             modulo: 'olt-admin' },
};

export const ICONOS = {
  estrella:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  estrellaV: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  cliente:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  equipo:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 16.5h.01M11 16.5h.01M8 9a6 6 0 0 1 8 0M5 6a10 10 0 0 1 14 0"/></svg>',
  ticket:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M13 7v10" stroke-dasharray="2 2"/></svg>',
  facturas:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
  alertas:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>',
  modulo:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  puerto:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5v14"/><circle cx="12" cy="12" r="9"/></svg>',
  buscar:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  ventanas:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="13" height="11" rx="2"/><path d="M8 19h11a2 2 0 0 0 2-2V9"/></svg>',
  minimizar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 12h12"/></svg>',
  cerrar:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};

/** Desde el iPad mini en vertical: en teléfono las ventanas no tienen dónde vivir. */
const PANTALLA_GRANDE = '(min-width: 768px)';
const CLAVE_VENTANAS = 'np_ventanas_rapidas';

/**
 * Atajos del panel: módulos favoritos, buscador con Ctrl+K y ventanas rápidas
 * (consultas chicas que flotan encima de la pantalla en la que se está).
 */
@Injectable({ providedIn: 'root' })
export class AtajosService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private navegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly grande = signal(false);
  readonly modulos = signal<ModuloDelMenu[]>([]);
  readonly favoritos = signal<string[]>([]);
  readonly buscadorAbierto = signal(false);
  readonly ventanas = signal<VentanaRapida[]>([]);

  /** Los favoritos que siguen en el menú de esta persona, en el orden en que se marcaron. */
  readonly misAtajos = computed(() => {
    const menu = this.modulos();
    return this.favoritos().map(h => menu.find(m => m.href === h)).filter((m): m is ModuloDelMenu => !!m);
  });

  private siguienteId = 1;

  constructor() {
    if (!this.navegador) return;

    const mq = window.matchMedia(PANTALLA_GRANDE);
    this.grande.set(mq.matches);
    mq.addEventListener('change', e => {
      this.grande.set(e.matches);
      if (!e.matches) this.buscadorAbierto.set(false);
    });

    this.favoritos.set(this.leer(this.claveFavoritos(), []));
    const guardadas = this.leer<VentanaRapida[]>(CLAVE_VENTANAS, []);
    this.ventanas.set(guardadas.filter(v => TIPOS_DE_VENTANA[v.tipo]).map(v => this.dentroDeLaPantalla(v)));
    this.siguienteId = Math.max(0, ...this.ventanas().map(v => v.id)) + 1;
  }

  // ── Menú y favoritos ────────────────────────────────────────────────

  ponerMenu(menu: RouteProps[]): void {
    const planos: ModuloDelMenu[] = [];
    for (const item of menu) {
      if (item.group && item.children) {
        for (const hijo of item.children) {
          if (hijo.href) planos.push({ titulo: hijo.title, href: hijo.href, grupo: item.title, icono: hijo.icon });
        }
      } else if (item.href) {
        planos.push({ titulo: item.title, href: item.href, grupo: 'Operación', icono: item.icon });
      }
    }
    this.modulos.set(planos);
    // La lista de favoritos es por persona: al entrar con otra cuenta cambia.
    this.favoritos.set(this.leer(this.claveFavoritos(), []));
  }

  esFavorito(href?: string): boolean { return !!href && this.favoritos().includes(href); }

  alternarFavorito(href: string): boolean {
    const ahora = this.esFavorito(href) ? this.favoritos().filter(f => f !== href) : [...this.favoritos(), href];
    this.favoritos.set(ahora);
    this.escribir(this.claveFavoritos(), ahora);
    return ahora.includes(href);
  }

  /** Si el menú de esta persona incluye el módulo (mismo criterio que el menú lateral). */
  tieneModulo(modulo: string | null): boolean {
    if (!modulo) return true;
    return this.auth.getAllowedModules().some(m => m === modulo || modulo.toLowerCase().startsWith(m.toLowerCase() + '/'));
  }

  puedeAbrir(tipo: TipoDeVentana): boolean { return this.tieneModulo(TIPOS_DE_VENTANA[tipo].modulo); }

  // ── Buscador ────────────────────────────────────────────────────────

  abrirBuscador(): void { if (this.grande()) this.buscadorAbierto.set(true); }
  cerrarBuscador(): void { this.buscadorAbierto.set(false); }

  // ── Ventanas ────────────────────────────────────────────────────────

  /** Una ventana por tipo: si ya está abierta se trae adelante (con el cliente nuevo, si llega uno). */
  abrirVentana(tipo: TipoDeVentana, cliente: ClienteCorto | null = null): void {
    if (!this.grande() || !this.puedeAbrir(tipo)) return;

    const ya = this.ventanas().find(v => v.tipo === tipo);
    if (ya) {
      this.cambiar(ya.id, { min: false, orden: this.ordenArriba(), ...(cliente ? { cliente } : {}) });
      return;
    }

    const n = this.ventanas().length;
    const ancho = Math.min(380, window.innerWidth - 32);
    this.ventanas.update(lista => [...lista, {
      id: this.siguienteId++,
      tipo,
      cliente,
      x: Math.max(16, window.innerWidth - ancho - 24 - (n % 4) * 36),
      y: 72 + (n % 4) * 34,
      orden: this.ordenArriba(),
      min: false,
    }]);
    this.guardarVentanas();
  }

  enfocar(id: number): void {
    const v = this.ventanas().find(x => x.id === id);
    if (v && v.orden !== this.ordenArriba() - 1) this.cambiar(id, { orden: this.ordenArriba() });
  }

  minimizar(id: number): void { this.cambiar(id, { min: true }); }
  restaurar(id: number): void { this.cambiar(id, { min: false, orden: this.ordenArriba() }); }
  ponerCliente(id: number, cliente: ClienteCorto | null): void { this.cambiar(id, { cliente }); }
  mover(id: number, x: number, y: number, guardar = false): void { this.cambiar(id, { x, y }, guardar); }

  cerrar(id: number): void {
    this.ventanas.update(lista => lista.filter(v => v.id !== id));
    this.guardarVentanas();
  }

  private cambiar(id: number, parte: Partial<VentanaRapida>, guardar = true): void {
    this.ventanas.update(lista => lista.map(v => v.id === id ? { ...v, ...parte } : v));
    if (guardar) this.guardarVentanas();
  }

  private ordenArriba(): number { return Math.max(0, ...this.ventanas().map(v => v.orden)) + 1; }

  private dentroDeLaPantalla(v: VentanaRapida): VentanaRapida {
    return { ...v, x: Math.min(Math.max(8, v.x), window.innerWidth - 120), y: Math.min(Math.max(60, v.y), window.innerHeight - 60) };
  }

  private guardarVentanas(): void { this.escribir(CLAVE_VENTANAS, this.ventanas()); }

  // ── Datos ───────────────────────────────────────────────────────────

  buscar(q: string): Observable<any> {
    return this.http.get(`${environment.rootUrl}api/atajos/buscar?q=${encodeURIComponent(q)}`, this.h());
  }

  cliente(userId: number): Observable<any> {
    return this.http.get(`${environment.rootUrl}api/atajos/cliente/${userId}`, this.h());
  }

  crearTicket(datos: any): Observable<any> {
    return this.http.post(`${environment.rootUrl}api/ticket/createTicket`, datos, this.h());
  }

  private h() {
    return { headers: new HttpHeaders({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` }) };
  }

  // ── localStorage ────────────────────────────────────────────────────

  private claveFavoritos(): string {
    const u = this.auth.getUser();
    return `np_atajos_favoritos:${u?.company_id ?? 0}:${u?.username ?? ''}`;
  }

  private leer<T>(clave: string, porDefecto: T): T {
    try { return JSON.parse(localStorage.getItem(clave) || 'null') ?? porDefecto; } catch { return porDefecto; }
  }

  private escribir(clave: string, valor: unknown): void {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin espacio o bloqueado: sólo dura la sesión */ }
  }
}
