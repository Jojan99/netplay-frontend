import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InstallationService } from '../../../services/installation.service';
import { NpSelectComponent, PresentacionSelect } from '../../../common/np-select/np-select.component';
import { PRESENTACION_OLTS, PRESENTACION_TEXTOS, conValor } from '../../../common/np-select/presentaciones';
import { ToastService } from '../../../services/toast.service';
import { DialogService } from '../../../services/dialog.service';

/**
 * Lo que el técnico hace en la casa del cliente.
 *
 * Antes esto eran cinco pantallas y alguien en la oficina: dar de alta al
 * cliente, autorizar la ONT, asociársela, descontar el equipo y dejar el WiFi.
 * El técnico hacía la parte física y el resto quedaba para después.
 *
 * Aquí elige el equipo de la lista que la OLT está viendo —sin escribir el
 * serial, y que aparezca ahí ya prueba que está conectado y encendido— y con
 * un botón queda todo hecho.
 */
@Component({
  selector: 'app-provisionar-instalacion',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  templateUrl: './provisionar-instalacion.component.html',
  styleUrl: './provisionar-instalacion.component.scss',
})
export class ProvisionarInstalacionComponent implements OnInit {
  private svc = inject(InstallationService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  /** La orden que el técnico está atendiendo. */
  @Input({ required: true }) orden!: any;
  @Output() cerrado = new EventEmitter<void>();
  @Output() listo = new EventEmitter<void>();

  cargando = true;
  trabajando = false;
  error = '';

  /** Las que la OLT ve sin autorizar: son las que están conectadas ahora. */
  onts: any[] = [];
  inventario: any[] = [];
  aprovisiona = false;

  // ── Por dónde entra, que el técnico puede corregir ──────────────────────
  //
  // La orden se toma en la oficina; cuando el técnico llega, el cliente a
  // veces sale por otro nodo o por otra VLAN. Si no se pudiera corregir, la
  // ONT quedaría autorizada donde no navega y el cliente sin internet.
  olts: any[] = [];
  vlans: any[] = [];
  lineProfiles: any[] = [];
  srvProfiles: any[] = [];
  capacidades: any = {};

  /** Lo que traía la orden, para poder decir qué se cambió. */
  plan: any = {};

  oltId: number | null = null;
  vlan: number | null = null;
  lineProfileId: number | null = null;
  srvProfileId: number | null = null;
  onuType: string | null = null;

  /** Los de por dónde entra se muestran cerrados: casi siempre va lo planeado. */
  abiertoPorDonde = false;

  readonly presOlts = conValor(PRESENTACION_OLTS, (o: any) => o.id);
  readonly presTextos = PRESENTACION_TEXTOS;

  readonly presVlans: PresentacionSelect = {
    valor: v => v?.vlan,
    etiqueta: v => 'VLAN ' + v?.vlan,
    prefijo: v => String(v?.vlan ?? ''),
    detalle: v => [v?.red, v?.nombre].filter(Boolean).join(' · ') || null,
    insignia: v => {
      const n = Number(v?.clientes ?? 0);
      return n ? { texto: `${n} ${n === 1 ? 'cliente' : 'clientes'}`, tono: 'ok' } : null;
    },
    buscarEn: v => [v?.vlan, v?.red, v?.nombre].filter(Boolean).join(' '),
  };

  private presPerfil(defecto: () => unknown): PresentacionSelect {
    return {
      valor: p => p?.profile_id,
      etiqueta: p => p?.profile_name || `Perfil ${p?.profile_id}`,
      prefijo: p => (p?.profile_id != null ? String(p.profile_id) : null),
      insignia: p => {
        const d = defecto();
        return d != null && +p?.profile_id === +(d as number) ? { texto: 'Predeterminado', tono: 'info' } : null;
      },
      buscarEn: p => `${p?.profile_id ?? ''} ${p?.profile_name ?? ''}`,
    };
  }

  readonly presPerfilLinea = this.presPerfil(() => this.oltActual?.ont_lineprofile_id);
  readonly presPerfilServicio = this.presPerfil(() => this.oltActual?.ont_srvprofile_id);

  get oltActual(): any {
    return this.olts.find(o => o.id === this.oltId);
  }

  elegida: any = null;
  inventoryId: number | null = null;

  /** El detalle de lo que pasó, para que el técnico vea dónde falló si falla. */
  pasos: any[] = [];
  avisos: string[] = [];
  termino = false;

  ngOnInit(): void { this.buscarEquipos(); }

  buscarEquipos(): void {
    this.cargando = true;
    this.error = '';
    this.elegida = null;

    this.svc.equiposDisponibles(this.orden.id, this.oltId).subscribe({
      next: (r: any) => {
        this.cargando = false;
        const d = r?.data ?? {};
        this.onts = d.onts ?? [];
        this.inventario = d.inventario ?? [];
        this.aprovisiona = !!d.aprovisiona;

        this.olts = d.olts ?? [];
        this.vlans = d.vlans ?? [];
        this.lineProfiles = d.perfiles?.line ?? [];
        this.srvProfiles = d.perfiles?.srv ?? [];
        this.capacidades = d.capacidades ?? {};
        this.plan = d.plan ?? {};

        this.oltId = d.olt_id ?? this.plan.olt_id ?? null;

        // La primera vez se propone lo de la orden; después se respeta lo que
        // el técnico ya eligió, para no deshacerle la corrección al recargar.
        if (this.vlan === null) this.vlan = this.plan.vlan ?? null;
        if (this.onuType === null) this.onuType = this.plan.onu_type ?? null;

        // Los perfiles son de esta OLT: si el que traía la orden no existe
        // acá, se cae al predeterminado de la OLT y si no al primero.
        this.lineProfileId = this.perfilQueSirve(this.lineProfiles, this.lineProfileId ?? this.plan.line_profile_id, this.oltActual?.ont_lineprofile_id);
        this.srvProfileId = this.perfilQueSirve(this.srvProfiles, this.srvProfileId ?? this.plan.srv_profile_id, this.oltActual?.ont_srvprofile_id);

        // Con un solo renglón de ONT en stock no hay nada que elegir.
        if (this.inventario.length === 1) this.inventoryId = this.inventario[0].id;

        // Si no hay equipos nuevos, lo primero que uno revisa es la OLT: se
        // abre solo para que el técnico vea que puede cambiarla.
        if (!this.onts.length) this.abiertoPorDonde = true;
      },
      error: (e: any) => {
        this.cargando = false;
        this.error = e?.error?.message || 'No se pudo preguntarle a la OLT.';
      },
    });
  }

  private perfilQueSirve(lista: any[], preferido: any, deLaOlt: any): number | null {
    const hay = (id: any) => id != null && lista.some(p => +p.profile_id === +id);

    if (hay(preferido)) return Number(preferido);
    if (hay(deLaOlt)) return Number(deLaOlt);

    return lista.length ? Number(lista[0].profile_id) : null;
  }

  /** Cambió de OLT: los equipos y los perfiles son otros. */
  alCambiarOlt(): void {
    this.lineProfileId = null;
    this.srvProfileId = null;
    this.buscarEquipos();
  }

  /** Lo que se va a usar difiere de lo que traía la orden. */
  get cambios(): string[] {
    const dif: string[] = [];
    const nombreOlt = (id: any) => this.olts.find(o => o.id === +id)?.name ?? ('OLT ' + id);
    const perfil = (lista: any[], id: any) => lista.find(p => +p.profile_id === +id)?.profile_name ?? id;

    if (this.plan.olt_id && this.oltId && +this.plan.olt_id !== +this.oltId) {
      dif.push(`OLT: ${nombreOlt(this.plan.olt_id)} → ${nombreOlt(this.oltId)}`);
    }
    if (this.vlan && this.plan.vlan && +this.plan.vlan !== +this.vlan) {
      dif.push(`VLAN: ${this.plan.vlan} → ${this.vlan}`);
    }
    if (this.lineProfileId != null && this.plan.line_profile_id != null && +this.plan.line_profile_id !== +this.lineProfileId) {
      dif.push(`Perfil de línea: ${perfil(this.lineProfiles, this.plan.line_profile_id)} → ${perfil(this.lineProfiles, this.lineProfileId)}`);
    }
    if (this.srvProfileId != null && this.plan.srv_profile_id != null && +this.plan.srv_profile_id !== +this.srvProfileId) {
      dif.push(`Perfil de servicio: ${perfil(this.srvProfiles, this.plan.srv_profile_id)} → ${perfil(this.srvProfiles, this.srvProfileId)}`);
    }

    return dif;
  }

  elegir(ont: any): void {
    this.elegida = ont;
  }

  get puedeSeguir(): boolean {
    // Sin VLAN la ONT queda registrada y el cliente no navega: pasó de verdad
    // y nadie se enteró hasta que el cliente llamó.
    return !!this.elegida && !!this.vlan && !this.trabajando;
  }

  get porQueNoPuede(): string {
    if (!this.elegida) return 'Seleccione el equipo que va a instalar.';
    if (!this.vlan) return 'Falta la VLAN: sin ella el equipo queda autorizado pero el cliente no navega.';
    return '';
  }

  async instalar(): Promise<void> {
    if (!this.puedeSeguir) return;

    const serial = this.elegida.serial || this.elegida.sn;

    const donde = [this.oltActual?.name, this.vlan ? 'VLAN ' + this.vlan : null].filter(Boolean).join(', ');

    if (!await this.dialog.confirm(
      `Se va a autorizar el equipo ${serial} por ${donde} y dejarlo a nombre de ${this.orden.client_name}.` +
      (this.cambios.length ? ` Cambia lo que traía la orden: ${this.cambios.join('; ')}.` : '') +
      ' ¿Continuamos?',
      { okLabel: 'Sí, instalar' },
    )) return;

    this.trabajando = true;
    this.error = '';

    this.svc.provisionar(this.orden.id, {
      fsp: this.elegida.fsp,
      ont_id: Number(this.elegida.ont_id ?? 0),
      serial,
      inventory_id: this.inventoryId,
      olt_id: this.oltId,
      vlan: this.vlan,
      line_profile_id: this.lineProfileId,
      srv_profile_id: this.srvProfileId,
      onu_type: this.onuType,
    }).subscribe({
      next: (r: any) => {
        this.trabajando = false;
        this.pasos = r?.data?.pasos ?? [];
        this.avisos = r?.data?.avisos ?? [];
        this.termino = true;
        this.toast.success(r?.message || 'Listo.');
        this.listo.emit();
      },
      error: (e: any) => {
        this.trabajando = false;
        this.pasos = e?.error?.data?.pasos ?? [];
        this.avisos = e?.error?.data?.avisos ?? [];
        this.error = e?.error?.message || 'No se pudo completar la instalación.';
      },
    });
  }
}
