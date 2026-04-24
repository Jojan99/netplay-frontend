import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';

type Tab = 'profile' | 'contract' | 'affiliations' | 'bank' | 'equipment' | 'disciplinary' | 'payroll';

@Component({
  selector: 'app-employees',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employees.component.html',
})
export class EmployeesComponent implements OnInit {

  // ── Lista ─────────────────────────────────────────────────────────────────
  employees: any[]  = [];
  isLoading         = false;
  search            = '';

  // ── Detalle ───────────────────────────────────────────────────────────────
  selected: any     = null;
  activeTab: Tab    = 'profile';
  isSaving          = false;
  successMsg        = '';
  errorMsg          = '';

  // ── Modal empleado ────────────────────────────────────────────────────────
  showModal      = false;
  isEditing      = false;
  empForm        = this.emptyEmpForm();
  availableStaff: any[] = [];
  selectedStaffId: number | null = null;

  // ── Confirm delete empleado ───────────────────────────────────────────────
  deleteEmpId: number | null = null;
  isDeleting  = false;

  // ── Formularios sub-recursos ──────────────────────────────────────────────
  contractForm     = { type: 'indefinido', duration_months: '', salary: '', start_date: '', end_date: '' };
  affiliationForm  = { arl: '', eps: '', pension_fund: '', compensation_fund: '' };
  bankForm         = { bank_name: '', account_type: 'ahorros', account_number: '' };

  // Equipment
  equipment: any[]      = [];
  eqForm                = { id: 0, name: '', description: '', serial: '', condition: 'bueno', assigned_at: '', returned_at: '' };
  showEqModal           = false;
  isEditingEq           = false;
  deleteEqId: number | null = null;

  // Disciplinary
  disciplinary: any[]   = [];
  discForm              = { id: 0, incident_date: '', reason: '', description: '', resolution: '' };
  showDiscModal         = false;
  isEditingDisc         = false;
  deleteDiscId: number | null = null;

  // Payroll
  payrolls: any[]       = [];
  payForm               = { id: 0, period: '', base_salary: '', bonuses: '', deductions: '', total_paid: '', payment_date: '', payment_method: 'transferencia', notes: '' };
  showPayModal          = false;
  isEditingPay          = false;
  deletePayId: number | null = null;

  constructor(private empService: EmployeeService) {}

  ngOnInit(): void { this.loadEmployees(); }

  private emptyEmpForm() {
    return { id: 0, first_name: '', last_name: '', dni: '', email: '', phone: '', address: '', job_title: '', start_date: '', birthday: '', active: true };
  }

  // ── Lista empleados ───────────────────────────────────────────────────────

  loadEmployees(): void {
    this.isLoading = true;
    this.empService.getAll(this.search ? { search: this.search } : {}).subscribe({
      next: r => { this.employees = r.data ?? []; this.isLoading = false; },
      error: () => { this.isLoading = false; },
    });
  }

  openCreate(): void {
    this.isEditing       = false;
    this.empForm         = this.emptyEmpForm();
    this.selectedStaffId = null;
    this.errorMsg        = '';
    this.empService.getAvailableStaff().subscribe({
      next: r => { this.availableStaff = r.data ?? []; },
      error: () => { this.availableStaff = []; },
    });
    this.showModal = true;
  }

  onStaffSelected(): void {
    if (!this.selectedStaffId) {
      this.empForm = this.emptyEmpForm();
      return;
    }
    const s = this.availableStaff.find((x: any) => x.id === Number(this.selectedStaffId));
    if (!s) return;
    const nameParts = (s.names ?? '').trim().split(' ');
    this.empForm.first_name = nameParts[0] ?? '';
    this.empForm.last_name  = (s.lastname ?? '').trim() || nameParts.slice(1).join(' ');
    this.empForm.email      = s.email  ?? '';
    this.empForm.phone      = s.phone  ?? '';
    this.empForm.dni        = s.dni    ?? '';
    this.empForm.job_title  = s.profile ?? '';
  }

  openEdit(e: any): void {
    this.isEditing = true;
    this.empForm   = { id: e.id, first_name: e.first_name, last_name: e.last_name, dni: e.dni, email: e.email ?? '', phone: e.phone ?? '', address: e.address ?? '', job_title: e.job_title ?? '', start_date: e.start_date ?? '', birthday: e.birthday ?? '', active: e.active };
    this.errorMsg  = '';
    this.showModal = true;
  }

  saveEmployee(): void {
    this.isSaving = true;
    const payload: any = { ...this.empForm };
    if (!this.isEditing && this.selectedStaffId) {
      payload.user_id = Number(this.selectedStaffId);
    }
    const obs = this.isEditing
      ? this.empService.update(this.empForm.id, payload)
      : this.empService.create(payload);
    obs.subscribe({
      next: r => {
        this.isSaving = false;
        if (r.status === 0) { this.showModal = false; this.toast(r.message); this.loadEmployees(); }
        else { this.errorMsg = r.message; }
      },
      error: () => { this.isSaving = false; this.errorMsg = 'Error al guardar.'; },
    });
  }

