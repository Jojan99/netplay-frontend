import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { OltEquipoComponent } from '../../shared/olt-equipo.component';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';
import { OltElegida } from '../../shared/olt-elegida';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';
import { OpcionSimple, PRESENTACION_OLTS, PRESENTACION_SIMPLE, conValor } from '../../../../common/np-select/presentaciones';

/** Qué pide cada marca además de la conexión (lo mismo que muestran los campos que aparecen al elegirla). */
const PIDE_LA_MARCA: Record<string, string> = {
  zte: 'Pide tipo de ONU y perfil tcont',
  vsol: 'Pide el perfil de ONU',
};

const CODIGO_DE_MARCA: Record<string, string> = { huawei: 'HW', zte: 'ZTE', cdata: 'CD', vsol: 'VS' };

@Component({
  selector: 'app-olt-config',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent, OltEquipoComponent],
  templateUrl: './olt-config.component.html',
  styleUrls: ['../../shared/olt.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltConfigComponent implements OnInit {

  /** Marca, modelo, IP y acceso de cada OLT; en el modelo queda el id, como antes. */
  readonly presOlts = conValor(PRESENTACION_OLTS, o => o.id);
  readonly presSimple = PRESENTACION_SIMPLE;

  /**
   * El backend manda "Huawei (MA5600T / MA5608T / MA5800)": arriba la marca,
   * abajo los modelos y qué datos extra pide. En el modelo queda el valor en texto.
   */
  readonly presMarcas: PresentacionSelect<{ valor: string; nombre: string }> = {
    valor: m => m.valor,
    etiqueta: m => (m.nombre ?? '').replace(/\s*\(.*\)\s*$/, '') || m.valor,
    prefijo: m => CODIGO_DE_MARCA[m.valor] ?? m.valor?.slice(0, 3).toUpperCase(),
    detalle: m => [(m.nombre ?? '').match(/\((.*)\)/)?.[1], PIDE_LA_MARCA[m.valor] ?? 'Sin datos adicionales'].filter(Boolean).join(' · '),
    buscarEn: m => `${m.nombre} ${m.valor}`,
  };

  readonly opcionesAcceso: OpcionSimple[] = [
    { valor: 'direct', etiqueta: 'Directo a la OLT', detalle: 'IP pública o alcanzable por un túnel de la pestaña VPN' },
    { valor: 'jump', etiqueta: 'Por jump host', detalle: 'Sesión SSH en un bastión: pide SSH abierto y guarda su contraseña' },
  ];

  readonly opcionesSnmp: OpcionSimple[] = [
    { valor: '2c', etiqueta: '2c', detalle: 'La más usada' },
    { valor: '1', etiqueta: '1', detalle: 'Sólo para equipos que no aceptan 2c' },
  ];

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;
  saving                = false;
  showAdvanced          = false;
  showSnmp              = false;

  /** Marcas con driver, tal como las reporta el backend. */
  marcas: { valor: string; nombre: string }[] = [];

  form = {
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
  };

  constructor(
    private oltService: OltService,
    private toast: ToastService,
  ) {}

  ngOnInit(): void {
    this.loadOlts();
    this.loadMarcas();
  }

  loadMarcas(): void {
    this.oltService.getMarcas().subscribe({
      next: (res) => { this.marcas = res?.data ?? []; },
      error: () => { /* el select cae a la marca ya guardada */ },
    });
  }

  get marcaConfigurada(): string | null {
    return this.olts.find(o => o.id === this.selectedOltId)?.brand ?? null;
  }

  loadOlts(): void {
    this.loadingOlts = true;
    this.oltService.listOlts().subscribe({
      next: (res) => {
        this.loadingOlts = false;
        this.olts = res.data ?? [];
        // La OLT elegida en cualquier pestaña del módulo (o la primera).
        const elegida = OltElegida.objeto(this.olts);
        if (elegida) {
          this.selectedOltId = elegida.id;
          this.fillForm(elegida);
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    OltElegida.guardar(this.selectedOltId);
    const olt = this.olts.find(o => o.id === this.selectedOltId);
    if (olt) this.fillForm(olt);
  }

  fillForm(olt: any): void {
    this.form = {
      name: olt.name ?? '',
      // El backend guarda la marca en minúsculas; con 'Huawei' el guardado se
      // rechazaba siempre por validación.
      brand: (olt.brand ?? 'huawei').toLowerCase(),
      host: olt.host ?? '',
      port: olt.port ?? 23,
      username: olt.username ?? '',
      password: '',
      enable_password: '',
      access_mode: olt.access_mode === 'jump' ? 'jump' : 'direct',
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
      zte_onu_type: olt.zte_onu_type ?? '',
      zte_dba_profile: olt.zte_dba_profile ?? '',
      vsol_onu_profile: olt.vsol_onu_profile ?? '',
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
