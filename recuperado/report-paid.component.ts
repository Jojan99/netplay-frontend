import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { UserService } from '../../services/user.service';
import { FinanceService } from '../../services/finance.service';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-report-paid',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-paid.component.html',
  styleUrls: ['./report-paid.component.scss'],
})
export class ReportPaidComponent implements OnInit, OnDestroy {
  private destroy$      = new Subject<void>();
  private searchSubject = new Subject<string>();

  // ── Search ──────────────────────────────────────────────────────────────
  searchText      = '';
  allUsers:      any[] = [];
  filteredUsers:  any[] = [];
  showDropdown    = false;
  isSearching     = false;
  statusFilter:   'all' | 'active' | 'inactive' = 'active';

  // ── Selected client ──────────────────────────────────────────────────────
  selectedUser: any = null;
  cabId: number | null = null;

  // ── Invoice data ──────────────────────────────────────────────────────────
  isLoadingInvoices = false;
  allInvoices: any[] = [];
  allLogs:     any[] = [];
  activeFilter: 'all' | 'paid' | 'pending' | 'abone' = 'all';
  expandedInvoiceId: number | null = null;

  // ── Log modal ──────────────────────────────────────────────────────────
  logModal      = false;
  modalInvoice: any = null;
  modalLogs:   any[] = [];

  constructor(
    private userService: UserService,
    private financeService: FinanceService,
  ) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(term => this.filterLocalUsers(term));

