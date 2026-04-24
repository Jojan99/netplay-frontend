import {
  signal,
  ɵɵdefineInjectable
} from "./chunk-DR2P4SKC.js";

// src/app/services/toast.service.ts
var ToastService = class _ToastService {
  constructor() {
    this.toasts = signal([]);
    this.next = 0;
  }
  show(message, type = "success", duration = 3500) {
    const id = ++this.next;
    this.toasts.update((t) => [...t, { id, type, message }]);
    setTimeout(() => this.dismiss(id), duration);
  }
  success(message) {
    this.show(message, "success");
  }
  error(message) {
    this.show(message, "error", 5e3);
  }
  info(message) {
    this.show(message, "info");
  }
  warning(message) {
    this.show(message, "warning");
  }
  dismiss(id) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
  static {
    this.\u0275fac = function ToastService_Factory(t) {
      return new (t || _ToastService)();
    };
  }
  static {
    this.\u0275prov = /* @__PURE__ */ \u0275\u0275defineInjectable({ token: _ToastService, factory: _ToastService.\u0275fac, providedIn: "root" });
  }
};

export {
  ToastService
};
//# sourceMappingURL=chunk-WX2ZNKQM.js.map
