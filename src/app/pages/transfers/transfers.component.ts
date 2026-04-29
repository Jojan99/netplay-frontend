import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TransferService, TransferOrder } from '../../services/transfer.service';

@Component({
  selector: 'app-transfers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './transfers.component.html',
})
export class TransfersComponent implements OnInit {
  transfers: TransferOrder[] = [];
  isLoading = false;
  successMsg = '';
  errorMsg = '';

  totalPages = 0;
  currentPage = 1;

  statusFilter = '';
  paymentStatusFilter = '';
  dateFrom = '';
  dateTo = '';

  showDetail = false;
  selected: TransferOrder | null = null;

  showAssignModal = false;
  assignForm = { technician_1_id: '', technician_2_id: '', commission_amount: '' };

  technicians: any[] = [];
  routers: any[] = [];

  readonly STATUS_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'confirmed', label: 'Confirmado' },
    { value: 'in_progress', label: 'En proceso' },
    { value: 'completed', label: 'Completado' },
    { value: 'cancelled', label: 'Cancelado' },
  ];

  readonly PAYMENT_STATUS_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'not_required', label: 'No requiere' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'paid', label: 'Pagado' },
    { value: 'verified', label: 'Verificado' },
    { value: 'rejected', label: 'Rechazado' },
  ];

  constructor(private svc: TransferService) {}

  ngOnInit(): void {
    this.load();
    this.loadOptions();
  }

  loadOptions(): void {
    this.svc.getTechnicians().subscribe(r => this.technicians = r.data || []);
    this.svc.getRouters().subscribe(r => this.routers = r.data || []);
  }

  load(): void {
    this.isLoading = true;
    const filter: any = { page: this.currentPage, per_page: 20 };
    if (this.statusFilter) filter.status = this.statusFilter;
    if (this.paymentStatusFilter) filter.payment_status = this.paymentStatusFilter;
    if (this.dateFrom) filter.date_from = this.dateFrom;
    if (this.dateTo) filter.date_to = this.dateTo;

    this.svc.getAll(filter).subscribe({
      next: r => {
        this.isLoading = false;
        this.transfers = r.data?.data || [];
        this.totalPages = r.data?.last_page || 1;
      },
      error: () => { this.isLoading = false; },
    });
  }

  filter(): void {
    this.currentPage = 1;
    this.load();
  }

  clearFilters(): void {
    this.statusFilter = '';
    this.paymentStatusFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.currentPage = 1;
    this.load();
  }

  prevPage(): void {
    if (this.currentPage > 1) { this.currentPage--; this.load(); }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) { this.currentPage++; this.load(); }
  }

  openDetail(t: TransferOrder): void {
    this.selected = t;
    this.showDetail = true;
  }

  closeDetail(): void {
    this.showDetail = false;
    this.selected = null;
  }

  confirm(id: number): void {
    this.svc.confirm(id).subscribe({ next: r => { this.toast(r.message); this.load(); } });
  }

  start(id: number): void {
    this.svc.start(id).subscribe({ next: r => { this.toast(r.message); this.load(); } });
  }

  complete(id: number): void {
    const t = this.transfers.find(x => x.id === id);
    const newIp = prompt('Nueva IP (opcional):', t?.new_ip || '');
    const notes = prompt('Notas técnicas (opcional):');
    const updateClient = confirm('¿Actualizar datos del cliente con la nueva dirección?');

    this.svc.complete(id, { 
      new_ip: newIp || undefined, 
      technical_notes: notes || undefined,
      update_client_address: updateClient
    }).subscribe({ next: r => { this.toast(r.message); this.load(); } });
  }

  cancel(id: number): void {
    if (confirm('¿Cancelar este traslado?')) {
      this.svc.cancel(id).subscribe({ next: r => { this.toast(r.message); this.load(); } });
    }
  }

  openAssign(id: number): void {
    const t = this.transfers.find(x => x.id === id);
    if (!t) return;
    this.selected = t;
    this.assignForm = {
      technician_1_id: t.technician_1_id?.toString() || '',
      technician_2_id: t.technician_2_id?.toString() || '',
      commission_amount: t.commission_amount?.toString() || t.transfer_cost?.toString() || '',
    };
    this.showAssignModal = true;
  }

  saveAssign(): void {
    if (!this.selected?.id) return;
    this.svc.assignTechnicians(this.selected.id, {
      technician_1_id: this.assignForm.technician_1_id ? parseInt(this.assignForm.technician_1_id) : undefined,
      technician_2_id: this.assignForm.technician_2_id ? parseInt(this.assignForm.technician_2_id) : undefined,
      commission_amount: this.assignForm.commission_amount ? parseFloat(this.assignForm.commission_amount) : undefined,
    }).subscribe({
      next: r => { this.toast(r.message); this.showAssignModal = false; this.load(); },
    });
  }

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  statusLabel(s: string): string {
    return this.STATUS_OPTIONS.find(o => o.value === s)?.label || s;
  }

  statusClass(s: string): string {
    const m: any = {
      pending: 'bg-yellow-100 text-yellow-700',
      confirmed: 'bg-blue-100 text-blue-700',
      in_progress: 'bg-purple-100 text-purple-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700',
    };
    return m[s] || 'bg-gray-100 text-gray-700';
  }

  formatPrice(p: number): string {
    if (!p) return '-';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p);
  }

  formatDate(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('es-CO');
  }

  get totalPending(): number { return this.transfers.filter(t => t.status === 'pending').length; }
  get totalInProgress(): number { return this.transfers.filter(t => t.status === 'in_progress').length; }
  get totalCompleted(): number { return this.transfers.filter(t => t.status === 'completed').length; }
}