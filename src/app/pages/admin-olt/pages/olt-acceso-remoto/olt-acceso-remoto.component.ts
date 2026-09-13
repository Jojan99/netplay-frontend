import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { GestionRemotaService } from '../../../../services/gestion-remota.service';
import { ToastService } from '../../../../services/toast.service';

/** Lo leído de los perfiles de línea de una OLT. */
interface PerfilesDeOlt {
  cargando: boolean;
  error: string;
  perfiles: any[];
  pendientes: any[];
  equiposPendientes: number;
  leidoEn: string | null;
}

/**
 * Acceso remoto a los equipos de los clientes.
 *
 * Es una red aparte —su propia VLAN— por la que las ONT piden IP y reciben,
 * en la misma respuesta, la dirección del servidor TR-069. Con eso un equipo
 * nuevo entra solo al sistema.
 *
 * La pantalla arranca por el diagnóstico: qué está bien, qué falta y qué no se
 * puede automatizar en cada OLT. Cada cosa pendiente trae su botón.
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

  /** El diagnóstico de punta a punta. */
  diag: any = null;
  revisando = false;
  /** Nombre de cada OLT, para los títulos de la sección de perfiles. */
  nombresOlt: Record<number, string> = {};

  /** Lo elegido en el asistente. */
  form: { vlan: number | null; red: string; interfaz: string; uplinks: Record<number, string> } = {
    vlan: null, red: '', interfaz: '', uplinks: {},
  };

  /** El resultado del último intento, paso por paso. */
  pasos: any[] = [];

  /** Perfiles de línea por OLT, y en qué orden se muestran. */
  perfiles: Record<number, PerfilesDeOlt> = {};
  oltsConPerfiles: number[] = [];
  /** Perfil que se está preparando ahora (`olt:perfil`). */
  preparando = '';
  /** Pedido de preparar todos los pendientes de una OLT, esperando confirmación. */
  confirmar: { oltId: number; perfiles: any[]; equipos: number } | null = null;
  enCola = false;

  /** Puesta al día de los equipos que ya estaban autorizados. */
  poniendoAlDia = false;
  alDia: any[] = [];
  quedan: number | null = null;

  readonly etiquetas: Record<string, string> = {
    ok: 'Bien', pendiente: 'Pendiente', aviso: 'Atención', error: 'Falla', manual: 'A mano',
    listo: 'Listo', no_soportado: 'Revisar a mano', sin_leer: 'Sin leer', ya_estaba: 'Listo',
  };

  readonly acciones: Record<string, string> = {
    activar: 'Ir al asistente', perfiles: 'Revisar perfiles', al_dia: 'Poner al día',
  };

  ngOnInit() {
    this.cargar();
    this.revisar();
  }

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
          this.form.uplinks = { ...(this.estado.uplinks ?? {}) };
        }
      },
      error: () => { this.cargando = false; this.error = 'No se pudo leer el estado'; },
    });
  }

  /** Revisa router, OLT y equipos. Lo de la OLT sale de la última lectura. */
  revisar() {
    this.revisando = true;
    this.api.diagnostico().subscribe({
      next: (r: any) => {
        this.revisando = false;
        if (r?.error !== 0) { this.error = r?.message ?? 'No se pudo revisar'; return; }
        this.diag = r.data;
        for (const g of this.diag?.grupos ?? []) {
          if (g.olt_id) this.nombresOlt[g.olt_id] = g.titulo;
        }
      },
      error: () => { this.revisando = false; this.error = 'No se pudo revisar'; },
    });
  }

  /** El botón de cada punto del diagnóstico lleva a donde se arregla. */
  hacer(item: any, grupo: any) {
    if (item.accion === 'activar') {
      if (!this.sug) this.buscar();
      this.irA('ar-asistente');
    } else if (item.accion === 'perfiles' && grupo.olt_id) {
      this.verPerfiles(grupo.olt_id);
    } else if (item.accion === 'al_dia') {
      this.irA('ar-aldia');
      if (!this.poniendoAlDia) this.ponerAlDia();
    }
  }

  irAlAsistente() { this.irA('ar-asistente'); }

  private irA(id: string) {
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  // ── Asistente ─────────────────────────────────────────────────────────

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
          if (o.sugerido && !this.form.uplinks[o.olt_id]) this.form.uplinks[o.olt_id] = o.sugerido;
        }
      },
      error: () => { this.buscando = false; this.error = 'No se pudo leer la red'; },
    });
  }

  get interfaces(): string[] { return Object.keys(this.sug?.interfaces ?? {}); }

  /**
   * Una VLAN ocupada rompe el servicio de esos clientes: se avisa antes.
   * La propia no cuenta: después de activarla aparece como usada.
   */
  get vlanOcupada(): boolean {
    const v = Number(this.form.vlan);
    if (!v || v === Number(this.estado?.vlan)) return false;
    return (this.sug?.vlans_en_uso ?? []).some((u: any) => Number(u) === v);
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
        this.revisar();
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
        this.revisar();
      },
      error: () => { this.aplicando = false; this.toast.error('No se pudo desactivar'); },
    });
  }

  // ── Perfiles de línea ─────────────────────────────────────────────────

  verPerfiles(oltId: number, releer = false) {
    if (!this.oltsConPerfiles.includes(oltId)) this.oltsConPerfiles = [...this.oltsConPerfiles, oltId];

    const actual = this.perfiles[oltId];
    this.perfiles[oltId] = {
      cargando: true, error: '', perfiles: actual?.perfiles ?? [], pendientes: actual?.pendientes ?? [],
      equiposPendientes: actual?.equiposPendientes ?? 0, leidoEn: actual?.leidoEn ?? null,
    };
    this.irA('ar-perfiles');

    this.api.perfiles(oltId, releer).subscribe({
      next: (r: any) => {
        const p = this.perfiles[oltId];
        p.cargando = false;
        if (r?.error !== 0) { p.error = r?.message ?? 'No se pudieron leer los perfiles'; return; }
        p.perfiles = r.data?.perfiles ?? [];
        p.leidoEn = r.data?.leido_en ?? null;
        this.recontar(oltId);
        this.revisar();
      },
      error: () => {
        this.perfiles[oltId].cargando = false;
        this.perfiles[oltId].error = 'La OLT tardó demasiado en responder. Probá de nuevo en un rato.';
      },
    });
  }

  private recontar(oltId: number) {
    const p = this.perfiles[oltId];
    p.pendientes = p.perfiles.filter(x => x.estado === 'pendiente');
    p.equiposPendientes = p.pendientes.reduce((t, x) => t + (x.equipos ?? 0), 0);
  }

  /** Prepara un perfil. Devuelve una promesa para poder encadenarlos. */
  prepararPerfil(oltId: number, perfil: any): Promise<boolean> {
    this.preparando = `${oltId}:${perfil.id}`;

    return new Promise(resolve => {
      this.api.prepararPerfil(oltId, perfil.id).subscribe({
        next: (r: any) => {
          this.preparando = '';
          const d = r?.data ?? {};
          perfil.estado = d.ok ? 'listo' : (d.estado === 'no_soportado' ? 'no_soportado' : 'pendiente');
          perfil.detalle = d.detalle ?? r?.message;
          perfil.fallo = !d.ok;
          this.recontar(oltId);
          d.ok ? this.toast.success(`Perfil ${perfil.nombre}: listo`) : this.toast.error(`Perfil ${perfil.nombre}: ${perfil.detalle}`);
          resolve(!!d.ok);
        },
        error: () => {
          this.preparando = '';
          perfil.detalle = 'La OLT no respondió a tiempo.';
          perfil.fallo = true;
          this.toast.error(`Perfil ${perfil.nombre}: la OLT no respondió`);
          resolve(false);
        },
      });
    });
  }

  pedirUno(oltId: number, perfil: any) {
    this.confirmar = { oltId, perfiles: [perfil], equipos: perfil.equipos ?? 0 };
  }

  /** Todos los pendientes, del que tiene menos clientes al que tiene más. */
  pedirTodos(oltId: number) {
    const lista = [...this.perfiles[oltId].pendientes].sort((a, b) => (a.equipos ?? 0) - (b.equipos ?? 0));
    this.confirmar = { oltId, perfiles: lista, equipos: this.perfiles[oltId].equiposPendientes };
  }

  /**
   * De a uno y en orden: si un perfil falla se frena, para no seguir
   * reconfigurando clientes sin saber qué pasó.
   */
  async confirmarPreparar() {
    if (!this.confirmar) return;

    const { oltId, perfiles } = this.confirmar;
    this.confirmar = null;
    this.enCola = true;

    for (const perfil of perfiles) {
      if (!this.enCola) break;
      const ok = await this.prepararPerfil(oltId, perfil);
      if (!ok) { this.toast.error('Se frenó: revisá el perfil que falló antes de seguir.'); break; }
    }

    this.enCola = false;
    this.revisar();
  }

  pararCola() { this.enCola = false; }

  // ── Equipos ya autorizados ────────────────────────────────────────────

  /**
   * Los equipos viejos no pasan por el alta, así que hay que darles el acceso
   * aparte. Va de a tandas y se puede parar cuando se quiera.
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
          this.revisar();
          this.toast.success('Los equipos quedaron al día');
          return;
        }

        this.tanda();
      },
      error: () => { this.poniendoAlDia = false; this.toast.error('Se cortó la puesta al día'); },
    });
  }
}
