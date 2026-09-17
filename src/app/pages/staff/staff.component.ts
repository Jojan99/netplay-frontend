import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CompanyService } from '../../services/company.service';
import { AuthService } from '../../services/auth.service';
import { NpSelectComponent, PresentacionSelect } from '../../common/np-select/np-select.component';

interface StaffUser {
  id: number;
  names: string;
  lastname: string;
  email: string;
  username: string;
  profile_name: string;
  /** 0 = cuenta desactivada: sigue en la lista pero no puede entrar. */
  active: number;
}

interface Profile {
  id: number;
  name: string;
  active: boolean;
}

interface ModuleItem {
  description?: string;
  adminOnly?: boolean;
  module: string;
  label: string;
  group: string;
  active: boolean;
}

const MODULE_LABELS: Record<string, { label: string; group: string }> = {
  'usuario':          { label: 'Gestionar Clientes',    group: 'Clientes' },
  'finanzas':         { label: 'Ingresos',               group: 'Finanzas' },
  'egresos':          { label: 'Egresos',                group: 'Finanzas' },
  'report-paid':      { label: 'Reportes de pagos',      group: 'Finanzas' },
  'payment-proof-audit': { label: 'Auditoría de pagos', group: 'Finanzas' },
  'history-facture':  { label: 'Historial Facturas',     group: 'Finanzas' },
  'resumen':          { label: 'Resumen Financiero',     group: 'Finanzas' },
  'created-ticket':   { label: 'Crear Ticket',           group: 'Soporte' },
  'view-ticket':      { label: 'Ver Tickets',            group: 'Soporte' },
  'installations':    { label: 'Instalaciones',          group: 'Soporte' },
  'crm':              { label: 'CRM WhatsApp',           group: 'Soporte' },
  'inventory':        { label: 'Inventario',             group: 'Inventario' },
  'olt-detail':       { label: 'ONUs Autorizadas',       group: 'Red' },
  'olt-admin':        { label: 'OLT Admin',              group: 'Red' },
  'router':           { label: 'Mikrotik Router',        group: 'Red' },
  'mikrotik':         { label: 'Mikrotik Panel',         group: 'Red' },
  'technician-map':   { label: 'Mapa de Técnicos',       group: 'Red' },
  'staff':            { label: 'Equipo de trabajo',      group: 'Configuración' },
  'billing-config':   { label: 'Config. Facturación',   group: 'Configuración' },
  'payment-gateway':  { label: 'Pasarela de Pago',       group: 'Configuración' },
  'contratos':        { label: 'Contratos',              group: 'Configuración' },
  'empleados':        { label: 'Empleados',              group: 'Configuración' },
  'planes-internet':  { label: 'Planes de Internet',     group: 'Configuración' },
  'whatsapp':         { label: 'Admin WhatsApp',         group: 'Configuración' },
};

@Component({
  selector: 'app-staff',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  templateUrl: './staff.component.html',
  styleUrl: './staff.component.scss',
  host: { class: 'np-console' },
})
export class StaffComponent implements OnInit {
  staff: StaffUser[]   = [];
  profiles: Profile[]  = [];
  isLoading  = false;
  showModal  = false;
  isSaving   = false;
  errorMsg   = '';
  successMsg = '';

  // Módulos
  selectedProfile: Profile | null = null;
  moduleItems: ModuleItem[]       = [];
  moduleGroups: string[]          = [];
  isLoadingModules = false;
  isSavingModules  = false;
  modulesMsg       = '';

  form = {
    names: '', lastname: '', email: '', username: '', password: '', profile_id: 0,
  };

  /** Contraseña a la vista, como en el alta de empresa y en el portal. */
  showPw = false;
  /** Campo que el servidor marcó como equivocado, para resaltarlo. */
  errorField = '';

  // ── Baja de una cuenta ─────────────────────────────────────────────────────
  showDeleteModal = false;
  deleting        = false;
  toDelete: StaffUser | null = null;

