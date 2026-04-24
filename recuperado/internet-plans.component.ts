import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InternetPlanService } from '../../services/internet-plan.service';

@Component({
  selector: 'app-internet-plans',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './internet-plans.component.html',
})
export class InternetPlansComponent implements OnInit {

  plans: any[]   = [];
  isLoading      = false;
  successMsg     = '';
  errorMsg       = '';

  // Modal
  showModal  = false;
  isEditing  = false;
  isSaving   = false;
  form       = this.emptyForm();

  // Delete confirm
  deleteId: number | null = null;
  isDeleting = false;
  deleteError = '';

  readonly TYPES = [
    { value: 'fibra',    label: 'Fibra óptica' },
    { value: 'wireless', label: 'Wireless / Radio' },
    { value: 'cable',    label: 'Cable coaxial' },
    { value: 'dsl',      label: 'DSL / ADSL' },
    { value: 'otro',     label: 'Otro' },
  ];

  constructor(private svc: InternetPlanService) {}

  ngOnInit(): void { this.load(); }

  private emptyForm() {
    return {
      id: 0,
      plan_name: '',
      download_speed: '',
      upload_speed: '',
      monthly_price: '',
      description: '',
      type: 'fibra',
      active: true,
    };
  }

  load(): void {
    this.isLoading = true;
    this.svc.getAll().subscribe({
      next: r => { this.isLoading = false; this.plans = r.data ?? []; },
      error: () => { this.isLoading = false; },
    });
  }

  openCreate(): void {
    this.isEditing = false;
    this.form      = this.emptyForm();
    this.errorMsg  = '';
    this.showModal = true;
  }

  openEdit(p: any): void {
    this.isEditing = true;
    this.form = {
      id: p.id,
      plan_name: p.plan_name,
      download_speed: p.download_speed,
      upload_speed: p.upload_speed,
      monthly_price: p.monthly_price,
      description: p.description ?? '',
      type: p.type ?? 'fibra',
      active: p.active ?? true,
    };
    this.errorMsg  = '';
    this.showModal = true;
  }

  save(): void {
    this.isSaving = true;
    const obs = this.isEditing
      ? this.svc.update(this.form.id, this.form)
      : this.svc.create(this.form);

    obs.subscribe({
      next: r => {
        this.isSaving = false;
        if (r.status === 0) {
          this.showModal = false;
          this.toast(r.message);
          this.load();
        } else {
          this.errorMsg = r.message;
        }
      },
      error: () => { this.isSaving = false; this.errorMsg = 'Error al guardar.'; },
    });
  }

  toggle(p: any): void {
    this.svc.toggle(p.id).subscribe({
      next: r => { if (r.status === 0) { this.toast(r.message); this.load(); } },
    });
  }

  confirmDelete(id: number): void {
    this.deleteId    = id;
    this.deleteError = '';
  }

  cancelDelete(): void { this.deleteId = null; this.deleteError = ''; }

  deletePlan(): void {
    if (!this.deleteId) return;
    this.isDeleting  = true;
    this.deleteError = '';
    this.svc.delete(this.deleteId).subscribe({
      next: r => {
        this.isDeleting = false;
        if (r.status === 0) {
          this.deleteId = null;
          this.toast(r.message);
          this.load();
        } else {
          this.deleteError = r.message;
        }
      },
      error: () => { this.isDeleting = false; this.deleteError = 'Error al eliminar.'; },
    });
  }

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  typeLabel(type: string): string {
    return this.TYPES.find(t => t.value === type)?.label ?? type;
  }

  typeClass(type: string): string {
    return ({
      fibra:    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      wireless: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
      cable:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      dsl:      'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
      otro:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
    } as any)[type] ?? 'bg-gray-100 text-gray-600';
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(price);
  }

  get activePlans(): number  { return this.plans.filter(p => p.active).length; }
  get totalClients(): number { return this.plans.reduce((s, p) => s + (p.clients_count || 0), 0); }
  get avgPrice(): number {
    const active = this.plans.filter(p => p.active);
    if (!active.length) return 0;
    return active.reduce((s, p) => s + parseFloat(p.monthly_price), 0) / active.length;
  }
}
