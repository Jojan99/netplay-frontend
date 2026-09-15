import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';
import { OltElegida } from '../../shared/olt-elegida';
import { NpSelectComponent } from '../../../../common/np-select/np-select.component';
import { PRESENTACION_OLTS, conValor } from '../../../../common/np-select/presentaciones';

@Component({
  selector: 'app-olt-perfiles',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent],
  templateUrl: './olt-perfiles.component.html',
  styleUrls: ['../../shared/olt.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltPerfilesComponent implements OnInit {

  /** Marca, modelo, IP y acceso de cada OLT; en el modelo queda el id, como antes. */
  readonly presOlts = conValor(PRESENTACION_OLTS, o => o.id);

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;

  lineProfiles: any[]   = [];
  srvProfiles: any[]    = [];
  loadingProfiles       = false;
  syncing               = false;
  lastSynced: string | null = null;

  /** Cuál perfil usa la OLT al autorizar, si no se indica otro. */
  lineDefecto: number | null = null;
  srvDefecto: number | null  = null;
  guardandoDefecto = false;

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
        // La OLT elegida en cualquier pestaña del módulo (o la primera).
        this.selectedOltId = OltElegida.de(this.olts);
        if (this.selectedOltId) {
          this.leerDefectos();
          this.loadProfiles();
        }
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    OltElegida.guardar(this.selectedOltId);
    this.lineProfiles = [];
    this.srvProfiles  = [];
    this.leerDefectos();
    if (this.selectedOltId) this.loadProfiles();
  }

  /** Los predeterminados salen de la configuración de la OLT. */
  private leerDefectos(): void {
    const olt = this.olts.find(o => o.id === this.selectedOltId);
    this.lineDefecto = olt?.ont_lineprofile_id ?? null;
    this.srvDefecto  = olt?.ont_srvprofile_id ?? null;
  }

  get oltSeleccionada(): any { return this.olts.find(o => o.id === this.selectedOltId) ?? null; }

  esLineDefecto(p: any): boolean { return this.lineDefecto != null && +p.profile_id === +this.lineDefecto; }
  esSrvDefecto(p: any): boolean  { return this.srvDefecto  != null && +p.profile_id === +this.srvDefecto; }

  /** ¿El predeterminado apunta a un perfil que la OLT ya no tiene? */
  get lineDefectoHuerfano(): boolean {
    return this.lineDefecto != null && this.lineProfiles.length > 0
      && !this.lineProfiles.some(p => +p.profile_id === +this.lineDefecto!);
  }

  get srvDefectoHuerfano(): boolean {
    return this.srvDefecto != null && this.srvProfiles.length > 0
      && !this.srvProfiles.some(p => +p.profile_id === +this.srvDefecto!);
  }

  /**
   * Marca un perfil como el que se usará al autorizar. El backend lo valida
   * contra los que la OLT tiene de verdad, que es lo que evita el
   * "The service profile does not exist" recién al registrar un cliente.
   */
  usarPorDefecto(tipo: 'line' | 'srv', perfil: any): void {
    if (!this.selectedOltId || this.guardandoDefecto) return;

    this.guardandoDefecto = true;

    const line = tipo === 'line' ? +perfil.profile_id : null;
    const srv  = tipo === 'srv'  ? +perfil.profile_id : null;

    this.oltService.fijarPerfilesPorDefecto(this.selectedOltId, line, srv).subscribe({
      next: (res) => {
        this.guardandoDefecto = false;

        if (res?.status === 1) { this.toast.error(res.message); return; }

        this.lineDefecto = res?.data?.ont_lineprofile_id ?? this.lineDefecto;
        this.srvDefecto  = res?.data?.ont_srvprofile_id  ?? this.srvDefecto;

        // La lista de OLTs guarda la configuración; se actualiza en el sitio
        // para que al volver a esta pantalla se vea lo elegido.
        const olt = this.oltSeleccionada;
        if (olt) { olt.ont_lineprofile_id = this.lineDefecto; olt.ont_srvprofile_id = this.srvDefecto; }

        this.toast.success(res?.message || 'Perfil predeterminado actualizado');
      },
      error: (err) => {
        this.guardandoDefecto = false;
        this.toast.error(err?.error?.message || 'No se pudo fijar el perfil');
      },
    });
  }

  loadProfiles(): void {
    if (!this.selectedOltId) return;
    this.loadingProfiles = true;
    this.oltService.getProfiles(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingProfiles = false;
        this.lineProfiles = res.data?.line ?? [];
        this.srvProfiles  = res.data?.srv  ?? [];
        if (this.lineProfiles.length) {
          this.lastSynced = this.lineProfiles[0].synced_at ?? null;
        }
      },
      error: () => { this.loadingProfiles = false; },
    });
  }

  syncProfiles(): void {
    if (!this.selectedOltId) return;
    this.syncing = true;
    this.oltService.syncProfiles(this.selectedOltId).subscribe({
      next: (res) => {
        this.syncing = false;
        this.toast.success(res.message || 'Perfiles sincronizados');
        this.loadProfiles();
      },
      error: (err) => {
        this.syncing = false;
        this.toast.error(err?.error?.message || 'Error al sincronizar perfiles');
      },
    });
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
