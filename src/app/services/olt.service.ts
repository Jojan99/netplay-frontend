import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OltService {

  env = environment

  constructor(private http: HttpClient) { }

  getAuthToken(): string | null {
    return localStorage.getItem('token');
  }

  getHeaders(): HttpHeaders {
    return new HttpHeaders({
      "Content-Type": "application/json",
      'Authorization': `Bearer ${this.getAuthToken()}`
    });
  }

  // ── Legacy ────────────────────────────────────────────────────────────────

  getOntPortFind(): Observable<any> {
    return this.http.get<any>(this.env.rootUrl + 'api/management/getOntPort', { headers: this.getHeaders() });
  }

  getOntdetail(): Observable<any> {
    return this.http.get<any>(this.env.rootUrl + 'api/management/getCpuStatusSnmpnew', { headers: this.getHeaders() });
  }

  getOntStatusAll(): Observable<any> {
    return this.http.get<any>(this.env.rootUrl + 'api/management/getOntStatusAll', { headers: this.getHeaders() });
  }

  // ── OLT CRUD ─────────────────────────────────────────────────────────────

  /** Marcas de OLT que la plataforma sabe manejar. */
  getMarcas(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/marcas`, { headers: this.getHeaders() });
  }

  /** Ficha del equipo: marca, modelo, tarjetas y puertos, leídos por SNMP. */
  getEquipo(oltId: number, refrescar = false): Observable<any> {
    const params = new HttpParams().set('refrescar', refrescar ? '1' : '0');
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/equipo`, { headers: this.getHeaders(), params });
  }

  /**
   * Sube la foto del equipo. No se usa getHeaders() porque fija
   * Content-Type: application/json y el navegador necesita poner el
   * multipart/form-data con su propio boundary.
   */
  subirFotoOlt(oltId: number, archivo: File): Observable<any> {
    const cuerpo = new FormData();
    cuerpo.append('foto', archivo);

    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/foto`, cuerpo, {
      headers: new HttpHeaders({ Authorization: `Bearer ${this.getAuthToken()}` }),
    });
  }

  /**
   * Señal óptica de todas las ONT en un solo barrido: clasificación,
   * histograma, estado por puerto PON y los peores enlaces.
   */
  getSenal(oltId: number, refrescar = false): Observable<any> {
    const params = new HttpParams().set('refrescar', refrescar ? '1' : '0');
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/senal`, { headers: this.getHeaders(), params });
  }

  /** Cada puerto PON: ocupación, clientes en mora o suspendidos y alertas abiertas. */
  getPuertos(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/puertos`, { headers: this.getHeaders() });
  }

  /** Fija los perfiles que se usan al autorizar una ONT en esta OLT. */
  fijarPerfilesPorDefecto(oltId: number, lineProfileId: number | null, srvProfileId: number | null): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/profiles/default`,
      JSON.stringify({ ont_lineprofile_id: lineProfileId, ont_srvprofile_id: srvProfileId }),
      { headers: this.getHeaders() });
  }

  /** Qué admite la OLT al autorizar: MAC o serial, service-port, perfil de servicio. */
  getCapacidades(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/capacidades`, { headers: this.getHeaders() });
  }

  /** Qué puertos PON autorizan solos las ONU nuevas (sólo algunos equipos). */
  getAutoAutorizacion(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/auto-autorizacion`, { headers: this.getHeaders() });
  }

  cambiarAutoAutorizacion(oltId: number, puerto: number, activar: boolean): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/auto-autorizacion`,
      JSON.stringify({ puerto, activar }), { headers: this.getHeaders() });
  }

  /** Prueba la conexión con la OLT paso por paso. */
  diagnosticoOlt(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/diagnostico`, { headers: this.getHeaders() });
  }

  /** Olvida el mapa de puertos y la ficha guardadas: hace falta si cambian una placa. */
  olvidarPuertosOlt(oltId: number): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/olvidar-puertos`, '{}', { headers: this.getHeaders() });
  }

  borrarFotoOlt(oltId: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/management/olt/${oltId}/foto`, { headers: this.getHeaders() });
  }

  listOlts(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt`, { headers: this.getHeaders() });
  }

  createOlt(data: any): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  updateOlt(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.env.rootUrl}api/management/olt/${id}`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  deleteOlt(id: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/management/olt/${id}`, { headers: this.getHeaders() });
  }

  // ── VPN de gestión ────────────────────────────────────────────────────────

  /** Estado del servidor WireGuard y de cada túnel. */
  getVpnEstado(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/vpn/estado`, { headers: this.getHeaders() });
  }

  /** El script que instala el servidor; se corre una vez con sudo. */
  getVpnInstalador(): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/vpn/instalador`, { headers: this.getHeaders() });
  }

  crearTunelVpn(datos: any): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/vpn/tuneles`, JSON.stringify(datos), { headers: this.getHeaders() });
  }

  /** El script de configuración para el MikroTik de ese túnel. */
  getScriptTunel(id: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/vpn/tuneles/${id}/script`, { headers: this.getHeaders() });
  }

  actualizarTunelVpn(id: number, datos: any): Observable<any> {
    return this.http.put<any>(`${this.env.rootUrl}api/management/vpn/tuneles/${id}`, JSON.stringify(datos), { headers: this.getHeaders() });
  }

  eliminarTunelVpn(id: number): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/management/vpn/tuneles/${id}`, { headers: this.getHeaders() });
  }

  /** Deja una OLT alcanzándose por el túnel en lugar del jump host. */
  usarTunelEnOlt(tunelId: number, oltId: number, verificar = true): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/vpn/tuneles/${tunelId}/usar-en-olt`,
      JSON.stringify({ olt_id: oltId, verificar }), { headers: this.getHeaders() });
  }

  probarTunel(tunelId: number, ip: string, puerto: number): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/vpn/tuneles/${tunelId}/probar`,
      JSON.stringify({ ip, puerto }), { headers: this.getHeaders() });
  }

  // ── ONT Queries ───────────────────────────────────────────────────────────

  getUnauthONTs(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/unauth`, { headers: this.getHeaders() });
  }

  getAuthorizedONTs(oltId: number, force = false): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/onts?force=${force}`, { headers: this.getHeaders() });
  }

  getOntInfo(oltId: number, fsp: string, ontId: number): Observable<any> {
    const params = new HttpParams().set('fsp', fsp).set('ont_id', ontId);
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/info`, { headers: this.getHeaders(), params });
  }

  getServicePorts(oltId: number, fsp?: string, ontId?: number): Observable<any> {
    let params = new HttpParams();
    if (fsp)    params = params.set('fsp', fsp);
    if (ontId !== undefined) params = params.set('ont_id', ontId);
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/service-ports`, { headers: this.getHeaders(), params });
  }

  getProfiles(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/profiles`, { headers: this.getHeaders() });
  }

  // ── ONT Write Operations ───────────────────────────────────────────────────

  registerONT(oltId: number, data: { fsp: string; serial?: string; description?: string; ont_id?: number | null; line_profile_id?: number | null; srv_profile_id?: number | null; vlan?: number | null; user_data_id?: number }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/register`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  /** ¿Esta ONT ya está autorizada en algún puerto? */
  buscarOnt(oltId: number, serial: string): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/buscar-ont`, {
      headers: this.getHeaders(),
      params: new HttpParams().set('serial', serial),
    });
  }

  /** La quita de donde esté y la autoriza en el puerto pedido. */
  moverOnt(oltId: number, data: any): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/mover-ont`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  /** Reintenta sólo el service-port de una ONT que quedó a medias. */
  completarServicePort(oltId: number, data: any): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/completar-service-port`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  /** Clientes que todavía no tienen una ONT vinculada. */
  clientesSinOnt(oltId: number, q?: string): Observable<any> {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/clientes-sin-ont`, { headers: this.getHeaders(), params });
  }

  /** ONT que quedaron a medio provisionar. */
  ontsIncompletas(oltId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/${oltId}/onts-incompletas`, { headers: this.getHeaders() });
  }

  deleteONT(oltId: number, data: { fsp: string; ont_id: number }): Observable<any> {
    return this.http.delete<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont`, { headers: this.getHeaders(), body: JSON.stringify(data) });
  }

  deactivateONT(oltId: number, data: { fsp: string; ont_id: number }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/deactivate`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  activateONT(oltId: number, data: { fsp: string; ont_id: number }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/activate`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  transferONT(oltId: number, data: { from_fsp: string; ont_id: number; to_fsp: string }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/transfer`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  autoAssignONT(oltId: number, data: { fsp: string; ont_id: number; vlan?: number; description?: string }): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/auto-assign`, JSON.stringify(data), { headers: this.getHeaders() });
  }

  syncProfiles(oltId: number): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/profiles/sync`, '{}', { headers: this.getHeaders() });
  }

  assignClientToOnt(oltId: number, fsp: string, ontId: number, userDataId: number | null): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/ont/assign-client`,
      JSON.stringify({ fsp, ont_id: ontId, user_data_id: userDataId }), { headers: this.getHeaders() });
  }

  getOntByUserId(userId: number): Observable<any> {
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/ont/by-user/${userId}`, { headers: this.getHeaders() });
  }

  /** Qué ONT se pueden vincular con qué cliente. */
  propuestasDeVinculo(oltId?: number): Observable<any> {
    const q = oltId ? `?olt_id=${oltId}` : '';
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/vinculos/propuestas${q}`, { headers: this.getHeaders() });
  }

  /** Guarda los vínculos confirmados. */
  aplicarVinculos(pares: { ont: number; user_id: number }[]): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/vinculos/aplicar`, JSON.stringify({ pares }), { headers: this.getHeaders() });
  }

  /** Fabricante, modelo, versiones, WiFi y foto del equipo del cliente. */
  equipoDeCliente(userId: number, refrescar = false): Observable<any> {
    const q = refrescar ? '?refrescar=1' : '';
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/ont/by-user/${userId}/equipo${q}`, { headers: this.getHeaders() });
  }

  /** Foto de un modelo de ONT: sirve para todas las de ese modelo. */
  subirFotoDeModelo(fabricante: string, modelo: string, archivo: File): Observable<any> {
    const cuerpo = new FormData();
    cuerpo.append('fabricante', fabricante);
    cuerpo.append('modelo', modelo);
    cuerpo.append('foto', archivo);
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/ont/modelo/foto`, cuerpo, {
      headers: new HttpHeaders({ Authorization: `Bearer ${this.getAuthToken()}` }),
    });
  }

  borrarFotoDeModelo(fabricante: string, modelo: string): Observable<any> {
    const q = `?fabricante=${encodeURIComponent(fabricante)}&modelo=${encodeURIComponent(modelo)}`;
    return this.http.delete<any>(`${this.env.rootUrl}api/management/olt/ont/modelo/foto${q}`, { headers: this.getHeaders() });
  }

  /** La ONT del cliente leída de la OLT ahora: estado, señal, temperatura. */
  ontEnVivo(userId: number, refrescar = false): Observable<any> {
    const q = refrescar ? '?refrescar=1' : '';
    return this.http.get<any>(`${this.env.rootUrl}api/management/olt/ont/by-user/${userId}/en-vivo${q}`, { headers: this.getHeaders() });
  }

  cliCommand(oltId: number, command: string): Observable<any> {
    return this.http.post<any>(`${this.env.rootUrl}api/management/olt/${oltId}/cli`, JSON.stringify({ command }), { headers: this.getHeaders() });
  }
}
