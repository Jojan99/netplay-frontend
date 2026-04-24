import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-olt-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './olt-config.component.html',
})
export class OltConfigComponent implements OnInit {

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;
  saving                = false;
  showAdvanced          = false;
  showSnmp              = false;

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

  constructor(
    private oltService: OltService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void { this.loadOlts(); }

  loadOlts(): void {
    this.loadingOlts = true;
    this.oltService.listOlts().subscribe({
      next: (res) => {
        this.loadingOlts = false;
        this.olts = res.data ?? [];
        if (this.olts.length === 1) {
          this.selectedOltId = this.olts[0].id;
          this.fillForm(this.olts[0]);
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    const olt = this.olts.find(o => o.id === this.selectedOltId);
    if (olt) this.fillForm(olt);
  }

  fillForm(olt: any): void {
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
    this.showSnmp     = !!(olt.snmp_host || olt.snmp_jump_host);
  }

  saveForm(): void {
    if (!this.selectedOltId || !this.form.name.trim() || !this.form.host.trim()) return;
    this.saving = true;

    const payload: any = { ...this.form };
    if (!payload.password) delete payload.password;
    if (!payload.enable_password) delete payload.enable_password;
    if (!payload.jump_pass) delete payload.jump_pass;
    if (!payload.snmp_jump_pass) delete payload.snmp_jump_pass;

    this.oltService.updateOlt(this.selectedOltId, payload).subscribe({
      next: (res) => {
        this.saving = false;
        this.toast.success(res.message || 'Configuración guardada');
        this.loadOlts();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(err?.error?.message || 'Error al guardar');
      },
    });
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
