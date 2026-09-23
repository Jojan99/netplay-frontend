import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentProofService } from '../../services/payment-proof.service';
import { ToastService } from '../../services/toast.service';
import { NpSelectComponent } from '../../common/np-select/np-select.component';
import { PRESENTACION_TEXTOS } from '../../common/np-select/presentaciones';

@Component({
  selector: 'app-payment-proof-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NpSelectComponent],
  templateUrl: './payment-proof-audit.component.html',
  styleUrl: './payment-proof-audit.component.scss',
  host: { class: 'np-console' },
})
export class PaymentProofAuditComponent implements OnInit {
  items: any[] = [];
  loading = false;
  statusFilter: string = 'pending';
  currentPage = 1;
  lastPage = 1;
  totalItems = 0;
  fromItem = 0;
  toItem = 0;
  previewingProofIds = new Set<number>();
  selectedFinanceItem: any = null;
  selectedItem: any = null;
  searchFilters = { client: '', amount: '', reference: '', bank: '' };
  readonly banks = ['Bancolombia', 'Nequi', 'Daviplata', 'Davivienda', 'Banco de Bogotá', 'BBVA'];
  readonly presBancos = PRESENTACION_TEXTOS;
  readonly filters = [
    { value: 'pending', label: 'Pendientes' }, { value: 'approved', label: 'Aprobados' },
    { value: 'suspicious', label: 'Sospechosos' }, { value: 'rejected', label: 'Rechazados' }, { value: 'reverted', label: 'Revertidos' }
  ];

  constructor(private paymentProofService: PaymentProofService, private toast: ToastService) {}

  ngOnInit(): void {
    this.load();
  }

  setFilter(status: string): void {
    this.statusFilter = status;
    this.currentPage = 1;
    this.load();
  }

  load(): void {
    this.loading = true;
    const payload = { ...(this.statusFilter ? { status: this.statusFilter } : {}), ...this.searchFilters, page: this.currentPage, per_page: 8 };

    this.paymentProofService.list(payload).subscribe({
      next: (res) => {
        this.items = res.data?.data || res.data || [];
        const pagination = res.data || {};
        this.currentPage = pagination.current_page || 1;
        this.lastPage = pagination.last_page || 1;
        this.totalItems = pagination.total || this.items.length;
        this.fromItem = pagination.from || 0;
        this.toItem = pagination.to || 0;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  search(): void { this.currentPage = 1; this.load(); }

  clearSearch(): void {
    this.searchFilters = { client: '', amount: '', reference: '', bank: '' };
    this.currentPage = 1;
    this.load();
  }

  changePage(page: number): void {
    if (page < 1 || page > this.lastPage || page === this.currentPage) return;
    this.currentPage = page;
    this.load();
  }

  openFinanceModal(item: any): void { this.selectedFinanceItem = item; }
  closeFinanceModal(): void { this.selectedFinanceItem = null; }

  financeQueryParams(item: any): any {
    return {
      cab_id: item.invoice?.cab_id,
      focus_invoice: item.invoice?.number_facture,
      user_id: item.user?.user_id,
      names: item.user?.names,
      lastname: item.user?.lastname,
      dni: item.user?.dni,
      phone: item.user?.phone,
    };
  }

  releyendo: number | null = null;

  /**
   * Volver a leer la imagen.
   *
   * Los comprobantes que entraron antes de que el servidor tuviera lector
   * quedaron sin monto; y una foto movida puede leerse mejor al segundo
   * intento.
   */
  releer(item: any): void {
    this.releyendo = item.id;
    this.paymentProofService.releer(item.id).subscribe({
      next: (r: any) => { this.releyendo = null; this.aviso(r?.message ?? 'Listo', r?.status === 'success'); this.load(); },
      error: (e: any) => { this.releyendo = null; this.aviso(e?.error?.message ?? 'No se pudo leer la imagen', false); },
    });
  }

  approve(item: any): void {
    const monto = item.reported_amount ?? item.detected_amount ?? null;

    // Sin monto no se puede aplicar nada a la factura: se pregunta antes de
    // mandar, en vez de que el servidor lo rechace y no se entienda por qué.
    // El monto leído de la imagen es una aproximación: una foto movida puede
    // dar «70.008» donde dice «70.000». Antes de mover plata se confirma, con
    // el valor leído puesto para que casi siempre alcance con aceptar.
    const sugerido = monto ? String(Math.round(Number(monto))) : '';
    const puesto = prompt(
      monto
        ? `¿De cuánto es el pago? Leímos ${sugerido} en la imagen; corregilo si hace falta.`
        : 'No pudimos leer el monto. Escribilo, por ejemplo 70000',
      sugerido,
    );

    const escrito = puesto ? Number(String(puesto).replace(/[^\d]/g, '')) : null;

    if (!escrito) { this.aviso('Hace falta el monto para aprobar.', false); return; }

    this.paymentProofService.approve(item.id, {
      reviewed_by: 1,
      reason: 'Aprobado por auditoría manual.',
      amount: escrito,
    }).subscribe({
      next: () => this.load(),
      error: (e: any) => this.aviso(e?.error?.message ?? 'No se pudo aprobar', false),
    });
  }

  private aviso(texto: string, ok: boolean): void {
    ok ? this.toast.success(texto) : this.toast.error(texto);
  }

  reject(item: any): void {
    this.paymentProofService.reject(item.id, { reviewed_by: 1, reason: 'Rechazado por inconsistencia con la factura.' }).subscribe(() => this.load());
  }

  markSuspicious(item: any): void {
    this.paymentProofService.suspicious(item.id, { reviewed_by: 1, reason: 'Monto o referencia sospechosa.' }).subscribe(() => this.load());
  }

  revert(item: any): void {
    this.paymentProofService.revert(item.id, { reviewed_by: 1, reason: 'Pago revertido por auditoría.' }).subscribe(() => this.load());
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value || 0);
  }

  formatAmount(value: number | null | undefined): string {
    return value === null || value === undefined ? 'No identificado' : this.formatCurrency(value);
  }

  isImage(filePath: string): boolean {
    return /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(filePath);
  }

  togglePreview(proofId: number): void {
    if (this.previewingProofIds.has(proofId)) {
      this.previewingProofIds.delete(proofId);
      return;
    }

    this.previewingProofIds.add(proofId);
  }

  isPreviewOpen(proofId: number): boolean {
    return this.previewingProofIds.has(proofId);
  }

  hasExtractedDetails(item: any): boolean {
    return Boolean(item.bank_name || item.raw_payload?.ocr_extraction);
  }

  statusLabel(status: string): string { return ({ pending: 'Pendiente', approved: 'Aprobado', suspicious: 'Sospechoso', rejected: 'Rechazado', reverted: 'Revertido' } as any)[status] || status; }
  initials(item: any): string { return `${item.user?.names?.[0] || 'C'}${item.user?.lastname?.[0] || ''}`.toUpperCase(); }
  formatDate(value: string | null | undefined): string { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`)) : 'No identificada'; }
  formatDateTime(value: string | null | undefined): string { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'sin fecha'; }
}
