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
  routers: Record<string, number | null>;
  estados: string[];
  existentes: 'omitir' | 'actualizar';
  grupo: number | null;
  grupo_por_dia: boolean;
  cobro_mes_completo: boolean;
  tipo_plan: string;
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

  reporte(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/reporte`, { ...this.h(false), responseType: 'blob' });
  }

  olvidarCredencial(origen: OrigenImportacion): Observable<any> {
    return this.http.delete(`${this.base}/credenciales/${origen}`, this.h());
  }
}