  confirmDeleteEmp(id: number): void { this.deleteEmpId = id; }
  cancelDeleteEmp(): void            { this.deleteEmpId = null; }

  deleteEmployee(): void {
    if (!this.deleteEmpId) return;
    this.isDeleting = true;
    this.empService.delete(this.deleteEmpId).subscribe({
      next: () => { this.isDeleting = false; this.deleteEmpId = null; this.toast('Empleado eliminado.'); if (this.selected?.id === this.deleteEmpId) this.selected = null; this.loadEmployees(); },
      error: () => { this.isDeleting = false; },
    });
  }

  // ── Selección / Detalle ───────────────────────────────────────────────────

  selectEmployee(e: any): void {
    this.isLoading = true;
    this.empService.getById(e.id).subscribe({
      next: r => {
        this.isLoading = false;
        this.selected  = r.data;
        this.activeTab = 'profile';
        this.syncForms();
      },
      error: () => { this.isLoading = false; },
    });
  }

  private syncForms(): void {
    const e = this.selected;
    if (!e) return;
    const lc = e.labor_contract ?? {};
    this.contractForm = { type: lc.type ?? 'indefinido', duration_months: lc.duration_months ?? '', salary: lc.salary ?? '', start_date: lc.start_date ?? '', end_date: lc.end_date ?? '' };
    const af = e.affiliation ?? {};
    this.affiliationForm = { arl: af.arl ?? '', eps: af.eps ?? '', pension_fund: af.pension_fund ?? '', compensation_fund: af.compensation_fund ?? '' };
    const bk = e.bank_account ?? {};
    this.bankForm = { bank_name: bk.bank_name ?? '', account_type: bk.account_type ?? 'ahorros', account_number: bk.account_number ?? '' };
    this.equipment   = e.equipment ?? [];
    this.disciplinary = e.disciplinary ?? [];
    this.payrolls    = e.payrolls ?? [];
  }

  setTab(tab: Tab): void { this.activeTab = tab; }

  closeDetail(): void { this.selected = null; }

  // ── Contrato laboral ──────────────────────────────────────────────────────

  saveContract(): void {
    this.isSaving = true;
    this.empService.upsertLaborContract(this.selected.id, this.contractForm).subscribe({
      next: r => { this.isSaving = false; if (r.status === 0) { this.toast(r.message); this.selected.labor_contract = r.data; } else { this.errorMsg = r.message; } },
      error: () => { this.isSaving = false; },
    });
  }

  // ── Afiliaciones ──────────────────────────────────────────────────────────

  saveAffiliation(): void {
    this.isSaving = true;
    this.empService.upsertAffiliation(this.selected.id, this.affiliationForm).subscribe({
      next: r => { this.isSaving = false; if (r.status === 0) { this.toast(r.message); this.selected.affiliation = r.data; } else { this.errorMsg = r.message; } },
      error: () => { this.isSaving = false; },
    });
  }

  // ── Cuenta bancaria ───────────────────────────────────────────────────────

  saveBankAccount(): void {
    this.isSaving = true;
    this.empService.upsertBankAccount(this.selected.id, this.bankForm).subscribe({
      next: r => { this.isSaving = false; if (r.status === 0) { this.toast(r.message); this.selected.bank_account = r.data; } else { this.errorMsg = r.message; } },
      error: () => { this.isSaving = false; },
    });
  }

  // ── Dotaciones ────────────────────────────────────────────────────────────

  openCreateEq(): void {
    this.isEditingEq = false;
    this.eqForm = { id: 0, name: '', description: '', serial: '', condition: 'bueno', assigned_at: '', returned_at: '' };
    this.showEqModal = true;
  }

  openEditEq(eq: any): void {
    this.isEditingEq = true;
    this.eqForm = { id: eq.id, name: eq.name, description: eq.description ?? '', serial: eq.serial ?? '', condition: eq.condition, assigned_at: eq.assigned_at ?? '', returned_at: eq.returned_at ?? '' };
    this.showEqModal = true;
  }

  saveEquipment(): void {
    this.isSaving = true;
    const obs = this.isEditingEq
      ? this.empService.updateEquipment(this.selected.id, this.eqForm.id, this.eqForm)
      : this.empService.createEquipment(this.selected.id, this.eqForm);
    obs.subscribe({
      next: r => { this.isSaving = false; if (r.status === 0) { this.showEqModal = false; this.toast(r.message); this.reloadDetail(); } },
      error: () => { this.isSaving = false; },
    });
  }

