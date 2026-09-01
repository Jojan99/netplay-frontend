import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentProofService } from '../../services/payment-proof.service';

@Component({
  selector: 'app-payment-proof-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="audit-shell">
      <header class="audit-header">
        <div>
          <span class="eyebrow">Operaciones / Recaudo</span>
          <h1>Auditoría de pagos</h1>
          <p>Revisa el comprobante, contrasta sus datos y decide antes de modificar una factura.</p>
        </div>
        <button type="button" class="refresh-button" (click)="load()">Actualizar</button>
      </header>

      <nav class="filters" aria-label="Estado de comprobantes">
        <button *ngFor="let filter of filters" type="button" [class.active]="statusFilter === filter.value" (click)="setFilter(filter.value)">
          {{ filter.label }}
        </button>
      </nav>

      <form class="search-panel" (ngSubmit)="search()">
        <label><span>Cliente o cédula</span><input name="client" [(ngModel)]="searchFilters.client" placeholder="Nombre o documento" /></label>
        <label><span>Monto</span><input name="amount" [(ngModel)]="searchFilters.amount" inputmode="numeric" placeholder="Ej. 18900" /></label>
        <label><span>Referencia</span><input name="reference" [(ngModel)]="searchFilters.reference" placeholder="Código del comprobante" /></label>
        <label><span>Entidad</span><select name="bank" [(ngModel)]="searchFilters.bank"><option value="">Todas las entidades</option><option *ngFor="let bank of banks" [value]="bank">{{ bank }}</option></select></label>
        <div class="search-actions"><button type="submit" class="search-button">Buscar</button><button type="button" class="clear-button" (click)="clearSearch()">Limpiar</button></div>
      </form>

      <section *ngIf="loading" class="state-panel">Cargando comprobantes...</section>
      <section *ngIf="!loading && items.length === 0" class="state-panel">No hay comprobantes en este estado.</section>

      <section *ngIf="!loading && items.length > 0" class="proof-list">
        <article *ngFor="let item of items" class="proof-card">
          <div class="proof-topline">
            <div class="customer-block">
              <span class="avatar">{{ initials(item) }}</span>
              <div><h2>{{ item.user?.names || 'Cliente' }} {{ item.user?.lastname || '' }}</h2><p>Documento: {{ item.user?.dni || 'No registrado' }} · Recibido {{ formatDateTime(item.created_at) }}</p></div>
            </div>
            <span class="status" [ngClass]="'status-' + item.status">{{ statusLabel(item.status) }}</span>
          </div>

          <div class="payment-grid">
            <div><span>Factura</span><button *ngIf="item.invoice?.number_facture; else noInvoice" type="button" class="invoice-link" (click)="openFinanceModal(item)">{{ item.invoice.number_facture }}</button><ng-template #noInvoice><strong>Sin factura</strong></ng-template></div>
            <div><span>Monto recibido</span><strong class="amount">{{ formatAmount(item.reported_amount ?? item.detected_amount) }}</strong></div>
            <div><span>Fecha del pago</span><strong>{{ formatDate(item.payment_date) }}</strong></div>
            <div><span>Referencia</span><strong>{{ item.reference_number || 'No identificada' }}</strong></div>
          </div>

          <div class="details-grid" *ngIf="hasExtractedDetails(item)">
            <div><span>Entidad</span>{{ item.bank_name || 'No identificada' }}</div>
            <div><span>Destinatario</span>{{ item.raw_payload?.ocr_extraction?.recipient || 'No identificado' }}</div>
            <div><span>Cuenta destino</span>{{ item.raw_payload?.ocr_extraction?.phone_destination || 'No identificada' }}</div>
            <div><span>Resultado</span>{{ item.raw_payload?.ocr_extraction?.transaction_status || 'Sin validar' }}</div>
          </div>

          <div class="card-footer">
            <button *ngIf="item.file_path && isImage(item.file_path)" type="button" class="evidence-button" (click)="togglePreview(item.id)">{{ isPreviewOpen(item.id) ? 'Ocultar evidencia' : 'Ver evidencia' }}</button>
            <a *ngIf="item.file_path && !isImage(item.file_path)" class="evidence-button" [href]="item.file_path" target="_blank" rel="noopener">Abrir archivo</a>
            <span *ngIf="!item.file_path" class="missing-evidence">Sin archivo adjunto</span>
            <div class="actions">
              <button *ngIf="item.status !== 'approved'" type="button" class="approve" (click)="approve(item)">Aprobar</button>
              <button *ngIf="item.status !== 'suspicious'" type="button" class="suspicious" (click)="markSuspicious(item)">Sospechoso</button>
              <button *ngIf="item.status !== 'rejected'" type="button" class="reject" (click)="reject(item)">Rechazar</button>
              <button *ngIf="item.status !== 'reverted'" type="button" class="revert" (click)="revert(item)">Revertir</button>
            </div>
          </div>
          <div *ngIf="isPreviewOpen(item.id) && isImage(item.file_path)" class="preview"><img [src]="item.file_path" alt="Comprobante de pago" /></div>
          <p *ngIf="item.rejection_reason" class="review-note">{{ item.rejection_reason }}</p>
        </article>
      </section>

      <footer *ngIf="!loading && totalItems > 0" class="pagination">
        <span>Mostrando {{ fromItem }}-{{ toItem }} de {{ totalItems }} comprobantes</span>
        <div>
          <button type="button" (click)="changePage(currentPage - 1)" [disabled]="currentPage === 1">Anterior</button>
          <strong>Página {{ currentPage }} de {{ lastPage }}</strong>
          <button type="button" (click)="changePage(currentPage + 1)" [disabled]="currentPage === lastPage">Siguiente</button>
        </div>
      </footer>

      <div *ngIf="selectedFinanceItem" class="modal-backdrop" (click)="closeFinanceModal()">
        <section class="finance-modal" role="dialog" aria-modal="true" aria-label="Detalle financiero de factura" (click)="$event.stopPropagation()">
          <header><div><span class="eyebrow">Factura</span><h2>#{{ selectedFinanceItem.invoice?.number_facture }}</h2></div><button type="button" class="modal-close" (click)="closeFinanceModal()">Cerrar</button></header>
          <div class="finance-summary"><div><span>Comprobante</span><strong>{{ formatAmount(selectedFinanceItem.reported_amount ?? selectedFinanceItem.detected_amount) }}</strong></div><div><span>Referencia</span><strong>{{ selectedFinanceItem.reference_number || 'No identificada' }}</strong></div><div><span>Estado</span><strong>{{ statusLabel(selectedFinanceItem.status) }}</strong></div></div>
          <a routerLink="/dashboard/finanzas" [queryParams]="financeQueryParams(selectedFinanceItem)" class="finance-link" (click)="closeFinanceModal()">Abrir facturas en Finanzas</a>
        </section>
      </div>
    </main>
  `,
  styles: [
    `:host { display: block; color: #172033; font-family: Georgia, 'Times New Roman', serif; }
     .audit-shell { min-height: 100%; padding: 32px; background: #f4f7f8; }
     .audit-header { display: flex; align-items: end; justify-content: space-between; gap: 24px; max-width: 1240px; margin: auto; padding-bottom: 24px; border-bottom: 1px solid #dce4e8; }
     .eyebrow, .payment-grid span, .details-grid span { color: #64748b; font: 700 11px/1.2 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0; text-transform: uppercase; }
     h1 { margin: 7px 0; font-size: 32px; line-height: 1; font-weight: 700; } .audit-header p { margin: 0; color: #526176; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
     button, .evidence-button { font: 600 13px/1 ui-sans-serif, system-ui, sans-serif; cursor: pointer; } .refresh-button { padding: 11px 15px; border: 0; border-radius: 6px; background: #172033; color: white; }
    .filters { display: flex; gap: 8px; overflow-x: auto; max-width: 1240px; margin: 18px auto 12px; } .filters button { white-space: nowrap; padding: 10px 13px; border: 1px solid #d4dee4; border-radius: 6px; background: transparent; color: #516074; } .filters button.active { border-color: #172033; background: #172033; color: white; } .filters span { margin-left: 7px; opacity: .7; }
    .search-panel { display: grid; grid-template-columns: 1.4fr repeat(3, 1fr) auto; gap: 10px; max-width: 1240px; margin: 0 auto 18px; padding: 14px; border: 1px solid #dce4e8; border-radius: 8px; background: white; } .search-panel label { display: grid; gap: 5px; color: #64748b; font: 700 10px/1 ui-sans-serif, system-ui, sans-serif; letter-spacing: 0; text-transform: uppercase; } .search-panel input, .search-panel select { min-width: 0; height: 37px; padding: 0 10px; border: 1px solid #cbd7de; border-radius: 5px; color: #263247; background: #fff; font: 13px ui-sans-serif, system-ui, sans-serif; outline: none; } .search-panel input:focus, .search-panel select:focus { border-color: #168c7b; box-shadow: 0 0 0 2px #d9f1eb; } .search-actions { display: flex; align-items: end; gap: 6px; } .search-button, .clear-button { height: 37px; padding: 0 12px; border-radius: 5px; } .search-button { border: 1px solid #172033; background: #172033; color: white; } .clear-button { border: 1px solid #cbd7de; background: white; color: #526176; }
    .proof-list, .state-panel, .pagination { max-width: 1240px; margin: auto; } .proof-list { display: grid; gap: 8px; } .state-panel { padding: 52px; border: 1px dashed #bfcbd2; color: #64748b; text-align: center; font: 14px ui-sans-serif, system-ui, sans-serif; }
    .proof-card { border: 1px solid #dce4e8; border-radius: 8px; background: white; overflow: hidden; } .proof-topline, .card-footer { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 12px 18px; } .proof-topline { border-bottom: 1px solid #e7edef; }
     .customer-block { display: flex; align-items: center; min-width: 0; gap: 12px; } .avatar { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; border-radius: 50%; background: #dcebe8; color: #155e59; font: 700 12px ui-sans-serif, system-ui, sans-serif; } h2 { overflow: hidden; margin: 0; color: #172033; font: 700 16px/1.2 ui-sans-serif, system-ui, sans-serif; text-overflow: ellipsis; white-space: nowrap; } .customer-block p { margin: 4px 0 0; color: #708093; font: 12px ui-sans-serif, system-ui, sans-serif; }
     .status { padding: 6px 9px; border-radius: 999px; font: 700 11px ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; } .status-pending { color: #9a6000; background: #fff2ce; } .status-approved { color: #0c6b52; background: #d8f2e8; } .status-suspicious { color: #a34300; background: #ffead8; } .status-rejected { color: #a92e37; background: #ffe1e4; } .status-reverted { color: #435264; background: #e8edf1; }
    .payment-grid { display: grid; grid-template-columns: 1fr 1.1fr .9fr 1fr; gap: 0; padding: 0 18px; } .payment-grid div { display: grid; gap: 5px; padding: 11px 12px 11px 0; } .payment-grid strong, .invoice-link { color: #263247; font: 600 14px ui-sans-serif, system-ui, sans-serif; } .invoice-link { width: fit-content; padding: 0; border: 0; border-bottom: 1px dashed #168c7b; background: transparent; color: #08705d; } .payment-grid .amount { color: #08705d; font-size: 15px; }
    .details-grid { display: flex; flex-wrap: wrap; gap: 0 22px; margin: 0 18px 10px; padding: 8px 10px; border-left: 3px solid #31a896; background: #f2f8f7; color: #405468; font: 12px/1.35 ui-sans-serif, system-ui, sans-serif; } .details-grid div { display: flex; gap: 5px; } .details-grid span { font-size: 10px; }
    .card-footer { border-top: 1px solid #e7edef; background: #fbfcfc; } .actions { display: flex; flex-wrap: wrap; justify-content: end; gap: 6px; } .actions button, .evidence-button { border-radius: 5px; padding: 7px 9px; border: 1px solid #ccd7de; background: white; color: #344256; text-decoration: none; } .approve { border-color: #0d8066 !important; background: #0d8066 !important; color: white !important; } .suspicious { color: #9a6000 !important; } .reject { color: #b32936 !important; } .revert { color: #526176 !important; } .missing-evidence { color: #a35c00; font: 12px ui-sans-serif, system-ui, sans-serif; } .preview { padding: 0 18px 16px; background: #fbfcfc; } .preview img { display: block; max-width: min(100%, 430px); max-height: 560px; border: 1px solid #d8e0e4; border-radius: 6px; } .review-note { margin: 0 18px 12px; padding: 8px 10px; border-left: 3px solid #d45353; background: #fff4f4; color: #942d36; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; } .pagination { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 18px; color: #64748b; font: 12px ui-sans-serif, system-ui, sans-serif; } .pagination div { display: flex; align-items: center; gap: 8px; } .pagination button { padding: 8px 10px; border: 1px solid #ccd7de; border-radius: 5px; background: white; color: #344256; } .pagination button:disabled { cursor: not-allowed; opacity: .45; } .pagination strong { color: #344256; font: 600 12px ui-sans-serif, system-ui, sans-serif; } .modal-backdrop { position: fixed; z-index: 50; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(23 32 51 / .38); } .finance-modal { width: min(100%, 480px); border: 1px solid #d5e1e6; border-radius: 8px; background: white; box-shadow: 0 22px 60px rgb(23 32 51 / .24); } .finance-modal header { display: flex; align-items: start; justify-content: space-between; padding: 20px; border-bottom: 1px solid #e5edf0; } .finance-modal h2 { margin: 5px 0 0; font-size: 22px; } .modal-close { padding: 7px 9px; border: 1px solid #ccd7de; border-radius: 5px; background: white; color: #526176; } .finance-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 20px; } .finance-summary div { display: grid; gap: 5px; } .finance-summary span { color: #64748b; font: 700 10px ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; } .finance-summary strong { color: #263247; font: 600 13px ui-sans-serif, system-ui, sans-serif; } .finance-link { display: block; margin: 0 20px 20px; padding: 11px; border-radius: 5px; background: #172033; color: white; text-align: center; text-decoration: none; font: 600 13px ui-sans-serif, system-ui, sans-serif; }
      @media (max-width: 960px) { .search-panel { grid-template-columns: repeat(2, 1fr); } } @media (max-width: 760px) { .audit-shell { padding: 18px; } .audit-header, .proof-topline, .card-footer, .pagination { align-items: flex-start; flex-direction: column; } .payment-grid, .search-panel { grid-template-columns: repeat(2, 1fr); } .payment-grid div { padding: 11px 8px 11px 0; } .actions { justify-content: flex-start; } .search-actions { grid-column: 1 / -1; } }`
  ]
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
  searchFilters = { client: '', amount: '', reference: '', bank: '' };
  readonly banks = ['Bancolombia', 'Nequi', 'Daviplata', 'Davivienda', 'Banco de Bogotá', 'BBVA'];
  readonly filters = [
    { value: 'pending', label: 'Pendientes' }, { value: 'approved', label: 'Aprobados' },
    { value: 'suspicious', label: 'Sospechosos' }, { value: 'rejected', label: 'Rechazados' }, { value: 'reverted', label: 'Revertidos' }
  ];

  constructor(private paymentProofService: PaymentProofService) {}

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

  approve(item: any): void {
    this.paymentProofService.approve(item.id, { reviewed_by: 1, reason: 'Aprobado por auditoría manual.' }).subscribe(() => this.load());
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
