import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CampoProveedor { etiqueta: string; secreto: boolean; ayuda: string; }
export interface ProveedorFE { id: string; nombre: string; campos: Record<string, CampoProveedor>; }
export interface OpcionFE { id: string | number; nombre: string; electronica?: boolean; porcentaje?: number; }

export interface EstadoFE {
  proveedores: ProveedorFE[];
  config: {
    proveedor: string; activa: boolean; automatica: boolean; emitir_desde: string | null;
    ajustes: Record<string, any>; credenciales: Record<string, boolean>; verificada_en: string | null;
  } | null;
  faltantes: string[];
  clientes?: { marcados: number; total: number };
  resumen: { emitidas: number; rechazadas: number; errores: number; pendientes: number; por_emitir: number };
}

export interface DocumentoFE {
  id: number; tipo: 'factura' | 'nota_credito'; estado: 'pendiente' | 'emitida' | 'rechazada' | 'error';
  numero: string | null; cufe: string | null; estado_dian: string | null; pdf_url: string | null;
  total: number; impuesto: number; error: string | null; intentos: number; externo_id: string | null;
  emitida_en: string | null; created_at: string; origen_id: number | null; det_facturation_id: number | null;
  number_facture: string | null; paid: number | null; anulada_en: string | null; anulada_con: string | null; dni: string | null; cliente: string | null;
}

export interface PorEmitirFE { id: number; number_facture: string; paid_at: string | null; dni: string | null; total: number; cliente: string | null; }

/** Facturación electrónica ante la DIAN, por el proveedor que la empresa conecte (Siigo o Alegra). */
@Injectable({ providedIn: 'root' })
export class FacturaElectronicaService {
  private http = inject(HttpClient);
  private base = environment.rootUrl + 'api/factura-electronica';

  estado(): Observable<any> { return this.http.get(this.base); }
  guardar(datos: any): Observable<any> { return this.http.put(this.base, datos); }
  probar(proveedor: string, credenciales: Record<string, string>): Observable<any> { return this.http.post(this.base + '/probar', { proveedor, credenciales }); }
  catalogos(): Observable<any> { return this.http.get(this.base + '/catalogos'); }
  documentos(filtros: { estado?: string; q?: string; pagina?: number }): Observable<any> {
    const params: Record<string, string> = {};
    if (filtros.estado) params['estado'] = filtros.estado;
    if (filtros.q) params['q'] = filtros.q;
    params['pagina'] = String(filtros.pagina ?? 1);
    return this.http.get(this.base + '/documentos', { params });
  }
  porEmitir(): Observable<any> { return this.http.get(this.base + '/por-emitir'); }
  emitir(detIds: number[]): Observable<any> { return this.http.post(this.base + '/emitir', { det_ids: detIds }); }
  reintentar(id: number): Observable<any> { return this.http.post(`${this.base}/documentos/${id}/reintentar`, {}); }
  notaCredito(id: number): Observable<any> { return this.http.post(`${this.base}/documentos/${id}/nota-credito`, {}); }
  /** Lo que se propone al dar de alta un cliente: la ciudad de la empresa y los tipos de documento. */
  clientePorDefecto(): Observable<any> { return this.http.get(`${this.base}/cliente-por-defecto`); }
  clienteFiscal(userId: number | string): Observable<any> { return this.http.get(`${this.base}/cliente/${userId}`); }
  guardarClienteFiscal(userId: number | string, datos: any): Observable<any> { return this.http.put(`${this.base}/cliente/${userId}`, datos); }
  pdf(id: number): Observable<Blob> { return this.http.get(`${this.base}/documentos/${id}/pdf`, { responseType: 'blob' }); }
}
