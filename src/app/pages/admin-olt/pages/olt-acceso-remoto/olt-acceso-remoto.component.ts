import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { GestionRemotaService } from '../../../../services/gestion-remota.service';
import { ToastService } from '../../../../services/toast.service';

/**
 * Acceso remoto a los equipos de los clientes.
 *
 * Es una red aparte —su propia VLAN— por la que las ONT piden IP y reciben,
 * en la misma respuesta, la dirección del servidor TR-069. Con eso un equipo
 * nuevo entra solo al sistema.
 *
 * A mano son once pasos entre el router y cada OLT, y equivocarse en uno deja
 * clientes sin servicio. Acá se lee lo que hay puesto, se propone lo que está
 * libre y se aplica de una sola vez.
 */
@Component({
  selector: 'app-olt-acceso-remoto',
  standalone: true,
  imports: [CommonModule, FormsModule, OltNavComponent],
  templateUrl: './olt-acceso-remoto.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-acceso-remoto.component.scss'],
  host: { class: 'np-console' },
})
export class OltAccesoRemotoComponent implements OnInit {
  private api = inject(GestionRemotaService);
  private toast = inject(ToastService);

  estado: any = null;
  sug: any = null;

  cargando = false;
  buscando = false;
  aplicando = false;
  error = '';

  /** Lo elegido en el asistente. */
  form: { vlan: number | null; red: string; interfaz: string; uplinks: Record<number, string> } = {
    vlan: null, red: '', interfaz: '', uplinks: {},
  };

  /** El resultado del último intento, paso por paso. */
  pasos: any[] = [];

  /** Puesta al día de los equipos que ya estaban autorizados. */
  poniendoAlDia = false;
  alDia: any[] = [];
  quedan: number | null = null;

  ngOnInit() { this.cargar(); }

  cargar() {
    this.cargando = true;
    this.api.estado().subscribe({
      next: (r: any) => {
        this.cargando = false;
        if (r?.error !== 0) { this.error = r?.message ?? 'No se pudo leer el estado'; return; }
        this.estado = r.data;
        if (this.estado?.activa) {
          this.form.vlan = this.estado.vlan;
          this.form.red = this.estado.red ?? '';
          this.form.interfaz = this.estado.interfaz ?? '';
        }
      },
      error: () => { this.cargando = false; this.error = 'No se pudo leer el estado'; },
    });
  }

  /** Lee el router y las OLT: tarda, por eso va con su propio aviso. */
  buscar() {
    this.buscando = true;
    this.error = '';
    this.api.sugerencias(this.estado?.router_id ?? null).subscribe({
      next: (r: any) => {
        this.buscando = false;
        if (r?.error !== 0) { this.error = r?.message ?? 'No se pudo leer la red'; return; }
        this.sug = r.data;
        this.form.vlan ??= this.sug.vlans_libres?.[0] ?? null;
        this.form.red ||= this.sug.redes_libres?.[0] ?? '';
        this.form.interfaz ||= this.sug.interfaz ?? '';
        for (const o of this.sug.olts ?? []) {
          if (o.sugerido) this.form.uplinks[o.olt_id] = o.sugerido;
        }
      },
      error: () => { this.buscando = false; this.error = 'No se pudo leer la red'; },
    });
  }

  get interfaces(): string[] { return Object.keys(this.sug?.interfaces ?? {}); }

  /**
   * Una VLAN ocupada rompe el servicio de esos clientes: se avisa antes.
   *
   * La propia no cuenta: después de activarla aparece como usada —la puso la
   * plataforma— y volver a entrar mostraba un error que no era tal.
   */
  get vlanOcupada(): boolean {
    const v = Number(this.form.vlan);

    if (!v || v === Number(this.estado?.vlan)) return false;

    return (this.sug?.vlans_en_uso ?? []).some((u: any) => Number(u) === v);
  }

  /**
   * Quedó puesto en el router pero no en la OLT: los equipos piden IP y nadie
   * les contesta, porque la VLAN no llega hasta allá.
   */
  get faltaLaOlt(): boolean {
    return !!this.estado?.activa && !Object.keys(this.estado?.uplinks ?? {}).length;
  }

  get puedeActivar(): boolean {
    return !!this.form.vlan && !!this.form.red && !!this.form.interfaz && !this.vlanOcupada && !this.aplicando;
  }

  activar() {
    if (!this.puedeActivar) return;

    this.aplicando = true;
    this.pasos = [];
    this.api.activar({
      vlan: this.form.vlan!,
      red: this.form.red,
      interfaz: this.form.interfaz,
      router_id: this.sug?.router_id ?? this.estado?.router_id ?? null,
      uplinks: this.form.uplinks,
    }).subscribe({
      next: (r: any) => {
        this.aplicando = false;
        this.pasos = r?.data?.pasos ?? [];
        if (r?.error !== 0) { this.toast.error(r?.message ?? 'No se pudo activar'); return; }
        this.estado = r.data?.estado ?? this.estado;
        this.toast.success(r.message);
      },
      error: () => { this.aplicando = false; this.toast.error('No se pudo activar'); },
    });
  }

  desactivar() {
    if (!confirm('Se quita del MikroTik la red de gestión. Los equipos dejan de reportar al TR-069. ¿Seguir?')) return;

    this.aplicando = true;
    this.api.desactivar().subscribe({
      next: (r: any) => {
        this.aplicando = false;
        this.estado = r?.data?.estado ?? this.estado;
        this.pasos = [];
        this.toast.success(r?.data?.aviso ? `${r.message}. ${r.data.aviso}` : r?.message);
      },
      error: () => { this.aplicando = false; this.toast.error('No se pudo desactivar'); },
    });
  }

  /**
   * Los equipos viejos no pasan por el alta, así que hay que darles el acceso
   * aparte. Son cientos y cada uno son dos comandos en la OLT: va de a tandas
   * y se puede parar cuando se quiera.
   */
  ponerAlDia() {
    this.poniendoAlDia = true;
    this.alDia = [];
    this.tanda();
  }

  pararAlDia() { this.poniendoAlDia = false; }

  private tanda() {
    if (!this.poniendoAlDia) return;

    this.api.alDia(3).subscribe({
      next: (r: any) => {
        const hechas = r?.data?.hechas ?? [];
        this.alDia = [...hechas, ...this.alDia].slice(0, 200);
        this.quedan = r?.data?.pendientes ?? 0;

        if (!hechas.length || this.quedan === 0) {
          this.poniendoAlDia = false;
          this.cargar();
          this.toast.success('Los equipos quedaron al día');
          return;
        }

        this.tanda();
      },
      error: () => { this.poniendoAlDia = false; this.toast.error('Se cortó la puesta al día'); },
    });
  }
}
