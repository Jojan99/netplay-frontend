import { Injectable } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';

import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { UserInterface } from '../models/user-interface';
import { FactureInterface } from '../models/facture-interface';
import { TicketInterface } from '../models/ticket-interface';
import { error } from 'node:console';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  env = environment

  constructor(private http: HttpClient) { }

  getAuthToken(): string | null {
    return localStorage.getItem('token'); // Recupera el token desde localStorage
  }

  getHeaders(): HttpHeaders {
    return new HttpHeaders({
      "Content-Type": "application/json",
      'Authorization': `Bearer ${this.getAuthToken()}`
    });
  }

  createFacture(Facturedata: FactureInterface,id_user :any): Observable<any> {
    var parameter = JSON.stringify({
      priceTotal : Facturedata.price_total,
      date_facturation : Facturedata.date_facturation,
      id_user : id_user
    });
    const url = this.env.rootUrl + 'api/facturation/createDetFacturation'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }

  create(userData: UserInterface): Observable<any> {
    var parameter = JSON.stringify({
      names: userData.names,
      lastname: userData.lastname,
      address: userData.address,
      dni: userData.dni,
      phone: userData.phone,
      countryId: "1",
      vlan: userData.vlan,
      email: userData.email,
      planInternet: userData.plan_id,
      ip_assignment_id: userData.ip,
      group: userData.periode_facturation,

    });

    const url = this.env.rootUrl + 'api/user/createUserData'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }


   updateUser(userData: UserInterface, id_user : any,plan : any,data_cortes : any): Observable<any> {

    var parameter = JSON.stringify({
      names: userData.names,
      lastname: userData.lastname,
      address: userData.address,
      dni: userData.dni,
      phone: userData.phone,
      countryId: "1",
      email: userData.email,
      planInternet: plan,
      ip_assignment_id: "1",
      group: data_cortes,
      id_user: id_user,


    });
    console.log(">>>>>>>>>>>>"+ parameter);


    const url = this.env.rootUrl + 'api/user/updateUserData'
    return this.http.put<any>(url, parameter, { headers: this.getHeaders() });
  }
  disableUser(ip:any,id_user:any,internet_status:any){
    var parameter = JSON.stringify({
      username: ip,
      id_user: id_user,
      status:internet_status
    });

    const url = this.env.rootUrl + 'api/management/UpdateStatus'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }
  getAllUser(){
    const url = this.env.rootUrl + 'api/user/getUserAll'
    return this.http.get<any>(url, { headers: this.getHeaders() })
  }

  searchClients(query: string): Observable<any> {
    const url = this.env.rootUrl + 'api/user/search?q=' + encodeURIComponent(query);
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }


  getPingResults(count: any, dniping: any): Observable<any> {
    return new Observable(observer => {
      let attempts = 0;
      const maxRetries = 3; // Máximo de intentos de reconexión
  
      const connect = () => {
        const token = this.getAuthToken() ?? '';
        const url = `${this.env.rootUrl}api/dni/pruebaMikroPing?dni=${encodeURIComponent(dniping)}&count=${encodeURIComponent(count)}&token=${encodeURIComponent(token)}`;
        console.log('Conectando a:', url);

        const eventSource = new EventSource(url);
  
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          observer.next(data); // Enviar datos al observable
  
          if (data.message === 'done') {
            console.log('Conexión finalizada por el servidor.');
            eventSource.close();
            observer.complete(); // Cerrar observable cuando el backend lo indique
          }
        };
  
        eventSource.onerror = (error) => {
          console.error('Error en SSE:', error);
          eventSource.close();
  
          if (attempts < maxRetries) {
            attempts++;
            console.warn(`Intentando reconectar (${attempts}/${maxRetries})...`);
            setTimeout(connect, 5000); // Espera 5 segundos antes de reconectar
          } else {
            observer.error('No se pudo establecer la conexión después de varios intentos.');
          }
        };
  
        return () => {
          eventSource.close();
        };
      };
  
      connect(); // Iniciar la conexión
    });
  }
  
  
  getDatePayFacture(idCab:any,value:any){
    console.log(idCab)
    var parameter = JSON.stringify({
      cab_id: idCab,
      value: value,
    });

    const url = this.env.rootUrl + 'api/facturation/getDatePayFacture'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }

  deleteUserData(id: any) {
    const url = `${this.env.rootUrl}api/user/deleteUserDataById/${id}`;
  
    return this.http.delete<any>(url, { headers: this.getHeaders() });
  }
  
  

  createdTicket(Form: any): Observable<any> {

    console.log(Form)
    var parameter = JSON.stringify({
      user_id: Form.user_id,
      address: Form.address,
      date: Form.date,
      type_service:Form.type_service,
      priority:Form.priority,
      status:Form.status,
      tecnichal:Form.tecnichal,
      observation:Form.observation,
      cedula: Form.cedula,
      phone: Form.phone,
      search: Form.search,
      client_name: Form.client_name,
      technician_name: Form.technician_name,
    });

    const url = this.env.rootUrl + 'api/ticket/createTicket'
    return this.http.post<TicketInterface>(url, parameter, { headers: this.getHeaders() })
  }

  getTicketInProgressAll(status: any): Observable<any> {

    var parameter = JSON.stringify({

      status:status,
    
    });

    const url = this.env.rootUrl + 'api/ticket/getTicketInProgressAll'
    return this.http.post<TicketInterface>(url, parameter, { headers: this.getHeaders() })
  }

  getCountUser(){

    const url = this.env.rootUrl + 'api/user/getCountUser'
    return this.http.get<any>(url, { headers: this.getHeaders() })
  }

  getTotalClientRegisterMonth(year?: number){
    const params: any = year ? { year } : {};
    const url = this.env.rootUrl + 'api/user/getTotalClientRegisterMonth'
    return this.http.get<any>(url, { headers: this.getHeaders(), params })
  }

  getTotalPriceMonth(year?: number){
    const params: any = year ? { year } : {};
    const url = this.env.rootUrl + 'api/user/getTotalPriceMonth'
    return this.http.get<any>(url, { headers: this.getHeaders(), params })
  }

  getSearchUser(value:any){

    var parameter = JSON.stringify({
      value: value,
    });
    const url = this.env.rootUrl + 'api/shearch/getSearchUseCase'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });

  }

  getneighborhoodAll(){

    const url = this.env.rootUrl + 'api/management/getLanSegments'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }


  getTrazaFacture(){

    const url = this.env.rootUrl + 'api/user/getTrazaFacture'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

  getPriceEgresseAll(){

    const url = this.env.rootUrl + 'api/egresos/getPriceEgresseAll'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

  getDataCorteAll(){

    const url = this.env.rootUrl + 'api/internetInfo/getDataCorteAll'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

  getInternetPlanAll(){

    const url = this.env.rootUrl + 'api/internetInfo/getInternetPlanAll'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }


getIpzonebyZone(vlan: string, segment: string) {

  const parameter = {
    vlan: vlan,
    segment: segment
  };

  const url = this.env.rootUrl + 'api/management/getIpAvalibles';

  return this.http.post<any>(url, parameter, {
    headers: this.getHeaders()
  });
}


  getfile(){

    const url = this.env.rootUrl + 'api/dni/listFiles'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

  downloadFiles(){

    const url = this.env.rootUrl + 'api/dni/downloadFiles'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

  downloadPdfById(id: string): Observable<any> {
    const url = this.env.rootUrl + 'api/generatePdf/generatePdfbyId/' + id;
    return this.http.get(url, { responseType: 'blob', headers: this.getHeaders() }).pipe(
      catchError(error => {
        alert("No tienes permiso para realizar esta accion");
        return of(null);
      })
    );
  }

  downloadPdfTicketById(id: string): Observable<any> {
    const url = this.env.rootUrl + 'api/generatePdf/generatePdfTicketbyId/' + id;
    return this.http.get(url, { responseType: 'blob', headers: this.getHeaders() }).pipe(
      catchError(error => {
        alert("No tienes permiso para realizar esta accion");
        return of(null);
      })
    );
  }

  downloadPayById(id: string,value:any): Observable<any> {

    console.log(id)
    console.log(value)
    const url = `${this.env.rootUrl}api/generatePdf/generatePaidPdfbyId/${id}?extraParam=${value}`;
    return this.http.get(url, { responseType: 'blob', headers: this.getHeaders() }).pipe(
      catchError(error => {
        alert("No tienes permiso para realizar esta accion");
        return of(null);
      })
    );
  }

  getServiceTicket(){
    const url = this.env.rootUrl + 'api/ticket/getTypeServiceAll'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

  getPriorityTicket(){
    const url = this.env.rootUrl + 'api/ticket/getTypePriorityAll'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }


    getUserById(id_user:any){
    const url = this.env.rootUrl + 'api/user/getUserById/' + id_user;
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

  getTechnicaAll(){
    const url = this.env.rootUrl + 'api/ticket/getTechnicaAll'
    return this.http.get<any>(url, { headers: this.getHeaders() })

  }

 getIpMac(dni:any){
    var parameter = JSON.stringify({
        ip : dni,
    });
    const url = this.env.rootUrl + 'api/management/GetIpMacUseCase'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }

   autorizarServicio(data:any){

    var parameter = JSON.stringify({
        service_id : data['service_id'],
        mac: data['mac'],
        serial:data['serial'],
    });
    const url = this.env.rootUrl + 'api/management/autorizarServicio'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }

  migrarIp(data: { service_id: number; new_ip: string; vlan: string }): Observable<any> {
    const parameter = JSON.stringify(data);
    const url = this.env.rootUrl + 'api/management/migrarIp';
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }

  


  getTicketsByUser(userId: number): Observable<any> {
    const url = `${this.env.rootUrl}api/ticket/getByUser/${userId}`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  getAuditLog(userId: number): Observable<any> {
    const url = `${this.env.rootUrl}api/user/auditLog/${userId}`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  exportUsers(): Observable<any> {
    const url = this.env.rootUrl + 'api/user/exportUsers';
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  updateTicket(id:any , status:any){
    var parameter = JSON.stringify({
        id : id['id'],
        status: status,
        names_client: id['name'] + ' ' + id['last_name'],
        tech_names:id['tech_names'],
        hora_inicio:id['startedAt']
    });
    const url = this.env.rootUrl + 'api/ticket/updateTicket'
    return this.http.post<any>(url, parameter, { headers: this.getHeaders() });
  }

  getTicketStats(): Observable<any> {
    const url = this.env.rootUrl + 'api/ticket/stats';
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  getAllTickets(filters: { status_id?: number; technical_id?: number; search?: string } = {}): Observable<any> {
    const params: any = {};
    if (filters.status_id)   params['status_id']   = filters.status_id;
    if (filters.technical_id) params['technical_id'] = filters.technical_id;
    if (filters.search)      params['search']      = filters.search;
    const url = this.env.rootUrl + 'api/ticket/all';
    return this.http.get<any>(url, { headers: this.getHeaders(), params });
  }

  getTicketByIdFull(id: number): Observable<any> {
    const url = `${this.env.rootUrl}api/ticket/${id}`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  getTicketNotes(ticketId: number): Observable<any> {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/notes`;
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  addTicketNote(ticketId: number, formData: FormData): Observable<any> {
    const headers = this.getHeaders().delete('Content-Type');
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/notes`;
    return this.http.post<any>(url, formData, { headers });
  }

  closeTicket(ticketId: number, description: string): Observable<any> {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/close`;
    return this.http.post<any>(url, { description }, { headers: this.getHeaders() });
  }

  reopenTicket(ticketId: number, reason: string): Observable<any> {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/reopen`;
    return this.http.post<any>(url, { reason }, { headers: this.getHeaders() });
  }

  reassignTicket(ticketId: number, technicalId: number): Observable<any> {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/reassign`;
    return this.http.post<any>(url, { technical_id: technicalId }, { headers: this.getHeaders() });
  }

  deleteTicket(ticketId: number): Observable<any> {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}`;
    return this.http.delete<any>(url, { headers: this.getHeaders() });
  }

  getTicketsSince(since: string): Observable<any> {
    const url = `${this.env.rootUrl}api/ticket/updates`;
    return this.http.get<any>(url, { headers: this.getHeaders(), params: { since } });
  }

  // ── Invoice config ──────────────────────────────────────────────────────
  getInvoiceConfig(): Observable<any> {
    const url = this.env.rootUrl + 'api/company/invoice-config';
    return this.http.get<any>(url, { headers: this.getHeaders() });
  }

  updateInvoiceConfig(data: any): Observable<any> {
    const url = this.env.rootUrl + 'api/company/invoice-config';
    return this.http.put<any>(url, data, { headers: this.getHeaders() });
  }

  uploadInvoiceLogo(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('logo', file);
    const headers = this.getHeaders().delete('Content-Type');
    const url = this.env.rootUrl + 'api/company/invoice-config/logo';
    return this.http.post<any>(url, formData, { headers });
  }

  sendInvoiceByWhatsApp(invoiceId: string): Observable<any> {
    const url = `${this.env.rootUrl}api/generatePdf/sendInvoiceByWhatsApp/${invoiceId}`;
    return this.http.post<any>(url, {}, { headers: this.getHeaders() });
  }
}
