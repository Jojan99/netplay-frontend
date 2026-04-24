import {
  HttpClient,
  HttpHeaders,
  environment
} from "./chunk-2D25UOAP.js";
import {
  ɵɵdefineInjectable,
  ɵɵinject
} from "./chunk-DR2P4SKC.js";

// src/app/services/company-whatsapp.service.ts
var CompanyWhatsappService = class _CompanyWhatsappService {
  constructor(http) {
    this.http = http;
    this.env = environment;
  }
  getHeaders() {
    return new HttpHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`
    });
  }
  get base() {
    return `${this.env.rootUrl}api/company/whatsapp`;
  }
  // ── Config ────────────────────────────────────────────────────────────────────
  getConfig() {
    return this.http.get(`${this.base}/config`, { headers: this.getHeaders() });
  }
  updateConfig(data) {
    return this.http.put(`${this.base}/config`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  // ── Instances ─────────────────────────────────────────────────────────────────
  getInstances() {
    return this.http.get(`${this.base}/instances`, { headers: this.getHeaders() });
  }
  createInstance(name) {
    return this.http.post(`${this.base}/instances`, JSON.stringify({ name }), { headers: this.getHeaders() });
  }
  /** QR como Blob (el backend proxia la imagen PNG del whatsapp-service) */
  getQrBlob(id) {
    return this.http.get(`${this.base}/instances/${id}/qr`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem("token")}` }),
      responseType: "blob"
    });
  }
  getInstanceStatus(id) {
    return this.http.get(`${this.base}/instances/${id}/status`, { headers: this.getHeaders() });
  }
  deleteInstance(id) {
    return this.http.delete(`${this.base}/instances/${id}`, { headers: this.getHeaders() });
  }
  // ── Suscripción ───────────────────────────────────────────────────────────────
  /** Activa o renueva la suscripción WA de la empresa. */
  subscribeWhatsApp(planId = "plan_pro", billingCycle = "yearly") {
    return this.http.post(`${this.base}/subscribe`, JSON.stringify({ plan_id: planId, billing_cycle: billingCycle }), { headers: this.getHeaders() });
  }
  // ── Plan requests ─────────────────────────────────────────────────────────────
  submitPlanRequest(notes = "") {
    return this.http.post(`${this.base}/plan-request`, JSON.stringify({ notes }), { headers: this.getHeaders() });
  }
  listPlanRequests() {
    return this.http.get(`${this.base}/plan-requests`, { headers: this.getHeaders() });
  }
  resolvePlanRequest(id, action, notes = "") {
    return this.http.put(`${this.base}/plan-requests/${id}`, JSON.stringify({ action, notes }), { headers: this.getHeaders() });
  }
  // ── Users ─────────────────────────────────────────────────────────────────────
  toggleUserWhatsapp(userId, enabled) {
    return this.http.put(`${this.env.rootUrl}api/company/whatsapp/users/${userId}/toggle`, JSON.stringify({ whatsapp_enabled: enabled }), { headers: this.getHeaders() });
  }
  // ── Groups ────────────────────────────────────────────────────────────────────
  getGroups() {
    return this.http.get(`${this.base}/groups`, { headers: this.getHeaders() });
  }
  // ── Notification Routes ───────────────────────────────────────────────────────
  listNotificationRoutes() {
    return this.http.get(`${this.env.rootUrl}api/company/notification-routes`, { headers: this.getHeaders() });
  }
  createNotificationRoute(data) {
    return this.http.post(`${this.env.rootUrl}api/company/notification-routes`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  updateNotificationRoute(id, data) {
    return this.http.put(`${this.env.rootUrl}api/company/notification-routes/${id}`, JSON.stringify(data), { headers: this.getHeaders() });
  }
  deleteNotificationRoute(id) {
    return this.http.delete(`${this.env.rootUrl}api/company/notification-routes/${id}`, { headers: this.getHeaders() });
  }
  static {
    this.\u0275fac = function CompanyWhatsappService_Factory(t) {
      return new (t || _CompanyWhatsappService)(\u0275\u0275inject(HttpClient));
    };
  }
  static {
    this.\u0275prov = /* @__PURE__ */ \u0275\u0275defineInjectable({ token: _CompanyWhatsappService, factory: _CompanyWhatsappService.\u0275fac, providedIn: "root" });
  }
};

export {
  CompanyWhatsappService
};
//# sourceMappingURL=chunk-KLJVL3UX.js.map
