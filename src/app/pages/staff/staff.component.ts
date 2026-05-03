import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CompanyService } from '../../services/company.service';

interface StaffUser {
  id: number;
  names: string;
  lastname: string;
  email: string;
  username: string;
  profile_name: string;
}

interface Profile {
  id: number;
  name: string;
  active: boolean;
}

interface ModuleItem {
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
  imports: [CommonModule, FormsModule],
  templateUrl: './staff.component.html',
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

        this.moduleItems = raw.map(r => ({
          module: r.module,
          label:  MODULE_LABELS[r.module]?.label  ?? r.module,
          group:  MODULE_LABELS[r.module]?.group  ?? 'Otros',
          active: r.active,
        }));

        // Orden de grupos
        const order = ['Clientes','Finanzas','Soporte','Inventario','Red','Configuración','Otros'];
        const found = [...new Set(this.moduleItems.map(m => m.group))];
        this.moduleGroups = order.filter(g => found.includes(g));
      },
      error: () => { this.isLoadingModules = false; },
    });
  }

  groupModules(group: string): ModuleItem[] {
    return this.moduleItems.filter(m => m.group === group);
  }

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
    this.showModal = true;
  }

  closeModal(): void { this.showModal = false; }

  save(): void {
    this.isSaving = true;
    this.errorMsg = '';

    this.companyService.createStaff(this.form).subscribe({
      next: (res) => {
        this.isSaving = false;
        if (!res.error) {
          this.showModal  = false;
          this.successMsg = 'Usuario creado correctamente.';
          this.loadStaff();
          setTimeout(() => { this.successMsg = ''; }, 3000);
        } else {
          this.errorMsg = res.message || 'Error al crear el usuario.';
        }
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMsg = err?.error?.message || 'Error al crear el usuario.';
      },
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
