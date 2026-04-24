import {
  HttpClient,
  HttpHeaders,
  environment
} from "./chunk-2D25UOAP.js";
import {
  Observable,
  catchError,
  of,
  ɵɵdefineInjectable,
  ɵɵinject
} from "./chunk-DR2P4SKC.js";

// src/app/services/user.service.ts
var UserService = class _UserService {
  constructor(http) {
    this.http = http;
    this.env = environment;
  }
  getAuthToken() {
    return localStorage.getItem("token");
  }
  getHeaders() {
    return new HttpHeaders({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${this.getAuthToken()}`
    });
  }
  createFacture(Facturedata, id_user) {
    var parameter = JSON.stringify({
      priceTotal: Facturedata.price_total,
      date_facturation: Facturedata.date_facturation,
      id_user
    });
    const url = this.env.rootUrl + "api/facturation/createDetFacturation";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  create(userData) {
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
      group: userData.periode_facturation
    });
    const url = this.env.rootUrl + "api/user/createUserData";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  updateUser(userData, id_user, plan, data_cortes) {
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
      id_user
    });
    console.log(">>>>>>>>>>>>" + parameter);
    const url = this.env.rootUrl + "api/user/updateUserData";
    return this.http.put(url, parameter, { headers: this.getHeaders() });
  }
  disableUser(ip, id_user, internet_status) {
    var parameter = JSON.stringify({
      username: ip,
      id_user,
      status: internet_status
    });
    const url = this.env.rootUrl + "api/management/UpdateStatus";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  getAllUser() {
    const url = this.env.rootUrl + "api/user/getUserAll";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  searchClients(query) {
    const url = this.env.rootUrl + "api/user/search?q=" + encodeURIComponent(query);
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getPingResults(count, dniping) {
    return new Observable((observer) => {
      let attempts = 0;
      const maxRetries = 3;
      const connect = () => {
        const token = this.getAuthToken() ?? "";
        const url = `${this.env.rootUrl}api/dni/pruebaMikroPing?dni=${encodeURIComponent(dniping)}&count=${encodeURIComponent(count)}&token=${encodeURIComponent(token)}`;
        console.log("Conectando a:", url);
        const eventSource = new EventSource(url);
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          observer.next(data);
          if (data.message === "done") {
            console.log("Conexi\xF3n finalizada por el servidor.");
            eventSource.close();
            observer.complete();
          }
        };
        eventSource.onerror = (error) => {
          console.error("Error en SSE:", error);
          eventSource.close();
          if (attempts < maxRetries) {
            attempts++;
            console.warn(`Intentando reconectar (${attempts}/${maxRetries})...`);
            setTimeout(connect, 5e3);
          } else {
            observer.error("No se pudo establecer la conexi\xF3n despu\xE9s de varios intentos.");
          }
        };
        return () => {
          eventSource.close();
        };
      };
      connect();
    });
  }
  getDatePayFacture(idCab, value) {
    console.log(idCab);
    var parameter = JSON.stringify({
      cab_id: idCab,
      value
    });
    const url = this.env.rootUrl + "api/facturation/getDatePayFacture";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  deleteUserData(id) {
    const url = `${this.env.rootUrl}api/user/deleteUserDataById/${id}`;
    return this.http.delete(url, { headers: this.getHeaders() });
  }
  createdTicket(Form) {
    console.log(Form);
    var parameter = JSON.stringify({
      user_id: Form.user_id,
      address: Form.address,
      date: Form.date,
      type_service: Form.type_service,
      priority: Form.priority,
      status: Form.status,
      tecnichal: Form.tecnichal,
      observation: Form.observation,
      cedula: Form.cedula,
      phone: Form.phone,
      search: Form.search,
      client_name: Form.client_name,
      technician_name: Form.technician_name
    });
    const url = this.env.rootUrl + "api/ticket/createTicket";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  getTicketInProgressAll(status) {
    var parameter = JSON.stringify({
      status
    });
    const url = this.env.rootUrl + "api/ticket/getTicketInProgressAll";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  getCountUser() {
    const url = this.env.rootUrl + "api/user/getCountUser";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getTotalClientRegisterMonth(year) {
    const params = year ? { year } : {};
    const url = this.env.rootUrl + "api/user/getTotalClientRegisterMonth";
    return this.http.get(url, { headers: this.getHeaders(), params });
  }
  getTotalPriceMonth(year) {
    const params = year ? { year } : {};
    const url = this.env.rootUrl + "api/user/getTotalPriceMonth";
    return this.http.get(url, { headers: this.getHeaders(), params });
  }
  getSearchUser(value) {
    var parameter = JSON.stringify({
      value
    });
    const url = this.env.rootUrl + "api/shearch/getSearchUseCase";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  getneighborhoodAll() {
    const url = this.env.rootUrl + "api/management/getLanSegments";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getTrazaFacture() {
    const url = this.env.rootUrl + "api/user/getTrazaFacture";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getPriceEgresseAll() {
    const url = this.env.rootUrl + "api/egresos/getPriceEgresseAll";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getDataCorteAll() {
    const url = this.env.rootUrl + "api/internetInfo/getDataCorteAll";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getInternetPlanAll() {
    const url = this.env.rootUrl + "api/internetInfo/getInternetPlanAll";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getIpzonebyZone(vlan, segment) {
    const parameter = {
      vlan,
      segment
    };
    const url = this.env.rootUrl + "api/management/getIpAvalibles";
    return this.http.post(url, parameter, {
      headers: this.getHeaders()
    });
  }
  getfile() {
    const url = this.env.rootUrl + "api/dni/listFiles";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  downloadFiles() {
    const url = this.env.rootUrl + "api/dni/downloadFiles";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  downloadPdfById(id) {
    const url = this.env.rootUrl + "api/generatePdf/generatePdfbyId/" + id;
    return this.http.get(url, { responseType: "blob", headers: this.getHeaders() }).pipe(catchError((error) => {
      alert("No tienes permiso para realizar esta accion");
      return of(null);
    }));
  }
  downloadPdfTicketById(id) {
    const url = this.env.rootUrl + "api/generatePdf/generatePdfTicketbyId/" + id;
    return this.http.get(url, { responseType: "blob", headers: this.getHeaders() }).pipe(catchError((error) => {
      alert("No tienes permiso para realizar esta accion");
      return of(null);
    }));
  }
  downloadPayById(id, value) {
    console.log(id);
    console.log(value);
    const url = `${this.env.rootUrl}api/generatePdf/generatePaidPdfbyId/${id}?extraParam=${value}`;
    return this.http.get(url, { responseType: "blob", headers: this.getHeaders() }).pipe(catchError((error) => {
      alert("No tienes permiso para realizar esta accion");
      return of(null);
    }));
  }
  getServiceTicket() {
    const url = this.env.rootUrl + "api/ticket/getTypeServiceAll";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getPriorityTicket() {
    const url = this.env.rootUrl + "api/ticket/getTypePriorityAll";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getUserById(id_user) {
    const url = this.env.rootUrl + "api/user/getUserById/" + id_user;
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getTechnicaAll() {
    const url = this.env.rootUrl + "api/ticket/getTechnicaAll";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getIpMac(dni) {
    var parameter = JSON.stringify({
      ip: dni
    });
    const url = this.env.rootUrl + "api/management/GetIpMacUseCase";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  autorizarServicio(data) {
    var parameter = JSON.stringify({
      service_id: data["service_id"],
      mac: data["mac"],
      serial: data["serial"]
    });
    const url = this.env.rootUrl + "api/management/autorizarServicio";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  migrarIp(data) {
    const parameter = JSON.stringify(data);
    const url = this.env.rootUrl + "api/management/migrarIp";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  getTicketsByUser(userId) {
    const url = `${this.env.rootUrl}api/ticket/getByUser/${userId}`;
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getAuditLog(userId) {
    const url = `${this.env.rootUrl}api/user/auditLog/${userId}`;
    return this.http.get(url, { headers: this.getHeaders() });
  }
  exportUsers() {
    const url = this.env.rootUrl + "api/user/exportUsers";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  updateTicket(id, status) {
    var parameter = JSON.stringify({
      id: id["id"],
      status,
      names_client: id["name"] + " " + id["last_name"],
      tech_names: id["tech_names"],
      hora_inicio: id["startedAt"]
    });
    const url = this.env.rootUrl + "api/ticket/updateTicket";
    return this.http.post(url, parameter, { headers: this.getHeaders() });
  }
  getTicketStats() {
    const url = this.env.rootUrl + "api/ticket/stats";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getAllTickets(filters = {}) {
    const params = {};
    if (filters.status_id)
      params["status_id"] = filters.status_id;
    if (filters.technical_id)
      params["technical_id"] = filters.technical_id;
    if (filters.search)
      params["search"] = filters.search;
    const url = this.env.rootUrl + "api/ticket/all";
    return this.http.get(url, { headers: this.getHeaders(), params });
  }
  getTicketByIdFull(id) {
    const url = `${this.env.rootUrl}api/ticket/${id}`;
    return this.http.get(url, { headers: this.getHeaders() });
  }
  getTicketNotes(ticketId) {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/notes`;
    return this.http.get(url, { headers: this.getHeaders() });
  }
  addTicketNote(ticketId, formData) {
    const headers = this.getHeaders().delete("Content-Type");
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/notes`;
    return this.http.post(url, formData, { headers });
  }
  closeTicket(ticketId, description) {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/close`;
    return this.http.post(url, { description }, { headers: this.getHeaders() });
  }
  reopenTicket(ticketId, reason) {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/reopen`;
    return this.http.post(url, { reason }, { headers: this.getHeaders() });
  }
  reassignTicket(ticketId, technicalId) {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}/reassign`;
    return this.http.post(url, { technical_id: technicalId }, { headers: this.getHeaders() });
  }
  deleteTicket(ticketId) {
    const url = `${this.env.rootUrl}api/ticket/${ticketId}`;
    return this.http.delete(url, { headers: this.getHeaders() });
  }
  getTicketsSince(since) {
    const url = `${this.env.rootUrl}api/ticket/updates`;
    return this.http.get(url, { headers: this.getHeaders(), params: { since } });
  }
  // ── Invoice config ──────────────────────────────────────────────────────
  getInvoiceConfig() {
    const url = this.env.rootUrl + "api/company/invoice-config";
    return this.http.get(url, { headers: this.getHeaders() });
  }
  updateInvoiceConfig(data) {
    const url = this.env.rootUrl + "api/company/invoice-config";
    return this.http.put(url, data, { headers: this.getHeaders() });
  }
  uploadInvoiceLogo(file) {
    const formData = new FormData();
    formData.append("logo", file);
    const headers = this.getHeaders().delete("Content-Type");
    const url = this.env.rootUrl + "api/company/invoice-config/logo";
    return this.http.post(url, formData, { headers });
  }
  sendInvoiceByWhatsApp(invoiceId) {
    const url = `${this.env.rootUrl}api/generatePdf/sendInvoiceByWhatsApp/${invoiceId}`;
    return this.http.post(url, {}, { headers: this.getHeaders() });
  }
  static {
    this.\u0275fac = function UserService_Factory(t) {
      return new (t || _UserService)(\u0275\u0275inject(HttpClient));
    };
  }
  static {
    this.\u0275prov = /* @__PURE__ */ \u0275\u0275defineInjectable({ token: _UserService, factory: _UserService.\u0275fac, providedIn: "root" });
  }
};

export {
  UserService
};
//# sourceMappingURL=chunk-T45LF7GC.js.map
