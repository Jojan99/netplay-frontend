import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { FinanceService } from '../../services/finance.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-send-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './send-logs.component.html',
  styleUrl: './send-logs.component.scss',
})
export class SendLogsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<void>();

  loading = true;
  logs: any[] = [];
  total = 0;
  lastPage = 1;
  page = 1;
  perPage = 25;
  perPageOptions = [10, 25, 50, 100];

  // Filtros
  filters = {
    channel: '' as '' | 'whatsapp' | 'email' | 'both',
    status: '' as '' | 'ok' | 'error' | 'partial',
    date_from: '',
    date_to: '',
    sent_to_email: '',
    number_facture: '',
  };

  constructor(private financeService: FinanceService, private toast: ToastService) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(() => {
      this.page = 1;
      this.load();
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(): void {
    this.loading = true;
    this.financeService.getSendLogs({
      channel: this.filters.channel || undefined,
      status: this.filters.status || undefined,
      date_from: this.filters.date_from || undefined,
      date_to: this.filters.date_to || undefined,
      sent_to_email: this.filters.sent_to_email || undefined,
      number_facture: this.filters.number_facture || undefined,
      page: this.page,
      per_page: this.perPage,
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (res) => {
        const d = res.data;
        this.logs = d.items || [];
        this.total = d.total || 0;
        this.lastPage = d.last_page || 1;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.toast.error('Error al cargar logs');
      },
    });
  }

  onFilterChange(): void {
    this.searchSubject.next();
  }

  clearFilters(): void {
    this.filters = {
      channel: '',
      status: '',
      date_from: '',
      date_to: '',
      sent_to_email: '',
      number_facture: '',
    };
    this.page = 1;
    this.load();
  }

  changePerPage(): void {
    this.page = 1;
    this.load();
  }

  prevPage(): void {
    if (this.page > 1) { this.page--; this.load(); }
  }

  nextPage(): void {
    if (this.page < this.lastPage) { this.page++; this.load(); }
  }

  goToPage(p: number): void {
    this.page = p;
    this.load();
  }

  get pages(): number[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, this.page - delta); i <= Math.min(this.lastPage, this.page + delta); i++) {
      range.push(i);
    }
    return range;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  statusLabel(s: string): string {
    return { ok: 'Éxito', error: 'Error', partial: 'Parcial' }[s] ?? s;
  }

  statusClass(s: string): string {
    const m: Record<string, string> = {
      ok: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    };
    return m[s] ?? 'bg-gray-100 text-gray-700';
  }

  channelLabel(ch: string): string {
    return { whatsapp: 'WhatsApp', email: 'Email', both: 'Ambos' }[ch] ?? ch;
  }

  channelClass(ch: string): string {
    const m: Record<string, string> = {
      whatsapp: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      email: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      both: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    };
    return m[ch] ?? 'bg-gray-100 text-gray-700';
  }

  formatDate(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  toggleDetails(log: any): void {
    log._showDetails = !log._showDetails;
  }
}