    this.loadAllUsers();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:click')
  onDocClick(): void { this.showDropdown = false; }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.showDropdown = false; this.logModal = false; }

  // ── User search ──────────────────────────────────────────────────────────

  loadAllUsers(): void {
    this.isSearching = true;
    this.userService.getAllUser().subscribe({
      next: (data) => {
        this.allUsers = data.data || [];
        this.filterLocalUsers(this.searchText);
        this.isSearching = false;
      },
      error: () => { this.isSearching = false; },
    });
  }

  onSearchInput(event: Event): void {
    this.showDropdown = true;
    this.searchSubject.next((event.target as HTMLInputElement).value);
  }

  filterLocalUsers(term: string): void {
    const t = term.toLowerCase();
    let base = this.allUsers;
    if (this.statusFilter === 'active')   base = base.filter(u => u.internet_status === 'ACTIVE' || u.internet_status === 1);
    if (this.statusFilter === 'inactive') base = base.filter(u => u.internet_status !== 'ACTIVE' && u.internet_status !== 1);
    this.filteredUsers = !t ? base : base.filter(u =>
      (u.names + ' ' + u.lastname).toLowerCase().includes(t) ||
      (u.dni  || '').toLowerCase().includes(t) ||
      (u.phone || '').toLowerCase().includes(t),
    );
  }

  setStatusFilter(f: string): void {
    this.statusFilter = f as 'all' | 'active' | 'inactive';
    this.filterLocalUsers(this.searchText);
  }

  selectUser(user: any, $event: Event): void {
    $event.stopPropagation();
    this.searchText   = `${user.names} ${user.lastname}`;
    this.showDropdown = false;
    this.selectedUser = user;
    this.cabId        = user.id_cab;
    this.loadInvoices(user.id_cab);
  }

  clearSelection(): void {
    this.searchText    = '';
    this.selectedUser  = null;
    this.cabId         = null;
    this.allInvoices   = [];
    this.allLogs       = [];
    this.showDropdown  = false;
  }

  // ── Invoice data ──────────────────────────────────────────────────────────

  loadInvoices(cabId: number): void {
    this.isLoadingInvoices = true;
    this.allInvoices = [];
    this.allLogs     = [];
    this.financeService.getClientInvoices(cabId).subscribe({
      next: (res) => {
        this.allInvoices       = res.data?.invoices || [];
        this.allLogs           = res.data?.logs     || [];
        this.isLoadingInvoices = false;
      },
      error: () => { this.isLoadingInvoices = false; },
    });
  }

  // ── Filters ──────────────────────────────────────────────────────────────

  get filtered(): any[] {
    switch (this.activeFilter) {
      case 'paid':    return this.allInvoices.filter(i => i.paid === 1);
      case 'pending': return this.allInvoices.filter(i => i.paid !== 1 && i.abone !== 1);
      case 'abone':   return this.allInvoices.filter(i => i.abone === 1 && i.paid !== 1);
      default:        return this.allInvoices;
    }
  }

  // ── Metrics ──────────────────────────────────────────────────────────────

  get totalFacturado(): number {
    return this.allInvoices.reduce((s, i) => s + (+i.price_total || 0), 0);
  }

  get totalPagado(): number {
    return this.allInvoices
      .filter(i => i.paid === 1)
      .reduce((s, i) => s + ((+i.price_total - +i.price_discount) || 0), 0);
  }

  get totalAbonado(): number {
    return this.allInvoices.reduce((s, i) => s + (+i.price_abone || 0), 0);
  }

  get totalPendiente(): number {
    return this.allInvoices
      .filter(i => i.paid !== 1)
      .reduce((s, i) => s + this.invoiceBalance(i), 0);
  }

  get tasaPago(): number {
    if (!this.allInvoices.length) return 0;
    return Math.round((this.allInvoices.filter(i => i.paid === 1).length / this.allInvoices.length) * 100);
  }

  get avgDaysToPay(): number {
    const paid = this.allInvoices.filter(i => i.paid === 1 && i.paid_at && i.created_at);
    if (!paid.length) return 0;
    const totalDays = paid.reduce((s, i) => {
      const created = new Date(i.created_at).getTime();
      const paidAt  = new Date(i.paid_at).getTime();
      return s + Math.max(0, Math.round((paidAt - created) / 86400000));
    }, 0);
    return Math.round(totalDays / paid.length);
  }

  get habitLabel(): string {
    const t = this.tasaPago;
    if (t >= 80) return 'Buen pagador';
    if (t >= 50) return 'Pagador regular';
    if (t >= 25) return 'Riesgo moderado';
    return 'Alto riesgo';
  }

  get habitColor(): string {
    const t = this.tasaPago;
    if (t >= 80) return 'bg-green-100 text-green-800';
    if (t >= 50) return 'bg-yellow-100 text-yellow-800';
    if (t >= 25) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  }

  get habitIcon(): string {
    const t = this.tasaPago;
    if (t >= 80) return '✓';
    if (t >= 50) return '~';
    return '!';
  }

  get puntualLabel(): string {
    const d = this.avgDaysToPay;
    if (d === 0) return '—';
    if (d <= 5)  return 'Muy puntual';
    if (d <= 15) return `Paga ~${d} días después`;
    if (d <= 30) return `Paga ~${d} días después`;
    return `Tardío (~${d} días)`;
  }

  get puntualColor(): string {
    const d = this.avgDaysToPay;
    if (d === 0) return 'text-gray-400';
    if (d <= 5)  return 'text-green-600';
    if (d <= 15) return 'text-blue-600';
    if (d <= 30) return 'text-yellow-600';
    return 'text-red-600';
  }

  // ── Invoice helpers ───────────────────────────────────────────────────────

  invoiceBalance(inv: any): number {
    if (!inv) return 0;
    return Math.max(0, (+inv.price_total || 0) - (+inv.price_abone || 0) - (+inv.price_discount || 0));
  }

  invoicePaidAmount(inv: any): number {
    if (inv.paid === 1) return (+inv.price_total || 0) - (+inv.price_discount || 0);
    return +inv.price_abone || 0;
  }

  statusClass(inv: any): string {
    if (inv.paid === 1)                       return 'bg-green-100 text-green-800';
    if (inv.abone === 1 && inv.paid !== 1)    return 'bg-blue-100 text-blue-800';
    return 'bg-red-100 text-red-800';
  }

  statusLabel(inv: any): string {
    if (inv.paid === 1)                       return 'Pagado';
    if (inv.abone === 1 && inv.paid !== 1)    return 'Abono parcial';
    return 'Pendiente';
  }

  logsForInvoice(inv: any): any[] {
    return this.allLogs.filter(l => l.det_facturation_id === inv.id);
  }

  toggleExpand(invId: number): void {
    this.expandedInvoiceId = this.expandedInvoiceId === invId ? null : invId;
  }

  openLogModal(inv: any): void {
    this.modalInvoice = inv;
    this.modalLogs    = this.logsForInvoice(inv);
    this.logModal     = true;
  }

  logTypeLabel(type: string): string {
    const m: Record<string, string> = {
      pago_completo: 'Pago completo',
      abono:         'Abono',
      descuento:     'Descuento',
      ajuste:        'Ajuste',
    };
    return m[type] ?? type;
  }

  logTypeColor(type: string): string {
    const m: Record<string, string> = {
      pago_completo: 'bg-green-500',
      abono:         'bg-blue-500',
      descuento:     'bg-purple-500',
      ajuste:        'bg-gray-500',
    };
    return m[type] ?? 'bg-gray-400';
  }

  // ── Download ──────────────────────────────────────────────────────────────

  downloadComprobante(inv: any): void {
    if (!inv || inv.paid !== 1 || !this.selectedUser) return;
    this.userService.downloadPayById(inv.number_facture, 'ok').subscribe({
      next: (blob) => {
        if (blob) this.downloadFile(blob,
          `${this.selectedUser.names}_${this.selectedUser.lastname}_${inv.number_facture}.pdf`);
      },
    });
  }

  async downloadFile(blob: Blob, fileName: string): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        const buf    = await blob.arrayBuffer();
        const bytes  = new Uint8Array(buf);
        let binary   = '';
        bytes.forEach(b => binary += String.fromCharCode(b));
        await Filesystem.writeFile({ path: fileName, data: btoa(binary), directory: Directory.Documents });
      } else {
        saveAs(blob, fileName);
      }
    } catch (_) {}
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);
  }

  setFilter(f: string): void {
    this.activeFilter = f as 'all' | 'paid' | 'pending' | 'abone';
  }

  get filterCounts(): Record<string, number> {
    return {
      all:     this.allInvoices.length,
      paid:    this.allInvoices.filter(i => i.paid === 1).length,
      pending: this.allInvoices.filter(i => i.paid !== 1 && i.abone !== 1).length,
      abone:   this.allInvoices.filter(i => i.abone === 1 && i.paid !== 1).length,
    };
  }
}
