import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { InstallationService, InstallationOrder, InstallationLog } from '../../services/installation.service';

@Component({
  selector: 'app-installations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './installations.component.html',
})
export class InstallationsComponent implements OnInit {
  installations: InstallationOrder[] = [];
  allInstallations: InstallationOrder[] = [];
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
  selected: InstallationOrder | null = null;

  showPaymentModal = false;
  paymentForm = { payment_status: 'pending', payment_amount: '', payment_reference: '', payment_method_id: '' };

  showAssignModal = false;
  assignForm = { technician_1_id: '', technician_2_id: '', commission_amount: '' };

  showCompleteModal = false;
  completeNotes = '';

  actionLoading: { [id: number]: string } = {};

  showCancelModal = false;
  cancelReason = '';

  technicians: any[] = [];
  paymentMethods: any[] = [];

  logs: InstallationLog[] = [];
  loadingLogs = false;

  showTechModal = false;
  selectedTech: any = null;
  techInstallations: any[] = [];

  openTechDetail(tech: any): void {
    this.selectedTech = tech;
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    this.techInstallations = all.filter(i => {
      const isCompleted = i.status === 'completed' || i.payment_status === 'verified';
      const hasTech = [i.technician1, i.technician2].some(t => t?.id === parseInt(tech.id) || t?.id === tech.id);
      return isCompleted && hasTech;
    }).map(i => ({
      ...i,
      techCommission: this.getNumValue(i.commission_amount) / ([i.technician1?.id, i.technician2?.id].filter(Boolean).length || 1)
    }));
    this.showTechModal = true;
  }

  closeTechModal(): void {
    this.showTechModal = false;
    this.selectedTech = null;
    this.techInstallations = [];
  }

