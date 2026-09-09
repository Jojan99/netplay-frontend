import { Component, inject, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ClientApiService } from '../services/client-api.service';

/** Historial de pagos del cliente, con acceso al comprobante en PDF. */
@Component({
  selector: 'app-payment-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './payment-history.component.html',
})
export class PaymentHistoryComponent implements OnInit {
  private api = inject(ClientApiService);

  loading   = signal(true);
  payments  = signal<any[]>([]);
  totalPaid = signal(0);
  openingId = signal<number | null>(null);
  errorMsg  = signal('');
  invoices  = signal<any[]>([]);

  approved = computed(() => this.payments().filter(p => p.status === 'approved'));

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    // El estado de cuenta dice con qué medio se pagó cada factura
    this.api.getStatement().subscribe({
      next: (res) => this.invoices.set((res.data?.invoices ?? []).filter((f: any) => f.paid_with)),
      error: () => {},
    });
    this.api.getPayments().subscribe({
      next: (res) => {
        this.payments.set(res.data?.payments ?? []);
        this.totalPaid.set(res.data?.total_paid ?? 0);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.errorMsg.set('No pudimos cargar tu historial de pagos.'); },
    });
  }

  /** El comprobante se genera sobre la factura pagada. */
  openReceipt(p: any): void {
    const invoiceId = p.invoice_ids?.[0] ?? (p.kind === 'invoice' ? p.id : null);
    if (!invoiceId) return;
    this.openingId.set(p.id);
    this.api.getReceiptUrl(invoiceId).subscribe({
      next: (res) => {
        this.openingId.set(null);
        if (res.data?.url) window.open(res.data.url, '_blank', 'noopener');
        else this.errorMsg.set('El comprobante no está disponible.');
      },
      error: () => { this.openingId.set(null); this.errorMsg.set('El comprobante no está disponible.'); },
    });
  }

  statusLabel(s: string): string {
    return ({ approved: 'Aprobado', pending: 'En proceso', declined: 'Rechazado', failed: 'Fallido', cancelled: 'Cancelado' } as Record<string, string>)[s] ?? s;
  }
  statusClass(s: string): string {
    return s === 'approved' ? 'is-ok' : s === 'pending' ? 'is-warn' : s === 'cancelled' ? '' : 'is-danger';
  }
  gatewayLabel(g: string | null): string {
    if (!g) return 'Pago registrado';
    return ({ wompi: 'Wompi', epayco: 'ePayco', efipay: 'EfiPay', zonapago: 'ZonaPago' } as Record<string, string>)[g] ?? g;
  }
  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v ?? 0);
  }
}
