import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClientApiService } from '../services/client-api.service';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './invoice-list.component.html',
})
export class InvoiceListComponent implements OnInit {
  private api = inject(ClientApiService);

  loading       = signal(true);
  invoices      = signal<any[]>([]);
  summary       = signal<any>(null);
  sendingId     = signal<number | null>(null);
  sendResult    = signal<{ id: number; ok: boolean; msg: string } | null>(null);
  pdfLoadingId  = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getInvoices().subscribe({
      next: (res) => {
        this.invoices.set(res.data?.invoices ?? []);
        this.summary.set(res.data?.summary ?? null);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  openPdf(invoice: any): void {
    this.pdfLoadingId.set(invoice.id);
    this.api.getInvoicePdfUrl(invoice.id).subscribe({
      next: (res) => {
        this.pdfLoadingId.set(null);
        if (res.data?.pdf_url) {
          window.open(res.data.pdf_url, '_blank');
        }
      },
      error: () => { this.pdfLoadingId.set(null); },
    });
  }

  sendWhatsapp(invoice: any): void {
    this.sendingId.set(invoice.id);
    this.sendResult.set(null);
    this.api.sendInvoiceWhatsapp(invoice.id).subscribe({
      next: (res) => {
        this.sendingId.set(null);
        this.sendResult.set({ id: invoice.id, ok: true, msg: 'Factura enviada por WhatsApp' });
        setTimeout(() => this.sendResult.set(null), 4000);
      },
      error: () => {
        this.sendingId.set(null);
        this.sendResult.set({ id: invoice.id, ok: false, msg: 'Error al enviar' });
        setTimeout(() => this.sendResult.set(null), 4000);
      },
    });
  }

  statusLabel(s: string): string {
    return { paid: 'Pagada', pending: 'Pendiente', overdue: 'Vencida' }[s] ?? s;
  }

  statusClass(s: string): string {
    const map: Record<string, string> = {
      paid:    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    return map[s] ?? 'bg-gray-100 text-gray-700';
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }
}