  readonly STATUS_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'confirmed', label: 'Confirmada' },
    { value: 'in_progress', label: 'En proceso' },
    { value: 'completed', label: 'Completada' },
    { value: 'cancelled', label: 'Cancelada' },
  ];

  readonly PAYMENT_STATUS_OPTIONS = [
    { value: '', label: 'Todos' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'paid', label: 'Pagado' },
    { value: 'verified', label: 'Verificado' },
    { value: 'rejected', label: 'Rechazado' },
  ];

  constructor(private svc: InstallationService) {}

  ngOnInit(): void {
    this.loadAllForSummary();
    this.load();
    this.loadOptions();
  }

  loadAllForSummary(): void {
    this.svc.getAll({ per_page: 500 }).subscribe({
      next: (r: any) => {
        this.allInstallations = r.data || r || [];
      }
    });
  }

  loadOptions(): void {
    this.svc.getTechnicians().subscribe(r => this.technicians = r?.data || r || []);
    this.svc.getPaymentMethods().subscribe(r => this.paymentMethods = r?.data || r || []);
  }

  load(): void {
    this.isLoading = true;
    const filter: any = { page: this.currentPage, per_page: 20 };
    if (this.statusFilter) filter.status = this.statusFilter;
    if (this.paymentStatusFilter) filter.payment_status = this.paymentStatusFilter;
    if (this.dateFrom) filter.date_from = this.dateFrom;
    if (this.dateTo) filter.date_to = this.dateTo;

    this.svc.getAll(filter).subscribe({
      next: (r: any) => {
        this.isLoading = false;
        if (Array.isArray(r)) {
          this.installations = r;
        } else if (Array.isArray(r.data)) {
          this.installations = r.data;
        } else {
          this.installations = [];
        }
        this.totalPages = r.last_page || r.lastPage || 1;
        this.currentPage = r.current_page || r.currentPage || 1;
        
        if (!this.statusFilter && !this.paymentStatusFilter && !this.dateFrom && !this.dateTo) {
          this.allInstallations = this.installations;
        }
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

  openDetail(i: InstallationOrder): void {
    this.selected = i;
    this.showDetail = true;
    this.loadLogs(i.id!);
  }

  loadLogs(id: number): void {
    this.loadingLogs = true;
    this.logs = [];
    this.svc.getLogs(id).subscribe({
      next: (r: any) => {
        this.logs = r.data || r || [];
      },
      complete: () => { this.loadingLogs = false; }
    });
  }

  closeDetail(): void {
    this.showDetail = false;
    this.selected = null;
    this.logs = [];
  }

  confirm(id: number): void {
    this.actionLoading[id] = 'confirm';
    this.svc.confirm(id).subscribe({
      next: r => {
        this.svc.createLog(id, { action: 'confirm', description: 'Instalación confirmada' }).subscribe();
        this.toast(r.message);
        this.load();
      },
      complete: () => { delete this.actionLoading[id]; }
    });
  }

  start(id: number): void {
    this.actionLoading[id] = 'start';
    this.svc.start(id).subscribe({
      next: r => {
        this.svc.createLog(id, { action: 'start', description: 'Técnicos iniciaron la instalación' }).subscribe();
        this.toast(r.message);
        this.load();
        this.loadAllForSummary();
      },
      complete: () => { delete this.actionLoading[id]; }
    });
  }

  openComplete(id: number): void {
    const inst = this.installations.find(i => i.id === id);
    if (!inst) return;
    this.selected = inst;
    this.completeNotes = inst.technical_notes || '';
    this.showCompleteModal = true;
  }

  saveComplete(): void {
    if (!this.selected?.id) return;
    const instId = this.selected.id;
    const notes = this.completeNotes;
    this.svc.complete(instId, notes || undefined).subscribe({
      next: r => {
        this.svc.createLog(instId, { action: 'complete', description: 'Instalación completada', notes }).subscribe();
        this.toast(r.message);
        this.showCompleteModal = false;
        this.load();
        this.loadAllForSummary();
      },
    });
  }

  closeCompleteModal(): void {
    this.showCompleteModal = false;
    this.completeNotes = '';
    this.selected = null;
  }

  openCancel(id: number): void {
    const inst = this.installations.find(i => i.id === id);
    if (!inst) return;
    this.selected = inst;
    this.cancelReason = '';
    this.showCancelModal = true;
  }

  saveCancel(): void {
    if (!this.selected?.id) return;
    const instId = this.selected.id;
    const reason = this.cancelReason;
    this.svc.cancel(instId, reason || undefined).subscribe({
      next: r => {
        this.svc.createLog(instId, { action: 'cancel', description: 'Instalación cancelada', notes: reason }).subscribe();
        this.toast(r.message);
        this.showCancelModal = false;
        this.load();
        this.loadAllForSummary();
      },
    });
  }

  closeCancelModal(): void {
    this.showCancelModal = false;
    this.cancelReason = '';
    this.selected = null;
  }

  /* cancel(id: number): void {
    if (confirm('¿Cancelar esta instalación?')) {
      this.svc.cancel(id).subscribe({ next: r => { this.toast(r.message); this.load(); } });
    }
  } */

  openPayment(id: number): void {
    const inst = this.installations.find(i => i.id === id);
    if (!inst) return;
    this.selected = inst;
    const cost = inst.installation_cost ? inst.installation_cost.toString() : '';
    this.paymentForm = {
      payment_status: inst.payment_status || 'pending',
      payment_amount: inst.payment_amount ? inst.payment_amount.toString() : cost,
      payment_reference: inst.payment_reference || '',
      payment_method_id: inst.payment_method_id?.toString() || '',
    };
    this.showPaymentModal = true;
  }

  savePayment(): void {
    if (!this.selected?.id) return;
    this.actionLoading[this.selected.id] = 'payment';
    const instId = this.selected.id;
    const paymentData = this.paymentForm;
    this.svc.updatePayment(this.selected.id, {
      payment_status: this.paymentForm.payment_status,
      payment_amount: this.paymentForm.payment_amount ? parseFloat(this.paymentForm.payment_amount) : undefined,
      payment_reference: this.paymentForm.payment_reference || undefined,
      payment_method_id: this.paymentForm.payment_method_id ? parseInt(this.paymentForm.payment_method_id) : undefined,
    }).subscribe({
      next: r => {
        this.svc.createLog(instId, { 
          action: 'payment_' + paymentData.payment_status, 
          description: `Pago actualizado a ${paymentData.payment_status}`,
          notes: paymentData.payment_reference ? `Ref: ${paymentData.payment_reference}` : undefined 
        }).subscribe();
        this.toast(r.message);
        this.showPaymentModal = false;
        this.load();
        this.loadAllForSummary();
      },
      complete: () => { delete this.actionLoading[instId]; }
    });
  }

  openAssign(id: number): void {
    const inst = this.installations.find(i => i.id === id);
    if (!inst) return;
    this.selected = inst;
    this.assignForm = {
      technician_1_id: inst.technician_1_id?.toString() || '',
      technician_2_id: inst.technician_2_id?.toString() || '',
      commission_amount: inst.commission_amount?.toString() || inst.installation_cost?.toString() || '',
    };
    this.showAssignModal = true;
  }

  saveAssign(): void {
    if (!this.selected?.id) return;
    this.actionLoading[this.selected.id] = 'assign';
    const instId = this.selected.id;
    const assignData = this.assignForm;
    this.svc.assignTechnicians(this.selected.id, {
      technician_1_id: this.assignForm.technician_1_id ? parseInt(this.assignForm.technician_1_id) : undefined,
      technician_2_id: this.assignForm.technician_2_id ? parseInt(this.assignForm.technician_2_id) : undefined,
      commission_amount: this.assignForm.commission_amount ? parseFloat(this.assignForm.commission_amount) : undefined,
    }).subscribe({
      next: r => {
        this.svc.createLog(instId, { 
          action: 'assign', 
          description: 'Técnicos asignados',
          notes: assignData.commission_amount ? `Comisión: ${assignData.commission_amount}` : undefined 
        }).subscribe();
        this.toast(r.message);
        this.showAssignModal = false;
        this.load();
        this.loadAllForSummary();
      },
      complete: () => { delete this.actionLoading[instId]; }
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

  paymentClass(s: string): string {
    const m: any = {
      pending: 'bg-yellow-100 text-yellow-700',
      paid: 'bg-blue-100 text-blue-700',
      verified: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return m[s] || 'bg-gray-100 text-gray-700';
  }

  formatPrice(p: number | null | undefined): string {
    if (!p && p !== 0) return '-';
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(p);
  }

  formatDate(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('es-CO');
  }

  formatDateTime(d: string): string {
    if (!d) return '-';
    return new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  }

  getTechniciansList(i: any): string {
    const names: string[] = [];
    if (i.technicians_list && i.technicians_list.length) {
      i.technicians_list.forEach((t: any) => names.push(`${t.first_name} ${t.last_name}`));
    }
    if (i.technician1) names.push(`${i.technician1.first_name} ${i.technician1.last_name}`);
    if (i.technician2) names.push(`${i.technician2.first_name} ${i.technician2.last_name}`);
    return names.length ? names.join(', ') : 'Sin asignar';
  }

  getPaymentMethodName(i: any): string {
    return i.paymentMethod?.name || '-';
  }

  get totalPending(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.filter(i => i.status === 'pending').length; 
  }
  get totalInProgress(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.filter(i => i.status === 'in_progress').length; 
  }
get totalCompleted(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.filter(i => i.status === 'completed' || i.payment_status === 'verified').length; 
  }

  get totalValue(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.reduce((sum, i) => sum + this.getNumValue(i.installation_cost), 0);
  }
  get totalCommission(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.reduce((sum, i) => sum + this.getNumValue(i.commission_amount), 0);
  }
  get completedValue(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.filter(i => this.isCompletedStatus(i)).reduce((sum, i) => sum + this.getNumValue(i.installation_cost), 0);
  }
  get completedCommission(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.filter(i => this.isCompletedStatus(i)).reduce((sum, i) => sum + this.getNumValue(i.commission_amount), 0);
  }

  get pendingValue(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.filter(i => i.status === 'pending').reduce((sum, i) => sum + this.getNumValue(i.installation_cost), 0);
  }
  get inProgressValue(): number { 
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    return all.filter(i => i.status === 'in_progress').reduce((sum, i) => sum + this.getNumValue(i.installation_cost), 0);
  }

  isCompletedStatus(i: any): boolean {
    return i.status === 'completed' || i.payment_status === 'verified';
  }

  getNumValue(val: number | string | null | undefined): number {
    if (!val && val !== 0) return 0;
    return typeof val === 'number' ? val : parseFloat(String(val)) || 0;
  }

  get techniciansSummary(): any[] {
    const all = this.allInstallations.length > 0 ? this.allInstallations : this.installations;
    const summary: { [id: number]: { id: string; name: string; count: number; commission: number } } = {};
    all.filter(i => this.isCompletedStatus(i)).forEach(i => {
      const techs: any[] = i.technician_ids || [];
      if (techs.length > 0) {
        const commissionPerTech = this.getNumValue(i.commission_amount) / techs.length;
        techs.forEach((t: any) => {
          if (!summary[t.id]) {
            summary[t.id] = { id: t.id.toString(), name: `${t.first_name} ${t.last_name}`, count: 0, commission: 0 };
          }
          summary[t.id].count++;
          summary[t.id].commission += commissionPerTech;
        });
      }
    });
    return Object.values(summary).sort((a, b) => b.commission - a.commission);
  }
}