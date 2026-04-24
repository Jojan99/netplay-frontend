import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';

const CATEGORIES = ['General', 'Servicios', 'Nómina', 'Arriendo', 'Mantenimiento', 'Suministros', 'Impuestos', 'Otros'];

@Component({
  selector: 'app-egresos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './egresos.component.html',
  styleUrl: './egresos.component.scss',
})
export class EgresosComponent implements OnInit, OnDestroy {
  private destroy$      = new Subject<void>();
  private searchSubject = new Subject<string>();

  categories = CATEGORIES;

  // ── List state ──────────────────────────────────────────────────────────
  loading = true;
  egresos: any[] = [];
  total = 0;
  lastPage = 1;
  page = 1;
  perPage = 15;
  perPageOptions = [15, 25, 50, 100];

  searchTerm = '';
  filterFrom = '';
  filterTo   = '';
  filterCategory = '';

  // ── Summary (from resumen API) ──────────────────────────────────────────
  totalPeriod = 0;

  // ── Add/Edit modal ──────────────────────────────────────────────────────
  modal = false;
  modalMode: 'create' | 'edit' = 'create';
  editingId: number | null = null;
  form: { concept: string; category: string; value: number; payment_method_id: number | null } =
    { concept: '', category: 'General', value: 0, payment_method_id: null };

  // Payment methods
  activePaymentMethods: any[] = [];

  // ── Delete confirm ──────────────────────────────────────────────────────
  deleteModal = false;
  deletingId: number | null = null;

  constructor(private financeService: FinanceService) {}

  ngOnInit(): void {
    // Default date range = current month
    const now      = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.filterFrom = this.fmt(firstDay);
    this.filterTo   = this.fmt(lastDay);

    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.page = 1;
      this.loadEgresos();
    });

    this.loadEgresos();
    this.loadSummary();
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
    this.modal = false;
    this.deleteModal = false;
  }

  fmt(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  // ── Data ────────────────────────────────────────────────────────────────

  loadEgresos(): void {
    this.loading = true;
    this.financeService.getEgresosPaginated(
      this.searchTerm, this.filterFrom, this.filterTo, this.filterCategory, this.page, this.perPage,
    ).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const d = res.data;
        this.egresos  = d.items || [];
        this.total    = d.total || 0;
        this.lastPage = d.last_page || 1;
        this.loading  = false;
        this.totalPeriod = this.egresos.reduce((s: number, e: any) => s + (+e.value || 0), 0);
      },
      error: () => { this.loading = false; },
    });
  }

  loadSummary(): void {
    this.financeService.getResumen(this.filterFrom, this.filterTo).subscribe({
      next: (res) => { this.totalPeriod = res.data?.total_egresses || 0; },
    });
  }

  onSearchChange(): void { this.searchSubject.next(this.searchTerm); }
  onFilterChange(): void { this.page = 1; this.loadEgresos(); this.loadSummary(); }
  changePerPage(): void  { this.page = 1; this.loadEgresos(); }

  prevPage(): void { if (this.page > 1) { this.page--; this.loadEgresos(); } }
  nextPage(): void { if (this.page < this.lastPage) { this.page++; this.loadEgresos(); } }
  goToPage(p: number): void { this.page = p; this.loadEgresos(); }

  get pages(): number[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, this.page - delta); i <= Math.min(this.lastPage, this.page + delta); i++) {
      range.push(i);
    }
    return range;
  }

  // ── Create / Edit ────────────────────────────────────────────────────────

  openCreate(): void {
    this.modalMode  = 'create';
    this.editingId  = null;
    this.form       = { concept: '', category: 'General', value: 0, payment_method_id: null };
    this.modal      = true;
  }

  openEdit(egreso: any): void {
    this.modalMode  = 'edit';
    this.editingId  = egreso.id;
    this.form       = { concept: egreso.concept, category: egreso.category || 'General', value: +egreso.value, payment_method_id: null };
    this.modal      = true;
  }

  saveForm(): void {
    if (!this.form.concept.trim() || this.form.value <= 0) return;

    const obs = this.modalMode === 'create'
      ? this.financeService.createEgresoV2(this.form)
      : this.financeService.updateEgreso(this.editingId!, this.form);

    obs.subscribe({
      next: () => {
        this.modal = false;
        this.loadEgresos();
        this.loadSummary();
      },
    });
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  openDelete(egreso: any): void {
    this.deletingId  = egreso.id;
    this.deleteModal = true;
  }

  confirmDelete(): void {
    if (!this.deletingId) return;
    this.financeService.deleteEgreso(this.deletingId).subscribe({
      next: () => {
        this.deleteModal = false;
        this.deletingId  = null;
        this.loadEgresos();
        this.loadSummary();
      },
    });
  }

  // ── CSV export ───────────────────────────────────────────────────────────

  exportCSV(): void {
    this.financeService.exportEgresosCSV(this.filterFrom, this.filterTo).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href    = url;
        a.download = `egresos_${this.filterFrom}_${this.filterTo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);
  }

  categoryClass(cat: string): string {
    const map: Record<string, string> = {
      General:       'bg-gray-100 text-gray-700',
      Servicios:     'bg-blue-100 text-blue-700',
      Nómina:        'bg-purple-100 text-purple-700',
      Arriendo:      'bg-yellow-100 text-yellow-700',
      Mantenimiento: 'bg-orange-100 text-orange-700',
      Suministros:   'bg-teal-100 text-teal-700',
      Impuestos:     'bg-red-100 text-red-700',
      Otros:         'bg-pink-100 text-pink-700',
    };
    return map[cat] ?? 'bg-gray-100 text-gray-700';
  }
}
