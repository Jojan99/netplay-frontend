import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { CompanyService } from '../../services/company.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { FinanceService } from '../../services/finance.service';
import { InvoiceTemplateEditorComponent } from '../../components/invoice-template-editor/invoice-template-editor.component';
import { InvoiceTemplate, InvoiceTemplateService } from '../../services/invoice-template.service';
import { environment } from '../../../environments/environment';

const GW_API = environment.rootUrl + 'api/payment-gateway/';

interface Schedule {
  grupo:        number;
  billing_day:  number;
  billing_hour: number;
  active:       boolean;
}

@Component({
  selector: 'app-billing-config',
  standalone: true,
  imports: [CommonModule, FormsModule, InvoiceTemplateEditorComponent],
  templateUrl: './billing-config.component.html',
})
export class BillingConfigComponent implements OnInit {
  schedules:   Schedule[] = [];
  isLoading    = false;
  isSaving     = false;
  successMsg   = '';
  errorMsg     = '';

  // Users per group { 1: 34, 2: 12, ... }
  groupUserCounts: Record<number, number> = {};

  readonly maxGroups = 4;
  readonly days      = Array.from({ length: 28 }, (_, i) => i + 1);
  readonly hours     = Array.from({ length: 24 }, (_, i) => i);

  // ── Trigger modal ─────────────────────────────────────────
  triggerModal   = false;
  triggerGrupo   = 0;
  triggerDay     = 1;
  triggerMonth   = new Date().getMonth() + 1;
  triggerYear    = new Date().getFullYear();
  isTriggerBusy  = false;
  readonly months = [
    { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' },
    { v: 4, l: 'Abril' }, { v: 5, l: 'Mayo' },    { v: 6, l: 'Junio' },
    { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' },  { v: 9, l: 'Septiembre' },
    { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
  ];
  readonly years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  // ── Tabs ──────────────────────────────────────────────────
  activeTab: 'billing' | 'invoice' | 'payment-methods' | 'gateway' = 'billing';

  // ── Pasarela de pago online ────────────────────────────────
  readonly baseUrl = environment.rootUrl;
  gwLoading    = false;
  gwSaving     = false;
  gwMsg        = '';
  gwError      = '';
  gwConfig: any = {};
  gwAvailable: any[] = [];
  gwForm: any = { gateway: 'wompi', sandbox: true, active: false,
                  public_key: '', private_key: '', events_secret: '',
                  integrity_secret: '', client_id: '', office_id: '' };
  gwShowKeys: Record<string, boolean> = {};
  gwTxLoading   = false;
  gwTransactions: any[] = [];

  // ── EfiPay: sucursales del comercio ────────────────────────
  efipayOffices: any[] = [];
  efipayOfficesLoading = false;
  efipayOfficesError   = '';

  // ── Detalle de transacción ─────────────────────────────────
  gwDetailTx: any = null;
  gwDetailLoading = false;

  // ── Factura de prueba ──────────────────────────────────────
  testUsers:   any[] = [];
  testUsersLoading = false;
  testForm     = { user_id: 0, amount: 1000, description: '' };
  testResult:  any = null;
  testSaving   = false;
  testMsg      = '';
  testError    = '';

  // ── Invoice config ────────────────────────────────────────
  invoiceTab = false;
  invoiceForm: any = {
    invoice_business_name: '',
    invoice_nit: '',
    invoice_phone: '',
    invoice_address: '',
    invoice_city: '',
    invoice_country: 'COLOMBIA',
    invoice_iva_condition: 'No Aplica',
    invoice_economic_activity: '',
    invoice_payment_info: '',
    invoice_footer: '',
    invoice_logo_url: '',
    invoice_prefix: 'GL',
    invoice_whatsapp_enabled: true,
    email_enabled: true,
    email_daily_limit: 0,
  };
  invoiceLoading     = false;
  invoiceSaving      = false;
  invoiceSuccess     = '';
  invoiceError       = '';
  logoUploading      = false;
  logoUploadError    = '';

  // ── Invoice template ──────────────────────────────────────
  invoiceTemplate: InvoiceTemplate | null = null;
  invoiceTemplateId: number | null = null;
  showTemplateEditor = false;

  // ── Auto-suspend ──────────────────────────────────────────
  autoSuspendEnabled  = false;
  autoSuspendDays     = 5;
  autoSuspendDay      = 5;   // día del mes para ejecutar cortes (1-28)
  autoSuspendSaving   = false;
  autoSuspendRunning  = false;
  autoSuspendMsg      = '';
  autoSuspendStats    = { currently_suspended: 0, suspended_today: 0, reactivated_today: 0 };

  // ── Métodos de pago ───────────────────────────────────────
  paymentMethods: any[]  = [];
  pmLoading              = false;
  pmMsg                  = '';
  pmError                = '';
  newPmName              = '';
  pmCreating             = false;
  editPmId: number | null = null;
  editPmName             = '';
  pmUpdating             = false;

  // ── Transfer modal ────────────────────────────────────────
  transferModal   = false;
  transferFrom    = 0;
  transferTo: number | null = null;
  isTransferBusy  = false;
  pendingRemoveIndex = -1;

  constructor(
    private companyService: CompanyService,
    private http: HttpClient,
    private authService: AuthService,
    private userService: UserService,
    private financeService: FinanceService,
    private invoiceTemplateService: InvoiceTemplateService,
    private route: ActivatedRoute,
  ) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authService.getToken() ?? ''}`,
    });
  }

  ngOnInit(): void {
    // Si se entra desde la ruta /payment-gateway, abrir directamente el tab de pasarela
    const module = this.route.snapshot.data?.['module'];
    if (module === 'payment-gateway') {
      this.activeTab = 'gateway';
      this.loadGatewayConfig();
    }

    this.loadConfig();
    this.loadGroupInfo();
    this.loadInvoiceConfig();
    this.loadAutoSuspendConfig();
    this.loadPaymentMethods();
  }

  loadInvoiceConfig(): void {
    this.invoiceLoading = true;
    this.userService.getInvoiceConfig().subscribe({
      next: (res) => {
        this.invoiceLoading = false;
        if (res.data) {
          Object.assign(this.invoiceForm, res.data);
          this.invoiceTemplate = res.data.invoice_template ?? null;
          this.invoiceTemplateId = res.data.invoice_template_id ?? null;
          // Ensure booleans are set correctly
          this.invoiceForm.invoice_whatsapp_enabled = res.data.invoice_whatsapp_enabled !== undefined ? res.data.invoice_whatsapp_enabled : true;
          this.invoiceForm.email_enabled = res.data.email_enabled !== undefined ? res.data.email_enabled : true;
          this.invoiceForm.email_daily_limit = res.data.email_daily_limit !== undefined ? Math.max(0, parseInt(res.data.email_daily_limit, 10) || 0) : 0;
        }
      },
      error: () => { this.invoiceLoading = false; },
    });
  }

  onTemplateChanged(template: InvoiceTemplate | null): void {
    if (template) {
      this.invoiceTemplate = template;
      this.invoiceTemplateId = template.id ?? null;
    } else {
      // Recargar para obtener el estado actual
      this.loadInvoiceConfig();
    }
  }

  onLogoFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.logoUploading = true;
    this.logoUploadError = '';
    this.userService.uploadInvoiceLogo(file).subscribe({
      next: (res) => {
        this.logoUploading = false;
        this.invoiceForm.invoice_logo_url = res.data?.url ?? '';
        this.invoiceSuccess = 'Logo subido correctamente.';
        setTimeout(() => { this.invoiceSuccess = ''; }, 3000);
      },
      error: (err) => {
        this.logoUploading = false;
        this.logoUploadError = err?.error?.message || 'Error al subir el logo.';
      },
    });
  }

  saveInvoiceConfig(): void {
    this.invoiceSaving = true;
    this.invoiceSuccess = '';
    this.invoiceError = '';
    this.userService.updateInvoiceConfig(this.invoiceForm).subscribe({
      next: () => {
        this.invoiceSaving = false;
        this.invoiceSuccess = 'Configuración de factura guardada.';
        setTimeout(() => { this.invoiceSuccess = ''; }, 3000);
      },
      error: (err) => {
        this.invoiceSaving = false;
        this.invoiceError = err?.error?.message || 'Error al guardar.';
      },
    });
  }

  loadConfig(): void {
    this.isLoading = true;
    this.http.get<any>(environment.rootUrl + 'api/company/billing-config', { headers: this.getHeaders() }).subscribe({
      next:  (res) => { this.isLoading = false; this.schedules = res.data?.schedules ?? []; },
      error: ()    => { this.isLoading = false; },
    });
  }

  loadGroupInfo(): void {
    this.http.get<any>(environment.rootUrl + 'api/company/groups/info', { headers: this.getHeaders() }).subscribe({
      next: (res) => { this.groupUserCounts = res.data ?? {}; },
    });
  }

  addGroup(): void {
    if (this.schedules.length >= this.maxGroups) return;
    const nextGrupo = this.schedules.length + 1;
    this.schedules.push({ grupo: nextGrupo, billing_day: 1, billing_hour: 1, active: true });
  }

  removeGroup(index: number): void {
    const s     = this.schedules[index];
    const count = this.groupUserCounts[s.grupo] ?? 0;

    if (count > 0) {
      // Has users — must transfer first
      this.transferFrom        = s.grupo;
      this.transferTo          = null;
      this.pendingRemoveIndex  = index;
      this.transferModal       = true;
      return;
    }

    this.doRemove(index);
  }

  private doRemove(index: number): void {
    this.schedules.splice(index, 1);
    this.schedules.forEach((s, i) => { s.grupo = i + 1; });
  }

  confirmTransfer(): void {
    if (!this.transferTo) return;
    this.isTransferBusy = true;
    this.http.post<any>(
      environment.rootUrl + 'api/company/groups/transfer',
      JSON.stringify({ from_grupo: this.transferFrom, to_grupo: this.transferTo }),
      { headers: this.getHeaders() }
    ).subscribe({
      next: (res) => {
        this.isTransferBusy = false;
        this.transferModal  = false;
        // Update count
        const moved = res.data?.updated ?? 0;
        this.groupUserCounts[this.transferTo!] = (this.groupUserCounts[this.transferTo!] ?? 0) + moved;
        this.groupUserCounts[this.transferFrom] = 0;
        if (this.pendingRemoveIndex >= 0) {
          this.doRemove(this.pendingRemoveIndex);
          this.pendingRemoveIndex = -1;
        }
        this.successMsg = res.message;
        setTimeout(() => { this.successMsg = ''; }, 3000);
      },
      error: (err) => {
        this.isTransferBusy = false;
        this.errorMsg = err?.error?.message || 'Error al trasladar usuarios.';
      },
    });
  }

  save(): void {
    this.isSaving   = true;
    this.errorMsg   = '';
    this.successMsg = '';

    this.companyService.updateBillingConfig(this.schedules).subscribe({
      next: (res) => {
        this.isSaving = false;
        if (!res.error) {
          this.successMsg = 'Configuración guardada correctamente.';
          setTimeout(() => { this.successMsg = ''; }, 3000);
        } else {
          this.errorMsg = res.message || 'Error al guardar.';
        }
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMsg = err?.error?.message || 'Error al guardar.';
      },
    });
  }

  openTrigger(s: Schedule): void {
    this.triggerGrupo  = s.grupo;
    this.triggerDay    = s.billing_day;
    this.triggerMonth  = new Date().getMonth() + 1;
    this.triggerYear   = new Date().getFullYear();
    this.triggerModal  = true;
  }

  confirmTrigger(): void {
    this.isTriggerBusy = true;
    this.http.post<any>(
      environment.rootUrl + 'api/company/billing-run',
      JSON.stringify({ grupo: this.triggerGrupo, billing_month: this.triggerMonth, billing_year: this.triggerYear }),
      { headers: this.getHeaders() }
    ).subscribe({
      next: (res) => {
        this.isTriggerBusy = false;
        this.triggerModal  = false;
        if (!res.error) {
          this.successMsg = `Proceso del grupo ${this.triggerGrupo} ejecutado (${this.triggerDay}/${this.triggerMonth}/${this.triggerYear}).`;
          setTimeout(() => { this.successMsg = ''; }, 5000);
        } else {
          this.errorMsg = res.message || 'Error al ejecutar el proceso.';
        }
      },
      error: (err) => {
        this.isTriggerBusy = false;
        this.errorMsg = err?.error?.message || 'Error al ejecutar el proceso.';
      },
    });
  }

  loadAutoSuspendConfig(): void {
    this.companyService.getAutoSuspendConfig().subscribe({
      next: (res) => {
        this.autoSuspendEnabled = res.data?.enabled ?? false;
        this.autoSuspendDays    = res.data?.days_overdue ?? 5;
        this.autoSuspendDay     = res.data?.suspension_day ?? 5;
        this.autoSuspendStats   = res.data?.stats ?? this.autoSuspendStats;
      },
    });
  }

  saveAutoSuspend(): void {
    this.autoSuspendSaving = true;
    this.autoSuspendMsg    = '';
    this.companyService.saveAutoSuspendConfig({
      enabled:        this.autoSuspendEnabled,
      days_overdue:   this.autoSuspendDays,
      suspension_day: this.autoSuspendDay,
    }).subscribe({
      next: () => {
        this.autoSuspendSaving = false;
        this.autoSuspendMsg    = 'Configuración guardada.';
        setTimeout(() => { this.autoSuspendMsg = ''; }, 3000);
      },
      error: () => { this.autoSuspendSaving = false; },
    });
  }

  runAutoSuspendNow(): void {
    this.autoSuspendRunning = true;
    this.autoSuspendMsg     = '';
    this.companyService.runAutoSuspend().subscribe({
      next: (res) => {
        this.autoSuspendRunning = false;
        const s = res.data?.suspended ?? 0;
        const r = res.data?.reactivated ?? 0;
        this.autoSuspendMsg = `Proceso ejecutado: ${s} suspendido(s), ${r} reactivado(s).`;
        this.loadAutoSuspendConfig();
        setTimeout(() => { this.autoSuspendMsg = ''; }, 5000);
      },
      error: () => { this.autoSuspendRunning = false; },
    });
  }

  // ── Métodos de pago ───────────────────────────────────────

  loadPaymentMethods(): void {
    this.pmLoading = true;
    this.financeService.getPaymentMethods().subscribe({
      next: (res) => { this.pmLoading = false; this.paymentMethods = res.data ?? []; },
      error: () => { this.pmLoading = false; },
    });
  }

  createPaymentMethod(): void {
    if (!this.newPmName.trim()) return;
    this.pmCreating = true;
    this.pmMsg = ''; this.pmError = '';
    this.financeService.createPaymentMethod(this.newPmName.trim()).subscribe({
      next: (res) => {
        this.pmCreating = false;
        this.newPmName = '';
        this.paymentMethods.push(res.data);
        this.pmMsg = 'Método creado.';
        setTimeout(() => { this.pmMsg = ''; }, 3000);
      },
      error: (err) => { this.pmCreating = false; this.pmError = err?.error?.message || 'Error al crear.'; },
    });
  }

  togglePaymentMethod(pm: any): void {
    this.financeService.togglePaymentMethod(pm.id).subscribe({
      next: (res) => { pm.active = res.data?.active ?? !pm.active; },
    });
  }

  startEditPm(pm: any): void {
    this.editPmId   = pm.id;
    this.editPmName = pm.name;
  }

  saveEditPm(): void {
    if (!this.editPmId || !this.editPmName.trim()) return;
    this.pmUpdating = true;
    this.financeService.updatePaymentMethod(this.editPmId, this.editPmName.trim()).subscribe({
      next: (res) => {
        this.pmUpdating = false;
        const pm = this.paymentMethods.find(p => p.id === this.editPmId);
        if (pm) pm.name = res.data?.name ?? this.editPmName;
        this.editPmId = null;
        this.editPmName = '';
      },
      error: () => { this.pmUpdating = false; },
    });
  }

  cancelEditPm(): void {
    this.editPmId = null;
    this.editPmName = '';
  }

  deletePaymentMethod(pm: any): void {
    if (!confirm(`¿Eliminar "${pm.name}"?`)) return;
    this.financeService.deletePaymentMethod(pm.id).subscribe({
      next: () => { this.paymentMethods = this.paymentMethods.filter(p => p.id !== pm.id); },
    });
  }

  hourLabel(h: number): string {
    return h.toString().padStart(2, '0') + ':00';
  }

  otherGroups(excludeGrupo: number): Schedule[] {
    return this.schedules.filter(s => s.grupo !== excludeGrupo);
  }

  // ── Pasarela online ────────────────────────────────────────

  loadGatewayConfig(): void {
    this.gwLoading = true;
    this.gwShowKeys = {};
    this.http.get<any>(GW_API + 'config', { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.gwLoading   = false;
        this.gwConfig    = res.data ?? {};
        this.gwAvailable = res.data?.available ?? [];
        this.gwForm.gateway  = res.data?.gateway ?? 'wompi';
        this.gwForm.sandbox  = res.data?.sandbox ?? true;
        this.gwForm.active   = res.data?.active  ?? false;
        this.gwForm.office_id = res.data?.office_id ?? '';
        this.loadGatewayTransactions();
      },
      error: () => { this.gwLoading = false; },
    });
  }

  toggleKey(field: string): void {
    this.gwShowKeys[field] = !this.gwShowKeys[field];
  }

  maskKey(value: string | null | undefined): string {
    if (!value) return '';
    if (value.length <= 8) return '•'.repeat(value.length);
    return value.slice(0, 6) + '••••••••' + value.slice(-4);
  }

  saveGatewayConfig(): void {
    this.gwSaving = true;
    this.gwMsg    = '';
    this.gwError  = '';
    const body: any = {
      gateway: this.gwForm.gateway,
      sandbox: this.gwForm.sandbox,
      active:  this.gwForm.active,
    };
    // Solo enviar claves que el usuario completó
    for (const f of ['public_key', 'private_key', 'events_secret', 'integrity_secret', 'client_id', 'office_id']) {
      if (String(this.gwForm[f] ?? '').trim()) body[f] = String(this.gwForm[f]).trim();
    }
    this.http.put<any>(GW_API + 'config', JSON.stringify(body), { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.gwSaving = false;
        this.gwMsg    = res.message ?? 'Configuración guardada.';
        // Limpiar campos de contraseña (office_id no es secreto y se conserva a la vista)
        for (const f of ['public_key', 'private_key', 'events_secret', 'integrity_secret', 'client_id']) {
          this.gwForm[f] = '';
        }
        this.loadGatewayConfig();
        setTimeout(() => { this.gwMsg = ''; }, 4000);
      },
      error: (err) => {
        this.gwSaving = false;
        this.gwError  = err?.error?.message ?? 'Error al guardar.';
      },
    });
  }

  loadGatewayTransactions(): void {
    this.gwTxLoading = true;
    this.http.get<any>(GW_API + 'transactions', { headers: this.getHeaders() }).subscribe({
      next: (res) => { this.gwTxLoading = false; this.gwTransactions = res.data ?? []; },
      error: () => { this.gwTxLoading = false; },
    });
  }

  txStatusLabel(s: string): string {
    const m: Record<string, string> = {
      pending:   'Pendiente',
      approved:  'Aprobado',
      declined:  'Rechazado',
      cancelled: 'Cancelado',
      failed:    'Fallido',
    };
    return m[s] ?? s;
  }

  txStatusClass(s: string): string {
    const map: Record<string, string> = {
      pending:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      approved:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      declined:  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      cancelled: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      failed:    'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    };
    return map[s] ?? 'bg-gray-100 text-gray-600';
  }

  gatewayBadgeClass(g: string): string {
    return { wompi: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
             epayco: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
             zonapago: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
             efipay: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
           }[g] ?? 'bg-gray-100 text-gray-700';
  }

  gatewayLabel(g: string): string {
    return { wompi: 'Wompi', epayco: 'ePayco', zonapago: 'ZonaPago', efipay: 'EfiPay' }[g] ?? g;
  }

  /**
   * Trae las sucursales del comercio en EfiPay para que el admin elija un
   * `office` válido: es el error de configuración más frecuente.
   */
  loadEfipayOffices(): void {
    this.efipayOfficesLoading = true;
    this.efipayOfficesError   = '';
    this.efipayOffices        = [];

    this.http.get<any>(GW_API + 'efipay/offices', { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.efipayOfficesLoading = false;
        this.efipayOffices = res.data ?? [];
        if (this.efipayOffices.length === 0) {
          this.efipayOfficesError = 'EfiPay no devolvió sucursales para este comercio.';
        }
      },
      error: (err) => {
        this.efipayOfficesLoading = false;
        this.efipayOfficesError = err?.error?.message ?? 'No se pudieron cargar las sucursales.';
      },
    });
  }

  /**
   * URL de webhook de la pasarela seleccionada. Se calcula en el cliente para
   * que el admin pueda copiarla antes de guardar la configuración.
   */
  gwWebhookUrl(): string {
    const base = this.gwConfig?.webhook_base;
    const slug = this.gwConfig?.company_slug;
    if (base && slug && this.gwForm.gateway) {
      return `${base}/${this.gwForm.gateway}/${slug}`;
    }
    return this.gwConfig?.webhook_url ?? '';
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }

  // ── Detalle de transacción ─────────────────────────────────

  openTxDetail(tx: any): void {
    this.gwDetailTx      = tx;
    this.gwDetailLoading = true;
    this.http.get<any>(GW_API + 'transactions/' + tx.id, { headers: this.getHeaders() }).subscribe({
      next:  (res) => { this.gwDetailLoading = false; this.gwDetailTx = res.data; },
      error: ()    => { this.gwDetailLoading = false; },
    });
  }

  closeTxDetail(): void { this.gwDetailTx = null; }

  copyText(text: string): void {
    navigator.clipboard?.writeText(text ?? '').catch(() => {});
  }

  // ── Factura de prueba ──────────────────────────────────────

  loadTestUsers(): void {
    this.testUsersLoading = true;
    this.http.get<any>(GW_API + 'test-users', { headers: this.getHeaders() }).subscribe({
      next:  (res) => { this.testUsersLoading = false; this.testUsers = res.data ?? []; },
      error: ()    => { this.testUsersLoading = false; },
    });
  }

  createTestInvoice(): void {
    if (!this.testForm.user_id || !this.testForm.amount) return;
    this.testSaving = true;
    this.testMsg    = '';
    this.testError  = '';
    this.testResult = null;

    this.http.post<any>(GW_API + 'test-invoice', JSON.stringify(this.testForm), { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.testSaving = false;
        this.testResult = res.data;
      },
      error: (err) => {
        this.testSaving = false;
        this.testError  = err?.error?.message ?? 'Error al crear factura de prueba.';
      },
    });
  }

  openTestPayUrl(): void {
    if (this.testResult?.payment_url) window.open(this.testResult.payment_url, '_blank');
  }
}