  /** Roles al crear un usuario: cuántos del equipo ya lo tienen (de la lista cargada). Guarda el id numérico. */
  readonly presPerfiles: PresentacionSelect<Profile> = {
    valor: p => p.id,
    etiqueta: p => p.name ?? '',
    insignia: p => {
      const n = this.staff.filter(s => s.profile_name === p.name).length;
      return n ? { texto: `${n} ${n === 1 ? 'usuario' : 'usuarios'}`, tono: 'neutral' } : null;
    },
  };

  get activeModulesCount(): number { return this.moduleItems.filter(m => m.active).length; }
  trackStaff = (_: number, u: StaffUser) => u.id;
  /** La propia cuenta no se puede eliminar: el botón ni siquiera aparece. */
  readonly miUsuario = inject(AuthService).getUsername();
  rolePill(name: string): string {
    const n = (name || '').toUpperCase();
    if (n.includes('ADMIN')) return 'np-pill--suspended';
    if (n.includes('TECNI')) return 'np-pill--info';
    if (n.includes('CONTA')) return 'np-pill--active';
    return 'np-pill--neutral';
  }
  roleColor(name: string): string {
    const n = (name || '').toUpperCase();
    if (n.includes('ADMIN')) return 'var(--danger)';
    if (n.includes('TECNI')) return 'var(--info)';
    if (n.includes('CONTA')) return 'var(--ok)';
    return 'var(--line-strong)';
  }

  constructor(private companyService: CompanyService) {}

  ngOnInit(): void {
    this.loadStaff();
    this.loadProfiles();
  }

  loadProfiles(): void {
    this.companyService.getProfiles().subscribe({
      next: (res) => {
        this.profiles = (res.data ?? []).filter((p: Profile) => p.active);
        if (this.profiles.length) {
          this.form.profile_id = this.profiles[0].id;
        }
      },
    });
  }

  loadStaff(): void {
    this.isLoading = true;
    this.companyService.getStaff().subscribe({
      next:  (res) => { this.isLoading = false; this.staff = res.data ?? []; },
      error: ()    => { this.isLoading = false; },
    });
  }

  // ── Módulos ────────────────────────────────────────────────────────────────

  selectProfile(profile: Profile): void {
    this.selectedProfile = profile;
    this.modulesMsg      = '';
    this.isLoadingModules = true;

    this.companyService.getProfileModules(profile.id).subscribe({
      next: (res) => {
        this.isLoadingModules = false;
        const raw: { module: string; active: boolean }[] = res.data ?? [];

        // El catálogo viene del backend (grupo, nombre y explicación); el mapa local
        // queda sólo como respaldo para instalaciones que aún no lo devuelven.
        this.moduleItems = raw.map((r: any) => ({
          module:      r.module,
          label:       r.label       ?? MODULE_LABELS[r.module]?.label ?? r.module,
          group:       r.group       ?? MODULE_LABELS[r.module]?.group ?? 'Otros',
          description: r.description ?? '',
          adminOnly:   !!r.admin_only,
          active:      r.active,
        }));

        this.moduleGroups = [...new Set(this.moduleItems.map(m => m.group))];
      },
      error: () => { this.isLoadingModules = false; },
    });
  }

  groupModules(group: string): ModuleItem[] {
    return this.moduleItems.filter(m => m.group === group);
  }

  /** Marca o desmarca de un golpe todos los módulos de un grupo. */
  toggleGroup(group: string, on: boolean): void {
    this.moduleItems.filter(m => m.group === group).forEach(m => m.active = on);
  }
  groupAllOn(group: string): boolean {
    const list = this.groupModules(group);
    return list.length > 0 && list.every(m => m.active);
  }
  selectAllModules(on: boolean): void { this.moduleItems.forEach(m => m.active = on); }

  saveModules(): void {
    if (!this.selectedProfile) return;
    this.isSavingModules = true;
    this.modulesMsg      = '';

    const active = this.moduleItems.filter(m => m.active).map(m => m.module);

    this.companyService.updateProfileModules(this.selectedProfile.id, active).subscribe({
      next: () => {
        this.isSavingModules = false;
        this.modulesMsg      = 'Módulos guardados correctamente.';
        setTimeout(() => { this.modulesMsg = ''; }, 3000);
      },
      error: () => { this.isSavingModules = false; },
    });
  }

  // ── Staff modal ────────────────────────────────────────────────────────────

