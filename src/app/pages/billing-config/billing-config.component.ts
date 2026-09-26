import { DialogService } from '../../services/dialog.service';
import { Component, OnInit, inject } from '@angular/core';
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
import { CorreoService, ConfiguracionCorreo } from '../../services/correo.service';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';
import { OpcionSimple, PRESENTACION_PERSONAS, PRESENTACION_SIMPLE, conValor } from '../../common/np-select/presentaciones';

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
  imports: [CommonModule, FormsModule, InvoiceTemplateEditorComponent, NpSelectComponent],
  templateUrl: './billing-config.component.html',
  styleUrl: './billing-config.component.scss',
  host: { class: 'np-console' },
})
export class BillingConfigComponent implements OnInit {
  private dialog = inject(DialogService);
  schedules:   Schedule[] = [];
  isLoading    = false;
  isSaving     = false;
  successMsg   = '';
  errorMsg     = '';

  // Users per group { 1: 34, 2: 12, ... }
  groupUserCounts: Record<number, number> = {};

  readonly maxGroups = 4;
  readonly days      = Array.from({ length: 30 }, (_, i) => i + 1);
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

  // ── Selectores (np-select) ────────────────────────────────
  readonly presSimple = PRESENTACION_SIMPLE;

  /** Sólo se imprime como "Régimen" en la factura: no cambia ningún cálculo. */
  readonly opcionesIva: OpcionSimple[] = [
    { valor: 'No Aplica', etiqueta: 'No Aplica', detalle: 'Sin régimen que declarar' },
    { valor: 'Responsable de IVA', etiqueta: 'Responsable de IVA', detalle: 'Inscrito en el RUT como responsable' },
    { valor: 'No responsable de IVA', etiqueta: 'No responsable de IVA', detalle: 'No cobra IVA (antes régimen simplificado)' },
    { valor: 'Gran Contribuyente', etiqueta: 'Gran Contribuyente', detalle: 'Calificado así por la DIAN' },
  ];

  readonly presDias: PresentacionSelect<number> = {
    valor: d => d,
    etiqueta: d => `Día ${d}`,
    insignia: d => (d === new Date().getDate() ? { texto: 'Hoy', tono: 'info' } : null),
  };
  /** Cortes: el select anterior usaba [value] y guardaba el día en texto. */
  readonly presDiasTexto = conValor(this.presDias, d => String(d));

  readonly presHoras: PresentacionSelect<number> = {
    valor: h => h,
    etiqueta: h => this.hourLabel(h),
    detalle: h => `${h % 12 || 12}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`,
  };

  readonly presMeses: PresentacionSelect<{ v: number; l: string }> = {
    valor: m => m.v,
    etiqueta: m => m.l,
    prefijo: m => String(m.v).padStart(2, '0'),
    insignia: m => (m.v === new Date().getMonth() + 1 ? { texto: 'Mes actual', tono: 'info' } : null),
  };

  readonly presAnios: PresentacionSelect<number> = {
    valor: y => y,
    etiqueta: y => String(y),
    insignia: y => (y === new Date().getFullYear() ? { texto: 'Año actual', tono: 'info' } : null),
  };

  /** Sucursales de EfiPay: el id va en texto, como hacía [value]; se marca la que ya está guardada. */
  readonly presSucursales: PresentacionSelect = {
    valor: o => String(o?.id),
    etiqueta: o => o?.name ?? '',
    prefijo: o => String(o?.id ?? ''),
    insignia: o => (this.gwConfig?.office_id != null && String(o?.id) === String(this.gwConfig.office_id)
      ? { texto: 'Guardada', tono: 'ok' }
      : null),
    buscarEn: o => `${o?.id ?? ''} ${o?.name ?? ''}`,
  };

  /** Clientes de prueba (id, nombre, correo): el id en texto, como hacía [value]. */
  readonly presClientesPrueba = conValor(PRESENTACION_PERSONAS, u => String(u.id));

  readonly presGruposDestino: PresentacionSelect<Schedule> = {
    valor: s => s.grupo,
    etiqueta: s => `Grupo ${s.grupo}`,
    detalle: s => `Factura el día ${s.billing_day} a las ${this.hourLabel(s.billing_hour)}${s.active ? '' : ' · Inactivo'}`,
    atenuada: s => !s.active,
    insignia: (s, todas) => {
      const n = this.groupUserCounts[s.grupo] ?? 0;
      const mayor = Math.max(1, ...todas.map(x => this.groupUserCounts[x.grupo] ?? 0));
      return { texto: `${n} ${n === 1 ? 'usuario' : 'usuarios'}`, tono: n ? 'ok' : 'neutral', proporcion: n / mayor };
    },
  };

  // ── Tabs ──────────────────────────────────────────────────
  activeTab: 'billing' | 'invoice' | 'payment-methods' | 'gateway' | 'cortes' | 'correo' = 'billing';
  gwView: 'config' | 'test' | 'transactions' = 'config';

