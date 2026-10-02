import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';

/** La cuenta de la empresa con Netvula: prueba, pagos pendientes y suspensión. */
export interface EstadoDeCuenta {
  empresa: string | null;
  nivel: 'ok' | 'aviso' | 'urgente' | 'suspendida';
  mensaje: string | null;
  estado: string | null;
  plan: string | null;
  suspendida: boolean;
  motivo: string | null;
  prueba_hasta: string | null;
  limite: string | null;
  pendiente: number;
  vence: string | null;
  soporte: { whatsapp: string | null; correo: string | null };
  complementos?: { tr069?: ComplementoTr069 };
}

/** El TR-069 se contrata aparte del plan: si está activo, si ya se exige y a cuánto. */
export interface ComplementoTr069 {
  contratado: boolean;
  exigido: boolean;
  bloqueado: boolean;
  desde: string | null;
  precio: number;
  /** Equipos que reportan al ACS y el tramo de precio que les corresponde. */
  equipos?: number | null;
  hasta?: number | null;
  tramos?: { hasta: number; precio: number }[];
  lo_usa: boolean;
}

const GUARDADA = 'cuenta_suspendida';

@Injectable({ providedIn: 'root' })
export class CuentaService {
  private http = inject(HttpClient);

  /** Lo último que se supo de la cuenta; lo leen las pantallas que dependen de un complemento. */
  static readonly cuenta = signal<EstadoDeCuenta | null>(null);
  /** El complemento TR-069. También lo marca el interceptor cuando el servidor responde «no activo». */
  static readonly tr069 = signal<Partial<ComplementoTr069> | null>(null);

  /** Con la empresa suspendida responde 403 y el interceptor abre la pantalla de cuenta suspendida. */
  ver(): Observable<EstadoDeCuenta> {
    return this.http.get<any>(environment.rootUrl + 'api/company/mi-cuenta').pipe(
      map(r => r?.data as EstadoDeCuenta),
      tap(c => { CuentaService.cuenta.set(c ?? null); CuentaService.tr069.set(c?.complementos?.tr069 ?? null); }),
    );
  }

  /** Lo último que dijo el servidor al rechazar a la empresa: es lo que muestra la pantalla de suspensión. */
  static guardar(cuenta: unknown): void {
    try { sessionStorage.setItem(GUARDADA, JSON.stringify(cuenta ?? {})); } catch { /* sin almacenamiento */ }
  }

  static guardada(): EstadoDeCuenta | null {
    try { return JSON.parse(sessionStorage.getItem(GUARDADA) || 'null'); } catch { return null; }
  }

  static olvidar(): void {
    try { sessionStorage.removeItem(GUARDADA); } catch { /* sin almacenamiento */ }
  }
}