  openModal(): void {
    this.form     = { names: '', lastname: '', email: '', username: '', password: '', profile_id: this.profiles[0]?.id ?? 0 };
    this.errorMsg = '';
    this.errorField = '';
    this.showPw   = false;
    this.showModal = true;
  }

  closeModal(): void { this.showModal = false; }

  /** Clave que cumple lo que pide el servidor: 10+, mayúsculas, minúsculas y números. */
  generarPassword(): void {
    const may = 'ABCDEFGHJKLMNPQRSTUVWXYZ', min = 'abcdefghijkmnpqrstuvwxyz', num = '23456789';
    const todo = may + min + num;
    const al = (s: string) => s[Math.floor(Math.random() * s.length)];
    const clave = [al(may), al(min), al(num), al(num), ...Array.from({ length: 8 }, () => al(todo))];

    // Mezcla para que las primeras posiciones no sean siempre del mismo tipo.
    for (let i = clave.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [clave[i], clave[j]] = [clave[j], clave[i]];
    }

    this.form.password = clave.join('');
    this.showPw        = true;
  }

  save(): void {
    this.isSaving = true;
    this.errorMsg = '';
    this.errorField = '';

    this.companyService.createStaff(this.form).subscribe({
      next: (res) => {
        this.isSaving = false;
        if (!res.error) {
          this.showModal  = false;
          // El servidor dice con qué usuario va a entrar: se muestra tal cual.
          this.successMsg = res.message || 'Usuario creado correctamente.';
          this.loadStaff();
          setTimeout(() => { this.successMsg = ''; }, 6000);
        } else {
          this.errorMsg   = res.message || 'No se pudo crear el usuario.';
          this.errorField = res.data?.campo ?? '';
        }
      },
      error: (err) => {
        this.isSaving = false;
        // El 422 de la validación trae el motivo exacto: mostrarlo, no taparlo.
        this.errorMsg   = err?.error?.message || 'No se pudo crear el usuario. Revisá tu conexión e intentá de nuevo.';
        this.errorField = err?.error?.data?.campo ?? '';
      },
    });
  }

  // ── Baja de una cuenta ─────────────────────────────────────────────────────

  openDelete(u: StaffUser): void {
    this.toDelete        = u;
    this.showDeleteModal = true;
  }

  closeDelete(): void { this.showDeleteModal = false; this.toDelete = null; }

  confirmDelete(): void {
    if (!this.toDelete || this.deleting) return;
    this.deleting = true;

    this.companyService.deleteStaff(this.toDelete.id).subscribe({
      next: (res) => {
        this.deleting        = false;
        this.showDeleteModal = false;
        this.toDelete        = null;
        // El mensaje explica si la cuenta se borró o sólo quedó desactivada.
        if (res.error) { this.errorMsg = res.message || 'No se pudo eliminar la cuenta.'; }
        else           { this.successMsg = res.message || 'Cuenta eliminada.'; setTimeout(() => { this.successMsg = ''; }, 8000); }
        this.loadStaff();
      },
      error: (err) => {
        this.deleting        = false;
        this.showDeleteModal = false;
        this.errorMsg        = err?.error?.message || 'No se pudo eliminar la cuenta.';
      },
    });
  }

  reactivar(u: StaffUser): void {
    this.companyService.reactivateStaff(u.id).subscribe({
      next: (res) => {
        if (res.error) { this.errorMsg = res.message || 'No se pudo reactivar la cuenta.'; }
        else           { this.successMsg = res.message || 'Cuenta reactivada.'; setTimeout(() => { this.successMsg = ''; }, 6000); }
        this.loadStaff();
      },
      error: (err) => { this.errorMsg = err?.error?.message || 'No se pudo reactivar la cuenta.'; },
    });
  }

  profileLabel(pid: number): string {
    return this.profiles.find(p => p.id === pid)?.name ?? 'Desconocido';
  }

  roleBadge(name: string): string {
    const map: Record<string, string> = {
      'ADMIN':    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      'TECNICO':  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
      'CONTADOR': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    };
    return map[name?.toUpperCase()] ?? 'bg-gray-100 text-gray-700';
  }
}