  confirmDeleteEq(id: number): void { this.deleteEqId = id; }
  cancelDeleteEq(): void            { this.deleteEqId = null; }

  deleteEquipment(): void {
    if (!this.deleteEqId) return;
    this.empService.deleteEquipment(this.selected.id, this.deleteEqId).subscribe({
      next: () => { this.deleteEqId = null; this.toast('Dotación eliminada.'); this.reloadDetail(); },
      error: () => {},
    });
  }

  // ── Descargos ─────────────────────────────────────────────────────────────

  openCreateDisc(): void {
    this.isEditingDisc = false;
    this.discForm = { id: 0, incident_date: '', reason: '', description: '', resolution: '' };
    this.showDiscModal = true;
  }

  openEditDisc(d: any): void {
    this.isEditingDisc = true;
    this.discForm = { id: d.id, incident_date: d.incident_date ?? '', reason: d.reason, description: d.description ?? '', resolution: d.resolution ?? '' };
    this.showDiscModal = true;
  }

  saveDisciplinary(): void {
    this.isSaving = true;
    const obs = this.isEditingDisc
      ? this.empService.updateDisciplinary(this.selected.id, this.discForm.id, this.discForm)
      : this.empService.createDisciplinary(this.selected.id, this.discForm);
    obs.subscribe({
      next: r => { this.isSaving = false; if (r.status === 0) { this.showDiscModal = false; this.toast(r.message); this.reloadDetail(); } },
      error: () => { this.isSaving = false; },
    });
  }

  confirmDeleteDisc(id: number): void { this.deleteDiscId = id; }
  cancelDeleteDisc(): void            { this.deleteDiscId = null; }

  deleteDisciplinary(): void {
    if (!this.deleteDiscId) return;
    this.empService.deleteDisciplinary(this.selected.id, this.deleteDiscId).subscribe({
      next: () => { this.deleteDiscId = null; this.toast('Descargo eliminado.'); this.reloadDetail(); },
      error: () => {},
    });
  }

  // ── Nómina ────────────────────────────────────────────────────────────────

  openCreatePay(): void {
    this.isEditingPay = false;
    this.payForm = { id: 0, period: '', base_salary: '', bonuses: '0', deductions: '0', total_paid: '', payment_date: '', payment_method: 'transferencia', notes: '' };
    this.showPayModal = true;
  }

  openEditPay(p: any): void {
    this.isEditingPay = true;
    this.payForm = { id: p.id, period: p.period, base_salary: p.base_salary, bonuses: p.bonuses, deductions: p.deductions, total_paid: p.total_paid, payment_date: p.payment_date ?? '', payment_method: p.payment_method, notes: p.notes ?? '' };
    this.showPayModal = true;
  }

  savePayroll(): void {
    this.isSaving = true;
    const obs = this.isEditingPay
      ? this.empService.updatePayroll(this.selected.id, this.payForm.id, this.payForm)
      : this.empService.createPayroll(this.selected.id, this.payForm);
    obs.subscribe({
      next: r => { this.isSaving = false; if (r.status === 0) { this.showPayModal = false; this.toast(r.message); this.reloadDetail(); } },
      error: () => { this.isSaving = false; },
    });
  }

  confirmDeletePay(id: number): void { this.deletePayId = id; }
  cancelDeletePay(): void            { this.deletePayId = null; }

  deletePayroll(): void {
    if (!this.deletePayId) return;
    this.empService.deletePayroll(this.selected.id, this.deletePayId).subscribe({
      next: () => { this.deletePayId = null; this.toast('Registro de nómina eliminado.'); this.reloadDetail(); },
      error: () => {},
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private reloadDetail(): void {
    this.empService.getById(this.selected.id).subscribe({
      next: r => { this.selected = r.data; this.syncForms(); },
    });
  }

  toast(msg: string): void {
    this.successMsg = msg;
    setTimeout(() => { this.successMsg = ''; }, 3500);
  }

  totalPayrolls(): number {
    return this.payrolls.reduce((s, p) => s + (parseFloat(p.total_paid) || 0), 0);
  }

  conditionLabel(c: string): string {
    return { nuevo: 'Nuevo', bueno: 'Bueno', regular: 'Regular', malo: 'Malo' }[c] ?? c;
  }

  conditionClass(c: string): string {
    return {
      nuevo:   'bg-blue-100 text-blue-700',
      bueno:   'bg-green-100 text-green-700',
      regular: 'bg-yellow-100 text-yellow-700',
      malo:    'bg-red-100 text-red-700',
    }[c] ?? 'bg-gray-100 text-gray-700';
  }

  upcomingBirthday(): boolean {
    if (!this.selected?.birthday) return false;
    const today = new Date();
    const bday  = new Date(this.selected.birthday);
    bday.setFullYear(today.getFullYear());
    const diff = (bday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  }
}
