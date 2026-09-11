import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { OltEquipoComponent } from '../../shared/olt-equipo.component';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
  selector: 'app-olt-list',
  standalone: true,
  imports: [CommonModule, FormsModule, OltNavComponent, OltEquipoComponent],
  templateUrl: './olt-list.component.html',
  styleUrl: '../../shared/olt.scss',
  host: { class: 'np-console' },
})
export class OltListComponent implements OnInit {

  olts: any[]   = [];
  loading        = false;

  // Modal
  modal          = false;
  saving         = false;
  modalMode: 'create' | 'edit' = 'create';
  editingId: number | null = null;

  /** Marcas con driver, tal como las reporta el backend. */
  marcas: { valor: string; nombre: string }[] = [];

  form = this.formularioVacio();

  /** Qué OLT se está mirando en el panel de equipo. */
  equipoId: number | null = null;
  equipoMarca: string | null = null;

  // Delete confirm
  deleteModal     = false;
  deletingId: number | null = null;
  deletingName    = '';

  /** Pestañas de la modal: así no queda un formulario de veinte campos seguidos. */
  readonly pestanas = [
    { id: 'conexion', label: 'Conexión' },
    { id: 'onts',     label: 'ONTs' },
    { id: 'marca',    label: 'Marca' },
    { id: 'acceso',   label: 'Acceso' },
    { id: 'snmp',     label: 'SNMP' },
  ];

  pestana = 'conexion';

  /** El script del túnel que se creó junto con la OLT. */
  scriptTunel = '';
  scriptModal = false;
  nombreDelTunel = '';

  constructor(
    private oltService: OltService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadOlts();
    this.loadMarcas();
  }

  /** Un formulario en blanco con los valores que el backend acepta. */
  private formularioVacio() {
    return {
      name: '', brand: 'huawei', host: '', port: 23,
      username: '', password: '', enable_password: '',
      // 'direct' o 'jump': es cómo se llega a la OLT, no el protocolo.
      access_mode: 'direct',
      jump_host: '', jump_port: 22, jump_user: '', jump_pass: '',
      ont_lineprofile_id: null as number | null,
      ont_srvprofile_id:  null as number | null,
      default_vlan: null as number | null,
      snmp_community: 'public', snmp_version: '2c', snmp_port: 161,
      snmp_host: '', snmp_jump_host: '', snmp_jump_port: 22,
      snmp_jump_user: '', snmp_jump_pass: '',
      zte_onu_type: '', zte_dba_profile: '', vsol_onu_profile: '',
      // El túnel de gestión se crea con la OLT: cuando el equipo está en una
      // red privada, el camino para llegar a él es parte del alta.
      crear_tunel_vpn: false, tunel_nombre: '', tunel_redes: '',
    };
  }

  /**
   * La red /24 del host de la OLT, que es la que va al túnel por defecto.
   * Casi siempre la red de gestión es la del propio equipo.
   */
  get redSugerida(): string {
    const host = (this.form.host || '').trim();

    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return '';

    return host.split('.').slice(0, 3).join('.') + '.0/24';
  }

  /** Una IP privada detrás de un router es justo el caso que el túnel resuelve. */
  get hostEsPrivado(): boolean {
    const host = (this.form.host || '').trim();

    return /^10\./.test(host)
        || /^192\.168\./.test(host)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  }

  loadMarcas(): void {
    this.oltService.getMarcas().subscribe({
      next: (res) => { this.marcas = res?.data ?? []; },
      error: () => { /* el select cae a la marca ya guardada */ },
    });
  }

  /** Abre la ficha del equipo de esa OLT. */
  verEquipo(olt: any): void {
    this.equipoId    = olt.id;
    this.equipoMarca = olt.brand ?? null;
  }

  cerrarEquipo(): void { this.equipoId = null; }

  /** El modelo que declaró el equipo se refleja en la tabla al vuelo. */
  modeloLeido(modelo: string): void {
    const olt = this.olts.find(o => o.id === this.equipoId);
    if (olt) olt.model = modelo;
  }

  nombreDeMarca(valor: string | null): string {
    if (!valor) return '—';
    return this.marcas.find(m => m.valor === valor.toLowerCase())?.nombre ?? valor;
  }

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
    this.form = this.formularioVacio();
    this.pestana = 'conexion';
    this.modal   = true;
  }

  openEdit(olt: any): void {
    this.modalMode = 'edit';
    this.editingId = olt.id;
    this.form = {
      ...this.formularioVacio(),
      name: olt.name ?? '',
      // La marca viene en minúsculas del backend; antes el select ofrecía
      // 'Huawei' con mayúscula y el guardado se rechazaba siempre.
      brand: (olt.brand ?? 'huawei').toLowerCase(),
      host: olt.host ?? '',
      port: olt.port ?? 23,
      username: olt.username ?? '',
      access_mode: olt.access_mode === 'jump' ? 'jump' : 'direct',
      jump_host: olt.jump_host ?? '',
      jump_port: olt.jump_port ?? 22,
      jump_user: olt.jump_user ?? '',
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
      zte_onu_type: olt.zte_onu_type ?? '',
      zte_dba_profile: olt.zte_dba_profile ?? '',
      vsol_onu_profile: olt.vsol_onu_profile ?? '',
    };
    this.pestana = 'conexion';
    this.modal   = true;
  }

  /** Qué falta para poder guardar. Vacío cuando ya se puede. */
  get avisoDelFormulario(): string {
    if (!this.form.name.trim())  return 'Falta el nombre.';
    if (!this.form.host.trim())  return 'Falta el host.';
    if (this.modalMode === 'create' && !this.form.password) return 'Falta la contraseña de la OLT.';
    if (this.form.access_mode === 'jump' && !this.form.jump_host.trim()) return 'Falta el jump host.';
    if (this.form.brand === 'vsol' && !this.form.vsol_onu_profile.trim()) return 'V-SOL necesita el perfil de ONU.';

    return '';
  }

  get puedeGuardar(): boolean { return this.avisoDelFormulario === ''; }

  /** Marca la pestaña cuando la marca elegida pide un dato que falta. */
  get faltaDatoDeMarca(): boolean {
    return this.form.brand === 'vsol' && !this.form.vsol_onu_profile.trim();
  }

  saveForm(): void {
    if (!this.puedeGuardar) return;
    this.saving = true;

    const payload: any = { ...this.form };

    // Al editar no se toca el túnel: se administra desde la pestaña VPN.
    if (this.modalMode === 'edit') {
      delete payload.crear_tunel_vpn;
      delete payload.tunel_nombre;
      delete payload.tunel_redes;
    } else if (payload.crear_tunel_vpn && !payload.tunel_redes?.trim()) {
      payload.tunel_redes = this.redSugerida;
    }

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

        // Si vino con túnel, el script es lo primero que hace falta.
        if (res?.data?.script) {
          this.scriptTunel    = res.data.script;
          this.nombreDelTunel = res.data.tunel?.nombre ?? '';
          this.scriptModal    = true;
        }
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
    const map: Record<string, string> = { direct: 'Directo', jump: 'Vía jump host' };
    return map[mode] ?? mode;
  }
  copiarScriptTunel(): void {
    navigator.clipboard?.writeText(this.scriptTunel).then(
      () => this.toast.success('Script copiado. Pegalo en la terminal del router.'),
      () => this.toast.error('El navegador no permitió copiar; seleccioná el texto a mano.'),
    );
  }

}
