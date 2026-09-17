import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type OrigenImportacion = 'wisphub' | 'mikrowisp';

export type EstadoImportacion =
  | 'leyendo' | 'mapeo' | 'analizado' | 'en_cola' | 'importando'
  | 'cancelando' | 'cancelada' | 'listo' | 'error';

/** Las opciones que confirma el administrador antes de importar. */
export interface OpcionesImportacion {
  planes: Record<string, number | 'crear' | null>;
  /** Valor mensual de cada plan (el del origen casi nunca viene). */
  precios: Record<string, number | null>;
  /** Planes que ya existen y cuyo valor se quiere pisar. */
  actualizar_precio: Record<string, boolean>;
  routers: Record<string, number | null>;
  /** Router para todos los que no tengan uno propio. */
  router_todos: number | null;
  estados: string[];
  existentes: 'omitir' | 'actualizar';
  grupo: number | null;
  /** Cómo se reparten los grupos: a todos igual o por plan, router o estado. */
  grupo_modo: 'todos' | 'plan' | 'router' | 'estado';
  grupos_por_plan: Record<string, number | null>;
  grupos_por_router: Record<string, number | null>;
  grupos_por_estado: Record<string, number | null>;
  grupo_por_dia: boolean;
  cobro_mes_completo: boolean;
  tipo_plan: string;
  /** Cómo se parte el nombre completo en nombres y apellidos. */
  regla_nombre: string;
  /** La factura por el saldo que el cliente traía de la otra plataforma. */
  saldo: {
    crear: boolean;
    concepto: string;
    fecha_modo: 'corte' | 'hoy' | 'fecha';
    fecha: string | null;
    evitar_envio: boolean;
  };
}

/**
 * Importar clientes desde WispHub o Mikrowisp: por API (URL + token) o con el
 * archivo exportado. La lectura de la API y la importación corren en el
 * servidor; la pantalla pregunta cómo van.
 */
@Injectable({ providedIn: 'root' })
export class ImportadorService {
  private get base(): string { return `${environment.rootUrl}api/importador`; }

  constructor(private http: HttpClient) {}

  private h(json = true) {
    const headers: Record<string, string> = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    if (json) headers['Content-Type'] = 'application/json';
    return { headers: new HttpHeaders(headers) };
  }

  /** Importaciones anteriores, credenciales guardadas, planes, routers y grupos. */
  inicio(): Observable<any> { return this.http.get(this.base, this.h()); }

  desdeApi(datos: { origen: OrigenImportacion; url: string; token: string; usar_guardado: boolean; guardar: boolean }): Observable<any> {
    return this.http.post(`${this.base}/api`, datos, this.h());
  }

  desdeArchivo(origen: OrigenImportacion, archivo: File): Observable<any> {
    const f = new FormData();
    f.append('origen', origen);
    f.append('archivo', archivo);
    return this.http.post(`${this.base}/archivo`, f, this.h(false));
  }

  mapeo(id: number, mapeo: Record<string, number | null>): Observable<any> {
    return this.http.post(`${this.base}/${id}/mapeo`, { mapeo }, this.h());
  }

  ver(id: number): Observable<any> { return this.http.get(`${this.base}/${id}`, this.h()); }

  filas(id: number, filtro: string, buscar: string, pagina: number): Observable<any> {
    const q = new URLSearchParams({ filtro, buscar, pagina: String(pagina) });
    return this.http.get(`${this.base}/${id}/filas?${q.toString()}`, this.h());
  }

  ejecutar(id: number, opciones: OpcionesImportacion): Observable<any> {
    return this.http.post(`${this.base}/${id}/ejecutar`, opciones, this.h());
  }

  cancelar(id: number): Observable<any> { return this.http.post(`${this.base}/${id}/cancelar`, {}, this.h()); }

  /** Guarda cómo se parte el nombre completo y devuelve ejemplos del archivo. */
  nombres(id: number, regla: string): Observable<any> {
    return this.http.post(`${this.base}/${id}/nombres`, { regla }, this.h());
  }

  /** Le pone grupo de facturación o router a los clientes elegidos. */
  asignar(id: number, datos: { ids?: number[]; todas?: boolean; filtro?: string; buscar?: string; grupo?: number | null; router?: number | null }): Observable<any> {
    return this.http.post(`${this.base}/${id}/asignar`, datos, this.h());
  }

  /** Crea (o ajusta) un grupo de facturación de la empresa. */
  crearGrupo(datos: { grupo?: number | null; billing_day: number; nombre?: string }): Observable<any> {
    return this.http.post(`${this.base}/grupos`, datos, this.h());
  }

  /**
   * Compara los clientes importados con el MikroTik (sólo lectura). Con
   * amarrar=true además les anota el router en la ficha.
   */
  cotejo(id: number, routerId: number | null, amarrar = false): Observable<any> {
    return this.http.post(`${this.base}/${id}/cotejo`, { router_id: routerId, amarrar }, this.h());
  }

  /**
   * Deja los comentarios del ARP con la cédula del cliente. Sin `aplicar` sólo
   * dice qué cambiaría; con `aplicar` escribe en el router (guardando antes un
   * respaldo). Es opcional: el sistema ya los reconoce por su nombre de origen.
   */
  comentariosDelRouter(routerId: number | null, aplicar = false): Observable<any> {
    return this.http.post(`${this.base}/comentarios`, { router_id: routerId, aplicar }, this.h());
  }

  reporte(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/reporte`, { ...this.h(false), responseType: 'blob' });
  }

  olvidarCredencial(origen: OrigenImportacion): Observable<any> {
    return this.http.delete(`${this.base}/credenciales/${origen}`, this.h());
  }
}
