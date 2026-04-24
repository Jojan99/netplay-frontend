import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-olt-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-list.component.html',
})
export class OltListComponent implements OnInit {

  olts: any[]   = [];
  loading        = false;

  // Modal
  modal          = false;
  saving         = false;
  modalMode: 'create' | 'edit' = 'create';
  editingId: number | null = null;

  form = {
    name: '', brand: 'Huawei', host: '', port: 23,
    username: '', password: '', enable_password: '',
    access_mode: 'telnet',
    jump_host: '', jump_port: 22, jump_user: '', jump_pass: '',
    ont_lineprofile_id: null as number | null,
    ont_srvprofile_id:  null as number | null,
    default_vlan: null as number | null,
    snmp_community: 'public', snmp_version: '2c', snmp_port: 161,
    snmp_host: '', snmp_jump_host: '', snmp_jump_port: 22,
    snmp_jump_user: '', snmp_jump_pass: '',
  };

  // Delete confirm
  deleteModal     = false;
  deletingId: number | null = null;
  deletingName    = '';

  showAdvanced    = false;
  showSnmp        = false;

  constructor(
    private oltService: OltService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void { this.loadOlts(); }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.modal = false; this.deleteModal = false; }

  loadOlts(): void {
    this.loading = true;
    this.oltService.listOlts().subscribe({
      next: (res) => { this.loading = false; this.olts = res.data ?? []; },
      error: () => { this.loading = false; },
    });
  }

  openCreate(): void {
    this.modalMode = 'create';
    this.editingId = null;
    this.form = {
      name: '', brand: 'Huawei', host: '', port: 23,
      username: '', password: '', enable_password: '',
      access_mode: 'telnet',
      jump_host: '', jump_port: 22, jump_user: '', jump_pass: '',
      ont_lineprofile_id: null, ont_srvprofile_id: null, default_vlan: null,
      snmp_community: 'public', snmp_version: '2c', snmp_port: 161,
      snmp_host: '', snmp_jump_host: '', snmp_jump_port: 22,
      snmp_jump_user: '', snmp_jump_pass: '',
    };
    this.showAdvanced = false;
    this.showSnmp = false;
    this.modal = true;
  }

  openEdit(olt: any): void {
    this.modalMode = 'edit';
    this.editingId = olt.id;
    this.form = {
      name: olt.name ?? '',
      brand: olt.brand ?? 'Huawei',
      host: olt.host ?? '',
      port: olt.port ?? 23,
      username: olt.username ?? '',
      password: '',
      enable_password: '',
      access_mode: olt.access_mode ?? 'telnet',
      jump_host: olt.jump_host ?? '',
      jump_port: olt.jump_port ?? 22,
      jump_user: olt.jump_user ?? '',
      jump_pass: '',
      ont_lineprofile_id: olt.ont_lineprofile_id ?? null,
      ont_srvprofile_id: olt.ont_srvprofile_id ?? null,
      default_vlan: olt.default_vlan ?? null,
      snmp_community: olt.snmp_community ?? 'public',
      snmp_version: olt.snmp_version ?? '2c',
      snmp_port: olt.snmp_port ?? 161,
      snmp_host: olt.snmp_host ?? '',
      snmp_jump_host: olt.snmp_jump_host ?? '',
      snmp_jump_port: olt.snmp_jump_port ?? 22,
      snmp_jump_user: olt.snmp_jump_user ?? '',
      snmp_jump_pass: '',
    };
    this.showAdvanced = !!(olt.jump_host);
    this.showSnmp = !!(olt.snmp_host || olt.snmp_jump_host);
    this.modal = true;
  }

  saveForm(): void {
    if (!this.form.name.trim() || !this.form.host.trim()) return;
    this.saving = true;

    const payload: any = { ...this.form };
    if (!payload.password) delete payload.password;
    if (!payload.enable_password) delete payload.enable_password;
    if (!payload.jump_pass) delete payload.jump_pass;
    if (!payload.snmp_jump_pass) delete payload.snmp_jump_pass;

    const obs = this.modalMode === 'create'
      ? this.oltService.createOlt(payload)
      : this.oltService.updateOlt(this.editingId!, payload);

    obs.subscribe({
      next: (res) => {
        this.saving = false;
        this.modal  = false;
        this.toast.success(res.message || 'OLT guardada');
        this.loadOlts();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(err?.error?.message || 'Error al guardar OLT');
      },
    });
  }

  openDelete(olt: any): void {
    this.deletingId   = olt.id;
    this.deletingName = olt.name;
    this.deleteModal  = true;
  }

  confirmDelete(): void {
    if (!this.deletingId) return;
    this.oltService.deleteOlt(this.deletingId).subscribe({
      next: (res) => {
        this.deleteModal = false;
        this.deletingId  = null;
        this.toast.success(res.message || 'OLT eliminada');
        this.loadOlts();
      },
      error: (err) => {
        this.deleteModal = false;
        this.toast.error(err?.error?.message || 'Error al eliminar OLT');
      },
    });
  }

  accessModeLabel(mode: string): string {
    const map: Record<string, string> = { telnet: 'Telnet', ssh: 'SSH' };
    return map[mode] ?? mode;
  }
}