  // ── Correo (Mailjet) ───────────────────────────────────────
  correoCargando = false;
  correoGuardando = false;
  correoProbando  = false;
  correoMsg   = '';
  correoError = '';
  correoConfig: ConfiguracionCorreo | null = null;
  correoForm = { activo: false, api_key: '', api_secret: '', from_email: '', from_name: '' };
  correoVerSecreto = false;
  correoEmailPrueba = '';

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
                  integrity_secret: '', client_id: '', office_id: '',
                  // OnePay: token fijo del aviso y plantilla de WhatsApp.
                  webhook_token: '', template_id: '' };

  // OnePay: las plantillas aprobadas por Meta con las que puede cobrar, y el
  // resultado de la revisión de configuración.
  onepayPlantillas: any[] = [];
  onepayCargandoPlantillas = false;
  onepayErrorPlantillas = '';
  onepayRevision: any = null;
  onepayRevisando = false;
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
  /** Destinos del traslado: se arman al abrir el modal para no pasarle al selector un arreglo nuevo en cada ciclo. */
  transferGroups: Schedule[] = [];
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
    private correoService: CorreoService,
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
    }
    // La dirección /dashboard/correo abre directo la sección de correo.
    if (this.route.snapshot.data?.['tab'] === 'correo') {
      this.activeTab = 'correo';
      this.cargarCorreo();
    }
    // Siempre: el resumen de arriba dice si la pasarela está activa.
    this.loadGatewayConfig();

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
      this.transferGroups      = this.otherGroups(s.grupo);
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

  async deletePaymentMethod(pm: any) {
    if (!await this.dialog.confirm(`¿Eliminar "${pm.name}"?`)) return;
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
        // El campo que se ve es el mismo que se edita: se precarga con lo
        // guardado. Antes había un recuadro de sólo lectura al lado de un
        // input vacío y no quedaba claro cuál de los dos mandaba.
        for (const f of ['public_key', 'private_key', 'events_secret', 'integrity_secret', 'client_id', 'office_id', 'webhook_token']) {
          this.gwForm[f] = res.data?.[f] ?? '';
        }

        this.gwForm.template_id = res.data?.template_id ?? '';
        this.loadGatewayTransactions();

        if (this.gwForm.gateway === 'onepay') { this.cargarPlantillasOnepay(); }
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
    for (const f of ['public_key', 'private_key', 'events_secret', 'integrity_secret', 'client_id', 'office_id', 'webhook_token']) {
      if (String(this.gwForm[f] ?? '').trim()) body[f] = String(this.gwForm[f]).trim();
    }

    // La plantilla se manda siempre, incluso vacía: dejarla en blanco es una
    // decisión («que OnePay elija»), no un campo sin tocar.
    if (this.gwForm.gateway === 'onepay') {
      body.template_id = String(this.gwForm.template_id ?? '').trim() || null;
    }
    this.http.put<any>(GW_API + 'config', JSON.stringify(body), { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.gwSaving = false;
        this.gwMsg    = res.message ?? 'Configuración guardada.';
        // No se vacían: loadGatewayConfig los vuelve a poner con lo guardado,
        // que es lo que el operador espera ver después de guardar.
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

  /** Color del estado de una transacción, con las pastillas del panel. */
  txStatusClass(s: string): string {
    return ({ approved: 'np-pill--active', pending: 'np-pill--noip', declined: 'np-pill--suspended',
              cancelled: 'np-pill--suspended', failed: 'np-pill--neutral' } as Record<string, string>)[s] ?? 'np-pill--neutral';
  }

  /** Cambia de sección; en el teléfono la pestaña elegida queda a la vista. */
  irA(tab: 'billing' | 'invoice' | 'payment-methods' | 'gateway' | 'cortes' | 'correo'): void {
    this.activeTab = tab;
    setTimeout(() => document.querySelector('.bc-tabs [aria-selected="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
  }

  get gruposActivos(): number {
    return this.schedules.filter(s => s.active).length;
  }

  get metodosActivos(): number {
    return this.paymentMethods.filter(m => m.active).length;
  }

  // ── Correo (Mailjet) ──────────────────────────────────────
  // Sin cuenta propia los correos salen de la cuenta de Netvula
  // (no-reply@netvula.com) con el nombre de la empresa y las respuestas al
  // correo de la empresa. Aquí se conecta la cuenta de Mailjet propia.

  cargarCorreo(): void {
    this.correoCargando = true;
    this.correoMsg = '';
    this.correoError = '';
    this.correoService.configuracion().subscribe({
      next: (res) => {
        this.correoCargando = false;
        this.correoConfig = res?.data ?? null;
        this.correoForm = {
          activo:     !!this.correoConfig?.activo,
          api_key:    '',
          api_secret: '',
          from_email: this.correoConfig?.from_email ?? '',
          from_name:  this.correoConfig?.from_name ?? '',
        };
      },
      error: (err) => {
        this.correoCargando = false;
        this.correoError = err?.error?.message ?? 'No se pudo cargar la configuración de correo.';
      },
    });
  }

  guardarCorreo(): void {
    this.correoGuardando = true;
    this.correoMsg = '';
    this.correoError = '';

    const datos: any = {
      activo:     this.correoForm.activo,
      from_email: this.correoForm.from_email.trim(),
      from_name:  this.correoForm.from_name.trim(),
    };
    // Las llaves solo viajan si el admin escribió una nueva.
    if (this.correoForm.api_key.trim())    datos.api_key    = this.correoForm.api_key.trim();
    if (this.correoForm.api_secret.trim()) datos.api_secret = this.correoForm.api_secret.trim();

    this.correoService.guardar(datos).subscribe({
      next: (res) => {
        this.correoGuardando = false;
        this.correoMsg = res?.message ?? 'Configuración guardada.';
        this.correoForm.api_secret = '';
        this.correoForm.api_key = '';
        this.correoConfig = res?.data ?? this.correoConfig;
        if (res?.data) {
          this.correoForm.activo     = !!res.data.activo;
          this.correoForm.from_email = res.data.from_email ?? '';
          this.correoForm.from_name  = res.data.from_name ?? '';
        }
      },
      error: (err) => {
        this.correoGuardando = false;
        this.correoError = err?.error?.message ?? 'No se pudo guardar la configuración de correo.';
      },
    });
  }

  probarCorreo(): void {
    this.correoProbando = true;
    this.correoMsg = '';
    this.correoError = '';
    this.correoService.probar(this.correoEmailPrueba.trim() || undefined).subscribe({
      next: (res) => {
        this.correoProbando = false;
        this.correoMsg = res?.message ?? 'Correo de prueba enviado.';
      },
      error: (err) => {
        this.correoProbando = false;
        this.correoError = err?.error?.message ?? 'No se pudo enviar el correo de prueba.';
      },
    });
  }

  async desconectarCorreo(): Promise<void> {
    if (!await this.dialog.confirm('¿Desconectar su cuenta de Mailjet? Los correos vuelven a salir desde ' + (this.correoConfig?.remitente_plataforma ?? 'la cuenta de Netvula') + '.')) return;
    this.correoGuardando = true;
    this.correoMsg = '';
    this.correoError = '';
    this.correoService.desconectar().subscribe({
      next: (res) => {
        this.correoGuardando = false;
        this.correoMsg = res?.message ?? 'Cuenta de Mailjet desconectada.';
        this.correoConfig = res?.data ?? this.correoConfig;
        this.correoForm = { activo: false, api_key: '', api_secret: '', from_email: '', from_name: '' };
      },
      error: (err) => {
        this.correoGuardando = false;
        this.correoError = err?.error?.message ?? 'No se pudo desconectar la cuenta.';
      },
    });
  }

  // ── OnePay ────────────────────────────────────────────────────────────────

  /** Las plantillas de WhatsApp con las que OnePay puede mandar el cobro. */
  cargarPlantillasOnepay(): void {
    this.onepayCargandoPlantillas = true;
    this.onepayErrorPlantillas = '';
    this.onepayPlantillas = [];

    this.http.get<any>(environment.rootUrl + 'api/onepay/plantillas', { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.onepayCargandoPlantillas = false;

        if (res?.error === 1 || res?.status === 1) {
          this.onepayErrorPlantillas = res?.message ?? 'No se pudieron leer las plantillas.';
          return;
        }

        this.onepayPlantillas = res?.data ?? [];

        if (this.onepayPlantillas.length === 0) {
          this.onepayErrorPlantillas = 'OnePay no devolvió plantillas para cobrar. Hay que tener una aprobada por Meta de categoría PAYMENT.';
        }
      },
      error: (err) => {
        this.onepayCargandoPlantillas = false;
        this.onepayErrorPlantillas = err?.error?.message ?? 'No se pudieron leer las plantillas.';
      },
    });
  }

  /** Revisa la configuración de OnePay sin cobrarle a nadie. */
  revisarOnepay(): void {
    this.onepayRevisando = true;
    this.onepayRevision = null;

    this.http.get<any>(environment.rootUrl + 'api/onepay/diagnostico', { headers: this.getHeaders() }).subscribe({
      next: (res) => {
        this.onepayRevisando = false;
        this.onepayRevision = res?.data ?? { todo_bien: false, revisiones: [{ que: 'Respuesta', ok: false, detalle: res?.message ?? 'Sin datos' }] };
      },
      error: (err) => {
        this.onepayRevisando = false;
        this.onepayRevision = { todo_bien: false, revisiones: [{ que: 'Conexión', ok: false, detalle: err?.error?.message ?? 'No se pudo consultar.' }] };
      },
    });
  }

  gatewayLabel(g: string): string {
    return { wompi: 'Wompi', epayco: 'ePayco', zonapago: 'ZonaPago', efipay: 'EfiPay', onepay: 'OnePay' }[g] ?? g;
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
