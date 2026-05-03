import { Component, inject, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ClientApiService }  from '../services/client-api.service';
import { ClientAuthService } from '../services/client-auth.service';

@Component({
  selector: 'app-portal-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './portal-home.component.html',
})
export class PortalHomeComponent implements OnInit {
  private api    = inject(ClientApiService);
  private auth   = inject(ClientAuthService);
  private router = inject(Router);

  fullName    = signal('');
  loading     = signal(true);

  invoiceSummary   = signal<{ total: number; paid: number; pending: number; overdue: number } | null>(null);
  unpaidInvoices   = signal<any[]>([]);
  paymentAvailable = signal(false);
  openTickets      = signal(0);
  profile          = signal<any>(null);

  totalDue = computed(() =>
    this.unpaidInvoices().reduce((sum, inv) => sum + (inv.price_total - (inv.abone ?? 0)), 0)
  );

  ngOnInit(): void {
    this.fullName.set(this.auth.getFullName());
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);

    this.api.getInvoices().subscribe({
      next: (res) => {
        if (res.data) {
          this.invoiceSummary.set(res.data.summary);
          this.paymentAvailable.set(!!res.data.payment_available);
          const unpaid = (res.data.invoices as any[])
            .filter((inv: any) => inv.invoice_status !== 'paid')
            .sort((a: any, b: any) => a.date_facturation.localeCompare(b.date_facturation));
          this.unpaidInvoices.set(unpaid);
        }
      },
      error: () => {},
    });

    this.api.getTickets().subscribe({
      next: (res) => {
        const open = (res.data as any[])?.filter(
          (t: any) => t.status === 'Por hacer' || t.status === 'En curso'
        ).length ?? 0;
        this.openTickets.set(open);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });

    this.api.getProfile().subscribe({
      next: (res) => { this.profile.set(res.data); },
      error: () => {},
    });
  }

  goToPay(): void {
    this.router.navigate(['/portal/facturas'], { queryParams: { pay: '1' } });
  }

  getStatusLabel(status: string): string {
    return ({ paid: 'Pagada', pending: 'Pendiente', overdue: 'Vencida' } as Record<string,string>)[status] ?? status;
  }

  getStatusClasses(status: string): string {
    const map: Record<string, string> = {
      paid:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return map[status] ?? 'bg-gray-100 text-gray-800';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
  }
}
