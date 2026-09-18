import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ConsolaAuthService } from './consola-auth.service';

/** Lo que la consola muestra de cada empresa. */
export interface EmpresaConsola {
  id: number;
  nombre: string;
  slug: string;
  subdominio: string | null;
  dominio_propio: string | null;
  nit: string | null;
  email: string | null;
  telefono: string | null;
  registrada: string | null;
  confirmada: boolean;
  activa: boolean;
  suspendida: boolean;
  clientes: { total: number; activos: number; suspendidos: number; retirados: number };
  olts: number;
  routers: number;
  lineas_wa: number;
  lineas_wa_ok: number;
  acs: string | null;
  /** null = el ACS no contestó. */
  tr069: number | null;
  mailjet: boolean;
  ultimo_ingreso: string | null;
  suscripcion: SuscripcionConsola | null;
}

export interface SuscripcionConsola {
  plan_id: number | null;
  plan: string | null;
  plan_clave: string | null;
  ciclo: 'mensual' | 'anual';
  precio_lista: number | null;
  precio_pactado: number | null;
  precio: number | null;
  estado: 'prueba' | 'al_dia' | 'en_mora' | 'suspendida' | 'cancelada';
  metodo_pago: string | null;
  inicio: string | null;
  prueba_hasta: string | null;
  proxima: string | null;
  dias_para_vencer: number | null;
  cupon_id: number | null;
  codigo_referido: string | null;
  referida_por: number | null;
  credito: number;
  uso: { clientes: number; incluidos: number | null; porcentaje: number | null; excedido: boolean };
  notas: string | null;
}

export interface PlanConsola {
  id: number | null;
  clave: string;
  nombre: string;
  para: string | null;
  precio_mensual: number | null;
  precio_anual: number | null;
  clientes: number | null;
  destacado: boolean;
  incluye: string[];
  activo: boolean;
  orden: number;
  empresas: number;
  /** true cuando todavía salen del config y no se pueden editar. */
  solo_lectura: boolean;
}

export interface CuponConsola {
  id: number;
  codigo: string;
  descripcion: string | null;
  tipo: 'porcentaje' | 'monto';
  valor: number;
  desde: string | null;
  hasta: string | null;
  usos_maximos: number | null;
  usos_por_empresa: number;
  usos: number;
  planes: string[];
  ciclos: string[];
  duracion: 'primer_periodo' | 'n_periodos' | 'permanente';
  periodos: number | null;
  activo: boolean;
  notas: string | null;
  empresas: number;
  vencido: boolean;
  agotado: boolean;
}

/** El desglose de un cobro: de dónde sale cada peso. */
export interface SimulacionCobro {
  ok: boolean;
  motivo?: string;
  plan?: { id: number; clave: string; nombre: string };
  ciclo?: string;
  periodo_inicio?: string;
  periodo_fin?: string;
  precio_lista?: number | null;
  precio_pactado?: number | null;
  precio?: number;
  cupon?: { id: number; codigo: string; tipo: string; valor: number } | null;
  descuento?: number;
  subtotal?: number;
  credito_saldo?: number;
  credito_aplicado?: number;
  credito_sobrante?: number;
  total?: number;
  renglones?: { concepto: string; monto: number }[];
  ya_cobrado?: boolean;
}

/**
 * La consola de Netvula.
 *
 * Todo cuelga de /api/consola, que sólo existe en admin.netvula.com y sólo
 * responde con un token de la consola. El token del panel de una empresa no
 * sirve acá, ni al revés.
 */
@Injectable({ providedIn: 'root' })
export class ConsolaService {
  private http = inject(HttpClient);
  private sesion = inject(ConsolaAuthService);
  private readonly base = environment.rootUrl + 'api/consola/';

  private cabeceras() { return this.sesion.cabeceras(); }

  /** Para subir el comprobante: sin Content-Type, lo pone el navegador. */
  private cabecerasArchivo() { return this.sesion.cabecerasArchivo(); }

  // ── Tablero y empresas ────────────────────────────────────────────────
  tablero(refrescar = false): Observable<any> {
    return this.http.get(this.base + 'tablero', { headers: this.cabeceras(), params: refrescar ? { refrescar: 1 } : {} });
  }

  empresas(q = '', conTr069 = false): Observable<any> {
    const params: Record<string, string> = {};
    if (q) params['q'] = q;
    if (conTr069) params['tr069'] = '1';
    return this.http.get(this.base + 'empresas', { headers: this.cabeceras(), params });
  }

  empresa(id: number): Observable<any> {
    return this.http.get(this.base + `empresas/${id}`, { headers: this.cabeceras() });
  }

  suspender(id: number, motivo: string): Observable<any> {
    return this.http.post(this.base + `empresas/${id}/suspender`, { motivo }, { headers: this.cabeceras() });
  }

  reactivar(id: number): Observable<any> {
    return this.http.post(this.base + `empresas/${id}/reactivar`, {}, { headers: this.cabeceras() });
  }

