import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { ToastService }   from '../../services/toast.service';

@Component({
  selector: 'app-finance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './finance.component.html',
  styleUrl: './finance.component.scss',
})
export class FinanceComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  // ── State ───────────────────────────────────────────────────────────────
  loading = true;
  clients: any[] = [];
  totalClients = 0;
  lastPage = 1;
  page = 1;
  perPage = 15;
  perPageOptions = [15, 25, 50, 100];
  searchTerm = '';

  // Selected client drawer
  drawerOpen = false;
  selectedClient: any = null;
  invoices: any[] = [];
  paymentLogs: any[] = [];
  drawerLoading = false;
  drawerTab: 'pending' | 'paid' = 'pending';

  get drawerInvoices(): any[] {
    return this.drawerTab === 'pending'
      ? this.invoices.filter(i => i.paid !== 1)
      : this.invoices.filter(i => i.paid === 1);
  }
  get drawerPendingCount(): number { return this.invoices.filter(i => i.paid !== 1).length; }
  get drawerPaidCount():   number { return this.invoices.filter(i => i.paid === 1).length; }

  // Active payment methods
  activePaymentMethods: any[] = [];

  // Pay modal
  payModal = false;
  payingInvoice: any = null;
  payMethodId: number | null = null;

  // Abonar modal
  abonarModal = false;
  abonarInvoice: any = null;
  abonarAmount = 0;
  abonarMethodId: number | null = null;

  // Liquidación masiva
  liquidateModal    = false;
  liquidateSelected: Set<number> = new Set();
  liquidateMethodId: number | null = null;
  liquidating       = false;

  get liquidateInvoices(): any[] {
    return this.invoices.filter(i => i.paid !== 1);
  }
  get allLiquidateSelected(): boolean {
    return this.liquidateInvoices.length > 0 && this.liquidateInvoices.every(i => this.liquidateSelected.has(i.id));
  }
  toggleLiquidateInvoice(id: number): void {
    this.liquidateSelected.has(id) ? this.liquidateSelected.delete(id) : this.liquidateSelected.add(id);
  }
  toggleAllLiquidate(): void {
    if (this.allLiquidateSelected) {
      this.liquidateSelected.clear();
    } else {
      this.liquidateInvoices.forEach(i => this.liquidateSelected.add(i.id));
    }
  }

  // Edit invoice modal
  editModal = false;
  editingInvoice: any = null;
  editForm: any = {};

  // Compromiso de pago
  commitments: any[] = [];
  commitmentModal    = false;
  commitmentForm     = { commitment_date: '', notes: '', auto_suspend: true };
  commitmentSelected: Set<number> = new Set();
  savingCommitment   = false;
  commitmentError    = '';

  // ── Envío de facturas ────────────────────────────────────────────────────
  sendModal       = false;
  sendModalInv    : any[] = [];  // facturas a enviar
  sendChannel     : 'whatsapp' | 'email' | 'both' = 'whatsapp';
  sendingIds      : Set<number> = new Set();
  sendResult      : { ok: boolean; msg: string } | null = null;
  sendBulkIds     : Set<number> = new Set();
  sendBulkModal   = false;
  sendBulkChannel : 'whatsapp' | 'email' | 'both' = 'whatsapp';
  sendingBulk     = false;

  // Historial de envíos
  sendHistoryModal = false;
  sendHistoryInvoice: any = null;
  sendHistoryData: any[] = [];
  sendHistoryLoading = false;

  get commitmentTotal(): number {
    return this.invoices
      .filter(i => i.paid !== 1 && this.commitmentSelected.has(i.id))
      .reduce((s, i) => s + Math.max(0, (i.price_total || 0) - (i.price_abone || 0) - (i.price_discount || 0)), 0);
  }

  toggleCommitmentInvoice(id: number): void {
    this.commitmentSelected.has(id) ? this.commitmentSelected.delete(id) : this.commitmentSelected.add(id);
  }

  constructor(private financeService: FinanceService, private toast: ToastService) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.page = 1;
      this.loadClients();
    });
    this.loadClients();
    this.loadActivePaymentMethods();
  }

  loadActivePaymentMethods(): void {
    this.financeService.getActivePaymentMethods().subscribe({
      next: (res) => { this.activePaymentMethods = res.data ?? []; },
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.closeDrawer();
    this.payModal        = false;
    this.abonarModal     = false;
    this.editModal       = false;
    this.commitmentModal = false;
    this.liquidateModal  = false;
  }

  // ── Data ────────────────────────────────────────────────────────────────

  loadClients(): void {
    this.loading = true;
    this.financeService.getClientsPaginated(this.searchTerm, this.page, this.perPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          const d = res.data;
          this.clients    = d.items || [];
          this.totalClients = d.total || 0;
          this.lastPage   = d.last_page || 1;
          this.loading    = false;
        },
        error: () => { this.loading = false; },
      });
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchTerm);
  }

  changePerPage(): void {
    this.page = 1;
    this.loadClients();
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.loadClients(); }
  }

  nextPage(): void {
    if (this.page < this.lastPage) { this.page++; this.loadClients(); }
  }

  goToPage(p: number): void {
    this.page = p;
    this.loadClients();
  }

  get pages(): number[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, this.page - delta); i <= Math.min(this.lastPage, this.page + delta); i++) {
      range.push(i);
    }
    return range;
  }

  // ── Client drawer ────────────────────────────────────────────────────────

  openDrawer(client: any): void {
    this.selectedClient = client;
    this.drawerOpen     = true;
    this.drawerTab      = 'pending';
    this.invoices       = [];
    this.paymentLogs    = [];
    this.commitments    = [];
    this.drawerLoading  = true;
    this.financeService.getClientInvoices(client.cab_id).subscribe({
      next: (res) => {
        this.invoices    = res.data?.invoices || [];
        this.paymentLogs = res.data?.logs     || [];
        this.drawerLoading = false;
      },
      error: () => { this.drawerLoading = false; },
    });
    this.financeService.getCommitments(client.cab_id).subscribe({
      next: (res) => { this.commitments = res.data || []; },
    });
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    this.selectedClient = null;
  }

  // ── Pay ──────────────────────────────────────────────────────────────────

  openPayModal(invoice: any): void {
    this.payingInvoice = invoice;
    this.payMethodId   = null;
    this.payModal      = true;
  }

  confirmPay(): void {
    if (!this.payingInvoice) return;
    if (this.activePaymentMethods.length > 0 && !this.payMethodId) {
      this.toast.error('Selecciona un método de pago'); return;
    }
    const clientName = `${this.selectedClient.names} ${this.selectedClient.lastname}`;
    this.financeService.payInvoice(this.payingInvoice.id, clientName, this.payMethodId).subscribe({
      next: () => {
        this.payModal = false;
        this.payingInvoice = null;
        this.toast.success('Pago registrado correctamente');
        this.openDrawer(this.selectedClient);
        this.loadClients();
      },
      error: () => this.toast.error('Error al registrar el pago'),
    });
  }

  // ── Abonar ───────────────────────────────────────────────────────────────

  openAbonarModal(invoice: any): void {
    this.abonarInvoice  = invoice;
    this.abonarAmount   = 0;
    this.abonarMethodId = null;
    this.abonarModal    = true;
  }

  confirmAbonar(): void {
    if (!this.abonarInvoice || this.abonarAmount <= 0) return;
    if (this.activePaymentMethods.length > 0 && !this.abonarMethodId) {
      this.toast.error('Selecciona un método de pago'); return;
    }
    const clientName = `${this.selectedClient.names} ${this.selectedClient.lastname}`;
    this.financeService.abonarInvoice(this.abonarInvoice.id, this.abonarAmount, clientName, this.abonarMethodId).subscribe({
      next: () => {
        this.abonarModal = false;
        this.abonarInvoice = null;
        this.toast.success('Abono registrado correctamente');
        this.openDrawer(this.selectedClient);
        this.loadClients();
      },
      error: () => this.toast.error('Error al registrar el abono'),
    });
  }

  // ── Liquidación masiva ────────────────────────────────────────────────────

  openLiquidateModal(): void {
    this.liquidateSelected = new Set(this.liquidateInvoices.map(i => i.id));
    this.liquidateMethodId = null;
    this.liquidateModal    = true;
  }

  confirmLiquidate(): void {
    if (this.liquidateSelected.size === 0) { this.toast.error('Selecciona al menos una factura'); return; }
    if (this.activePaymentMethods.length > 0 && !this.liquidateMethodId) {
      this.toast.error('Selecciona un método de pago'); return;
    }
    this.liquidating = true;
    const clientName = `${this.selectedClient.names} ${this.selectedClient.lastname}`;
    this.financeService.liquidateBulk(
      Array.from(this.liquidateSelected), clientName,
      this.selectedClient.user_id, this.liquidateMethodId
    ).subscribe({
      next: (res) => {
        this.liquidating    = false;
        this.liquidateModal = false;
        this.toast.success(`${res.data?.paid ?? 0} factura(s) liquidada(s)`);
        this.openDrawer(this.selectedClient);
        this.loadClients();
      },
      error: () => { this.liquidating = false; this.toast.error('Error al liquidar'); },
    });
  }

  // ── Edit invoice ─────────────────────────────────────────────────────────

  openEditModal(invoice: any): void {
    this.editingInvoice = invoice;
    this.editForm = {
      price_total:         invoice.price_total,
      price_discount:      invoice.price_discount,
      porcentage_discount: invoice.porcentage_discount,
      days_facture:        invoice.days_facture,
      date_facturation:    invoice.date_facturation?.split('T')[0] ?? invoice.date_facturation,
    };
    this.editModal = true;
  }

  // Live calc: when % changes → recalculate price_discount
  onPorcentajeChange(): void {
    const pct = +this.editForm.porcentage_discount || 0;
    const tot = +this.editForm.price_total || 0;
    this.editForm.price_discount = Math.round((tot * pct) / 100);
  }

  // Live calc: when price_discount changes → recalculate %
  onDiscountChange(): void {
    const disc = +this.editForm.price_discount || 0;
    const tot  = +this.editForm.price_total   || 0;
    this.editForm.porcentage_discount = tot > 0 ? Math.round((disc / tot) * 100) : 0;
  }

  // Live calc: when price_total changes → keep % consistent
  onPriceTotalChange(): void {
    const pct = +this.editForm.porcentage_discount || 0;
    const tot = +this.editForm.price_total || 0;
    this.editForm.price_discount = Math.round((tot * pct) / 100);
  }

  get editFinalPrice(): number {
    return Math.max(0, (+this.editForm.price_total || 0) - (+this.editForm.price_discount || 0));
  }

  get editDailyRate(): number {
    const days = +this.editForm.days_facture || 0;
    const tot  = +this.editForm.price_total  || 0;
    return days > 0 ? Math.round(tot / days) : 0;
  }

  confirmEdit(): void {
    if (!this.editingInvoice) return;
    this.financeService.updateInvoiceNew(this.editingInvoice.id, this.editForm).subscribe({
      next: () => {
        this.editModal = false;
        this.editingInvoice = null;
        this.toast.success('Factura actualizada');
        this.openDrawer(this.selectedClient);
      },
      error: () => this.toast.error('Error al actualizar la factura'),
    });
  }

  // ── Compromisos de pago ───────────────────────────────────────────────────

  openCommitmentModal(): void {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    this.commitmentForm     = { commitment_date: tomorrow.toISOString().split('T')[0], notes: '', auto_suspend: true };
    this.commitmentSelected = new Set();
    this.commitmentError    = '';
    this.commitmentModal    = true;
  }

  saveCommitment(): void {
    if (!this.commitmentForm.commitment_date) {
      this.commitmentError = 'La fecha es obligatoria.'; return;
    }
    if (this.commitmentSelected.size === 0) {
      this.commitmentError = 'Selecciona al menos una factura pendiente.'; return;
    }
    this.savingCommitment = true;
    this.commitmentError  = '';
    this.financeService.createCommitment({
      cab_id:          this.selectedClient.cab_id,
      user_id:         this.selectedClient.user_id,
      commitment_date: this.commitmentForm.commitment_date,
      invoice_ids:     Array.from(this.commitmentSelected),
      notes:           this.commitmentForm.notes,
      auto_suspend:    this.commitmentForm.auto_suspend,
    } as any).subscribe({
      next: (res) => {
        this.savingCommitment = false;
        if (res.error) { this.commitmentError = res.message; return; }
        this.commitmentModal = false;
        this.commitments = [res.data, ...this.commitments];
        this.toast.success('Compromiso de pago creado');
      },
      error: (e) => {
        this.savingCommitment = false;
        this.commitmentError = e.error?.message || 'Error al guardar.';
        this.toast.error('Error al crear el compromiso');
      },
    });
  }

  cancelCommitment(c: any): void {
    this.financeService.cancelCommitment(c.id).subscribe({
      next: () => { c.status = 'cancelled'; },
    });
  }

  fulfillCommitment(c: any): void {
    this.financeService.fulfillCommitment(c.id).subscribe({
      next: () => { c.status = 'fulfilled'; c.fulfilled_at = new Date().toISOString(); },
    });
  }

  commitmentStatusClass(status: string): string {
    const m: Record<string, string> = {
      pending:   'bg-yellow-100 text-yellow-800',
      fulfilled: 'bg-green-100 text-green-800',
      broken:    'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-500',
    };
    return m[status] ?? 'bg-gray-100 text-gray-500';
  }

  commitmentStatusLabel(status: string): string {
    const m: Record<string, string> = {
      pending:   'Pendiente',
      fulfilled: 'Cumplido',
      broken:    'Incumplido',
      cancelled: 'Cancelado',
    };
    return m[status] ?? status;
  }

  get activeCommitment(): any | null {
    return this.commitments.find(c => c.status === 'pending') ?? null;
  }

  // ── Envío de facturas ────────────────────────────────────────────────────

  openSendModal(invoice: any): void {
    this.sendModalInv = [invoice];
    this.sendChannel = 'whatsapp';
    this.sendResult = null;
    this.sendModal = true;
  }

  openSendHistoryModal(invoice: any): void {
    this.sendHistoryInvoice = invoice;
    this.sendHistoryData = [];
    this.sendHistoryLoading = true;
    this.sendHistoryModal = true;
    this.financeService.getSendHistory(invoice.id).subscribe({
      next: (res) => {
        this.sendHistoryData = res.data || [];
        this.sendHistoryLoading = false;
      },
      error: () => { this.sendHistoryLoading = false; },
    });
  }

  closeSendHistoryModal(): void {
    this.sendHistoryModal = false;
    this.sendHistoryInvoice = null;
    this.sendHistoryData = [];
  }

  sendHistoryChannelLabel(ch: string): string {
    return { whatsapp: 'WhatsApp', email: 'Email', both: 'Ambos' }[ch] || ch;
  }

  sendHistoryStatusClass(s: string): string {
    const m: Record<string, string> = {
      ok: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800',
      partial: 'bg-yellow-100 text-yellow-800',
    };
    return m[s] ?? 'bg-gray-100 text-gray-700';
  }

  openSendBulkModal(): void {
    const pending = this.invoices.filter(i => i.paid !== 1);
    if (pending.length === 0) { this.toast.error('No hay facturas pendientes para enviar'); return; }
    this.sendBulkIds = new Set(pending.map(i => i.id));
    this.sendBulkChannel = 'whatsapp';
    this.sendResult = null;
    this.sendBulkModal = true;
  }

  closeSendModal(): void { this.sendModal = false; this.sendModalInv = []; }
  closeSendBulkModal(): void { this.sendBulkModal = false; this.sendBulkIds.clear(); }

  confirmSend(): void {
    if (this.sendModalInv.length === 0) return;
    const inv = this.sendModalInv[0];
    this.sendingIds.add(inv.id);
    this.sendResult = null;
    this.financeService.sendInvoice(inv.id, this.sendChannel).subscribe({
      next: (res) => {
        this.sendingIds.delete(inv.id);
        this.sendResult = { ok: res.status === 'ok' || res.status === 0, msg: res.message || 'Factura enviada' };
        if (this.sendResult.ok) {
          setTimeout(() => { this.closeSendModal(); this.sendResult = null; }, 2500);
        }
      },
      error: (err) => {
        this.sendingIds.delete(inv.id);
        const msg = this.formatSendError(err);
        this.sendResult = { ok: false, msg };
      },
    });
  }

  private formatSendError(err: any): string {
    const code = err.error?.error_code;
    const msg = err.error?.message;
    if (code === 'NO_PHONE') return 'El cliente no tiene teléfono registrado.';
    if (code === 'NO_EMAIL') return 'El cliente no tiene correo válido registrado.';
    if (msg) return msg;
    return 'Error al enviar factura. Intenta de nuevo.';
  }

  confirmSendBulk(): void {
    if (this.sendBulkIds.size === 0) { this.toast.error('Selecciona al menos una factura'); return; }
    this.sendingBulk = true;
    this.sendResult = null;
    const ids = Array.from(this.sendBulkIds);
    let completed = 0;
    let errors: string[] = [];
    ids.forEach(id => {
      this.sendingIds.add(id);
      this.financeService.sendInvoice(id, this.sendBulkChannel).subscribe({
        next: (res) => {
          this.sendingIds.delete(id);
          completed++;
          if (completed === ids.length) {
            this.sendingBulk = false;
            this.sendResult = { ok: errors.length === 0, msg: `${ids.length - errors.length}/${ids.length} enviadas` + (errors.length ? ` (${errors.length} fallidas)` : '') };
            setTimeout(() => { this.closeSendBulkModal(); this.sendResult = null; }, 3000);
          }
        },
        error: (err) => {
          this.sendingIds.delete(id);
          errors.push(err.error?.message || 'Error');
          completed++;
          if (completed === ids.length) {
            this.sendingBulk = false;
            this.sendResult = { ok: errors.length === 0, msg: `${ids.length - errors.length}/${ids.length} enviadas` + (errors.length ? ` (${errors.length} fallidas)` : '') };
          }
        },
      });
    });
  }

  toggleSendBulkInvoice(id: number): void {
    this.sendBulkIds.has(id) ? this.sendBulkIds.delete(id) : this.sendBulkIds.add(id);
  }

  toggleAllSendBulk(): void {
    const pending = this.invoices.filter(i => i.paid !== 1);
    if (pending.every(i => this.sendBulkIds.has(i.id))) {
      pending.forEach(i => this.sendBulkIds.delete(i.id));
    } else {
      pending.forEach(i => this.sendBulkIds.add(i.id));
    }
  }

  get allSendBulkSelected(): boolean {
    const pending = this.invoices.filter(i => i.paid !== 1);
    return pending.length > 0 && pending.every(i => this.sendBulkIds.has(i.id));
  }

  get sendBulkInvoices(): any[] {
    return this.invoices.filter(i => i.paid !== 1);
  }

  // ── CSV export ───────────────────────────────────────────────────────────

  exportCSV(): void {
    const cabId = this.selectedClient?.cab_id;
    this.financeService.exportPaymentsCSV(undefined, undefined, cabId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href    = url;
        a.download = `pagos_${cabId ?? 'todos'}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  exportAllCSV(): void {
    this.financeService.exportPaymentsCSV().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href    = url;
        a.download = `pagos_todos_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);
  }

  invoiceBalance(inv: any): number {
    return (inv.price_total || 0) - (inv.price_abone || 0) - (inv.price_discount || 0);
  }

  invoiceStatusClass(inv: any): string {
    if (inv.paid === 1) return 'bg-green-100 text-green-800';
    if (inv.abone === 1) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  }

  invoiceStatusLabel(inv: any): string {
    if (inv.paid === 1) return 'Pagado';
    if (inv.abone === 1) return 'Abono';
    return 'Pendiente';
  }

  logTypeLabel(type: string): string {
    const map: Record<string, string> = {
      pago_completo: 'Pago completo',
      abono:         'Abono',
      descuento:     'Descuento',
      ajuste:        'Ajuste',
    };
    return map[type] ?? type;
  }

  logTypeClass(type: string): string {
    const map: Record<string, string> = {
      pago_completo: 'bg-green-100 text-green-800',
      abono:         'bg-blue-100 text-blue-800',
      descuento:     'bg-purple-100 text-purple-800',
      ajuste:        'bg-gray-100 text-gray-800',
    };
    return map[type] ?? 'bg-gray-100 text-gray-800';
  }
}
