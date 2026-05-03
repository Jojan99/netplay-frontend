import { Component, inject, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ClientApiService } from '../services/client-api.service';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-list.component.html',
})
export class InvoiceListComponent implements OnInit {
  private api    = inject(ClientApiService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  loading          = signal(true);
  invoices         = signal<any[]>([]);
  summary          = signal<any>(null);
  paymentAvailable = signal(false);
  sendingId        = signal<number | null>(null);
  sendResult       = signal<{ id: number; ok: boolean; msg: string } | null>(null);
  pdfLoadingId     = signal<number | null>(null);

  // ── Pago — modal setup (paso 1) ──────────────────────────────────────────
  paySetupOpen    = signal(false);
  payAmount       = signal(0);
  payAmountStr    = signal('');
  payAmountError  = signal<string | null>(null);
  invoicesExpanded = signal(false);

  // ── Pago — confirmación (paso 2) ─────────────────────────────────────────
  payConfirm   = signal<any | null>(null);   // response data de initiatePayment
  payInitiating = signal(false);

  // ── Resultado tras retorno de pasarela ───────────────────────────────────
  payResult         = signal<any | null>(null);
  payResultLoading  = signal(false);
  payPollAttempt    = signal(0);
  private readonly POLL_MAX      = 12;  // 12 × 3 s = 36 s máximo
  private readonly POLL_INTERVAL = 3000;

  // Facturas sin pagar, ordenadas de más antigua a más nueva
  unpaidInvoices = computed(() =>
    this.invoices()
      .filter(inv => inv.invoice_status !== 'paid')
      .sort((a, b) => a.date_facturation.localeCompare(b.date_facturation))
  );

  totalDue = computed(() =>
    this.unpaidInvoices().reduce((sum, inv) => sum + (inv.price_total - (inv.abone ?? 0)), 0)
  );

  // Preview de cómo se distribuye el monto ingresado por el usuario
  allocationPreview = computed(() => {
    const amount = this.payAmount();
    if (amount <= 0) return [];
    let remaining = amount;
    const result: any[] = [];
    for (const inv of this.unpaidInvoices()) {
      if (remaining <= 0) break;
      const stillOwed = inv.price_total - (inv.abone ?? 0);
      const toPay     = Math.min(remaining, stillOwed);
      result.push({
        ...inv,
        toPay,
        fullCoverage: toPay >= stillOwed - 0.01,
        pct: Math.round((toPay / stillOwed) * 100),
      });
      remaining = Math.round((remaining - toPay) * 100) / 100;
    }
    return result;
  });

  ngOnInit(): void {
    const txRef = this.route.snapshot.queryParamMap.get('tx')
               ?? this.route.snapshot.queryParamMap.get('ref_payco')
               ?? this.route.snapshot.queryParamMap.get('x_ref_payco');
    if (txRef) {
      this.checkPaymentResult(txRef);
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
    // Auto-abrir modal de pago si viene con ?pay=1
    const autoPay = this.route.snapshot.queryParamMap.get('pay');
    this.load(autoPay === '1');
  }

  checkPaymentResult(ref: string): void {
    this.payResultLoading.set(true);
    this.payPollAttempt.set(0);
    this._pollOnce(ref, 0);
  }

  private _pollOnce(ref: string, attempt: number): void {
    this.api.getPaymentResult(ref).subscribe({
      next: (res) => {
        const status = res.data?.tx_status;
        // Si sigue pendiente y no agotamos intentos, volver a consultar
        if (status === 'pending' && attempt < this.POLL_MAX) {
          this.payPollAttempt.set(attempt + 1);
          setTimeout(() => this._pollOnce(ref, attempt + 1), this.POLL_INTERVAL);
        } else {
          this.payResultLoading.set(false);
          this.payPollAttempt.set(0);
          this.payResult.set(res.data ?? { tx_status: 'pending' });
          if (status === 'approved') setTimeout(() => this.load(), 1500);
        }
      },
      error: () => {
        this.payResultLoading.set(false);
        this.payPollAttempt.set(0);
        this.payResult.set({ tx_status: 'pending' });
      },
    });
  }

  load(autoOpenPay = false): void {
    this.loading.set(true);
    this.api.getInvoices().subscribe({
      next: (res) => {
        this.invoices.set(res.data?.invoices ?? []);
        this.summary.set(res.data?.summary ?? null);
        this.paymentAvailable.set(res.data?.payment_available ?? false);
        this.loading.set(false);
        if (autoOpenPay && res.data?.payment_available && this.unpaidInvoices().length > 0) {
          this.openPaySetup();
        }
      },
      error: () => { this.loading.set(false); },
    });
  }

  // ── Acciones de factura ───────────────────────────────────────────────────

  openPdf(invoice: any): void {
    this.pdfLoadingId.set(invoice.id);
    this.api.getInvoicePdfUrl(invoice.id).subscribe({
      next: (res) => {
        this.pdfLoadingId.set(null);
        if (res.data?.pdf_url) window.open(res.data.pdf_url, '_blank');
      },
      error: () => { this.pdfLoadingId.set(null); },
    });
  }

  sendWhatsapp(invoice: any): void {
    this.sendingId.set(invoice.id);
    this.sendResult.set(null);
    this.api.sendInvoiceWhatsapp(invoice.id).subscribe({
      next: () => {
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

  // ── Flujo de pago ─────────────────────────────────────────────────────────

  openPaySetup(): void {
    const total = this.totalDue();
    this.payAmount.set(total);
    this.payAmountStr.set(this.formatRaw(total));
    this.payAmountError.set(null);
    this.paySetupOpen.set(true);
    this.invoicesExpanded.set(this.unpaidInvoices().length > 1);
  }

  closePaySetup(): void {
    this.paySetupOpen.set(false);
    this.payAmountError.set(null);
  }

  onAmountInput(value: string): void {
    // Solo números
    const clean  = value.replace(/[^0-9]/g, '');
    const parsed = parseInt(clean, 10) || 0;
    this.payAmount.set(parsed);
    this.payAmountStr.set(clean);
    this.payAmountError.set(null);
  }

  setFullAmount(): void {
    const total = this.totalDue();
    this.payAmount.set(total);
    this.payAmountStr.set(this.formatRaw(total));
    this.payAmountError.set(null);
  }

  confirmPaySetup(): void {
    const amount = this.payAmount();
    const total  = this.totalDue();

    if (amount < 1000) {
      this.payAmountError.set('El monto mínimo es $1.000.');
      return;
    }
    if (amount > total + 1) {
      this.payAmountError.set('El monto no puede superar el total adeudado.');
      return;
    }

    const ids = this.unpaidInvoices().map(inv => inv.id);
    this.payInitiating.set(true);
    this.payAmountError.set(null);

    this.api.initiatePayment(amount, ids).subscribe({
      next: (res) => {
        this.payInitiating.set(false);
        this.paySetupOpen.set(false);
        this.payConfirm.set(res.data);
      },
      error: (err) => {
        this.payInitiating.set(false);
        this.payAmountError.set(err?.error?.message ?? 'Error al iniciar el pago. Intenta de nuevo.');
      },
    });
  }

  goToPay(): void {
    const url = this.payConfirm()?.payment_url;
    if (url) window.location.href = url;
  }

  closePayConfirm(): void {
    this.payConfirm.set(null);
  }

  closePayResult(): void {
    this.payResult.set(null);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  gatewayLabel(g: string): string {
    return { wompi: 'Wompi', epayco: 'ePayco', zonapago: 'ZonaPago' }[g] ?? g;
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }

  private formatRaw(v: number): string {
    return Math.round(v).toString();
  }
}