  // ── Suscripción ───────────────────────────────────────────────────────
  guardarSuscripcion(id: number, datos: any): Observable<any> {
    return this.http.put(this.base + `empresas/${id}/suscripcion`, datos, { headers: this.cabeceras() });
  }

  aplicarCupon(id: number, codigo: string): Observable<any> {
    return this.http.post(this.base + `empresas/${id}/cupon`, { codigo }, { headers: this.cabeceras() });
  }

  quitarCupon(id: number): Observable<any> {
    return this.http.delete(this.base + `empresas/${id}/cupon`, { headers: this.cabeceras() });
  }

  ajustarCredito(id: number, monto: number, nota: string): Observable<any> {
    return this.http.post(this.base + `empresas/${id}/credito`, { monto, nota }, { headers: this.cabeceras() });
  }

  // ── Cobros ────────────────────────────────────────────────────────────
  simular(id: number, periodo?: string): Observable<any> {
    return this.http.get(this.base + `empresas/${id}/cobros/simular`, {
      headers: this.cabeceras(), params: periodo ? { periodo } : {},
    });
  }

  generarCobro(id: number, periodo?: string): Observable<any> {
    return this.http.post(this.base + `empresas/${id}/cobros`, periodo ? { periodo } : {}, { headers: this.cabeceras() });
  }

  cobros(filtros: Record<string, string> = {}): Observable<any> {
    return this.http.get(this.base + 'cobros', { headers: this.cabeceras(), params: filtros });
  }

  registrarPago(cobroId: number, datos: FormData): Observable<any> {
    return this.http.post(this.base + `cobros/${cobroId}/pagos`, datos, { headers: this.cabecerasArchivo() });
  }

  anularCobro(cobroId: number, motivo: string): Observable<any> {
    return this.http.post(this.base + `cobros/${cobroId}/anular`, { motivo }, { headers: this.cabeceras() });
  }

  marcarMoras(): Observable<any> {
    return this.http.post(this.base + 'cobros/marcar-moras', {}, { headers: this.cabeceras() });
  }

  // ── Planes ────────────────────────────────────────────────────────────
  planes(): Observable<any> {
    return this.http.get(this.base + 'planes', { headers: this.cabeceras() });
  }

  crearPlan(datos: any): Observable<any> {
    return this.http.post(this.base + 'planes', datos, { headers: this.cabeceras() });
  }

  guardarPlan(id: number, datos: any): Observable<any> {
    return this.http.put(this.base + `planes/${id}`, datos, { headers: this.cabeceras() });
  }

  borrarPlan(id: number): Observable<any> {
    return this.http.delete(this.base + `planes/${id}`, { headers: this.cabeceras() });
  }

  preciosDelPlan(id: number): Observable<any> {
    return this.http.get(this.base + `planes/${id}/precios`, { headers: this.cabeceras() });
  }

  aplicarPrecio(id: number, empresas?: number[]): Observable<any> {
    return this.http.post(this.base + `planes/${id}/aplicar-precio`, empresas ? { empresas } : {}, { headers: this.cabeceras() });
  }

  // ── Cupones ───────────────────────────────────────────────────────────
  cupones(): Observable<any> {
    return this.http.get(this.base + 'cupones', { headers: this.cabeceras() });
  }

  crearCupon(datos: any): Observable<any> {
    return this.http.post(this.base + 'cupones', datos, { headers: this.cabeceras() });
  }

  guardarCupon(id: number, datos: any): Observable<any> {
    return this.http.put(this.base + `cupones/${id}`, datos, { headers: this.cabeceras() });
  }

  borrarCupon(id: number): Observable<any> {
    return this.http.delete(this.base + `cupones/${id}`, { headers: this.cabeceras() });
  }

  usosDelCupon(id: number): Observable<any> {
    return this.http.get(this.base + `cupones/${id}/usos`, { headers: this.cabeceras() });
  }

  // ── Referidos ─────────────────────────────────────────────────────────
  referidos(): Observable<any> {
    return this.http.get(this.base + 'referidos', { headers: this.cabeceras() });
  }

  guardarAjustesReferidos(datos: any): Observable<any> {
    return this.http.put(this.base + 'referidos/ajustes', datos, { headers: this.cabeceras() });
  }

  // ── Bitácora ──────────────────────────────────────────────────────────
  bitacora(filtros: Record<string, string> = {}): Observable<any> {
    return this.http.get(this.base + 'bitacora', { headers: this.cabeceras(), params: filtros });
  }
}

/** Pesos colombianos, sin decimales: es lo que se usa en todo el panel. */
export const PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export function pesos(v: number | null | undefined): string {
  return PESOS.format(v || 0);
}

/** Etiquetas de los estados de una suscripción. */
export const ESTADOS_SUSCRIPCION: Record<string, string> = {
  prueba: 'En prueba',
  al_dia: 'Al día',
  en_mora: 'En mora',
  suspendida: 'Suspendida',
  cancelada: 'Cancelada',
};
