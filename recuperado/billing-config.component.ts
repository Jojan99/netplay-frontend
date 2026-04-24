import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { CompanyService } from '../../services/company.service';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { environment } from '../../../environments/environment';

interface Schedule {
  grupo:        number;
  billing_day:  number;
  billing_hour: number;
  active:       boolean;
}

@Component({
  selector: 'app-billing-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
  };
  invoiceLoading     = false;
  invoiceSaving      = false;
  invoiceSuccess     = '';
  invoiceError       = '';
  logoUploading      = false;
  logoUploadError    = '';

  // ── Auto-suspend ──────────────────────────────────────────
  autoSuspendEnabled  = false;
  autoSuspendDays     = 5;
  autoSuspendDay      = 5;   // día del mes para ejecutar cortes (1-28)
  autoSuspendSaving   = false;
  autoSuspendRunning  = false;
  autoSuspendMsg      = '';
  autoSuspendStats    = { currently_suspended: 0, suspended_today: 0, reactivated_today: 0 };

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
  ) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.authService.getToken() ?? ''}`,
    });
  }

  ngOnInit(): void {
    this.loadConfig();
    this.loadGroupInfo();
    this.loadInvoiceConfig();
    this.loadAutoSuspendConfig();
  }

  loadInvoiceConfig(): void {
    this.invoiceLoading = true;
    this.userService.getInvoiceConfig().subscribe({
      next: (res) => {
        this.invoiceLoading = false;
        if (res.data) Object.assign(this.invoiceForm, res.data);
      },
      error: () => { this.invoiceLoading = false; },
    });
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

  hourLabel(h: number): string {
    return h.toString().padStart(2, '0') + ':00';
  }

  otherGroups(excludeGrupo: number): Schedule[] {
    return this.schedules.filter(s => s.grupo !== excludeGrupo);
  }
}
