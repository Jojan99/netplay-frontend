import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { GestionRemotaService } from '../../../../services/gestion-remota.service';
import { ToastService } from '../../../../services/toast.service';
import { TareasEnSegundoPlanoService } from '../../../../services/tareas-en-segundo-plano.service';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';

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
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent],
  templateUrl: './olt-acceso-remoto.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-acceso-remoto.component.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltAccesoRemotoComponent implements OnInit {
  private api = inject(GestionRemotaService);
  private toast = inject(ToastService);
  /** Las tareas lanzadas desde acá también se ven en la ventana flotante del panel. */
  private tareas = inject(TareasEnSegundoPlanoService);

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
    this.cargarAprov();
  }

  // ── Pestañas ──────────────────────────────────────────────────────────

  tab: 'estado' | 'perfiles' | 'equipos' | 'aprov' | 'config' = 'estado';
  private tabElegida = false;

  abrirTab(t: 'estado' | 'perfiles' | 'equipos' | 'aprov' | 'config') {
    this.tab = t;
    this.tabElegida = true;
    if (t === 'perfiles') this.cargarPerfilesDeTodas();
    if (t === 'aprov') this.cargarAprov();
  }

  /** Los perfiles se leen solos al abrir la pestaña, una vez por OLT. */
  private cargarPerfilesDeTodas() {
    for (const g of this.diag?.grupos ?? []) {
      if (g.olt_id && String(g.marca ?? '').toLowerCase() === 'huawei' && !this.perfiles[g.olt_id]) {
        this.verPerfiles(g.olt_id);
      }
    }
  }

  /**
   * Se arman una vez al llegar el diagnóstico. Como getters devolvían objetos
   * nuevos en cada ciclo, Angular redibujaba la lista entera y el clic en «Ir
   * al asistente» o «Revisar perfiles» caía sobre un botón que ya no existía.
   */
  problemas: any[] = [];
  bienes: any[] = [];

  private armarItems() {
    const todos = (this.diag?.grupos ?? []).flatMap((g: any) => (g.items ?? []).map((i: any) => ({ ...i, grupo: g })));
    this.problemas = todos.filter((i: any) => i.estado !== 'ok');
    this.bienes = todos.filter((i: any) => i.estado === 'ok');
  }

  porItem = (_: number, i: any) => `${i.grupo?.titulo}|${i.titulo}`;
  porId = (_: number, a: any) => a.id;

  // ── Lista de aprovisionamientos ───────────────────────────────────────

  readonly filtrosAprov = [
    { id: 'activos', label: 'En curso' },
    { id: 'fallas', label: 'Con fallas' },
    { id: 'listos', label: 'Listos' },
    { id: 'todos', label: 'Todos' },
  ] as const;
  filtroAprov: 'activos' | 'fallas' | 'listos' | 'todos' = 'todos';

  private enFiltro(a: any, f: string): boolean {
    switch (f) {
      case 'activos': return ['esperando', 'aplicando'].includes(a.estado);
      case 'fallas':  return this.esMalo(a.estado);
      case 'listos':  return a.estado === 'listo';
      // «Todos» sin los reemplazados: son altas viejas de la misma ONT.
      default:        return a.estado !== 'reemplazado';
    }
  }

  cuentaAprov(f: string): number { return this.aprovUltimos.filter(a => this.enFiltro(a, f)).length; }

  get aprovFiltrados(): any[] { return this.aprovUltimos.filter(a => this.enFiltro(a, this.filtroAprov)); }

  get resumenOpciones(): string {
    const f = this.aprovForm;
    return [f.wan && 'internet', f.wifi && 'WiFi', f.admin && 'cuenta admin'].filter(Boolean).join(' · ') || 'nada';
  }

  get perfilesLeidos(): boolean { return this.oltsConPerfiles.some(o => (this.perfiles[o]?.perfiles?.length ?? 0) > 0); }

  get perfilesPendientes(): number {
    return this.oltsConPerfiles.reduce((n, o) => n + (this.perfiles[o]?.pendientes?.length ?? 0), 0);
  }

  get equiposFaltan(): number {
    return this.estado?.activa ? Math.max(0, (this.estado.equipos?.total ?? 0) - (this.estado.equipos?.con_gestion ?? 0)) : 0;
  }

  get porcentajeAcceso(): number {
    const t = this.estado?.equipos?.total ?? 0;
    return t ? Math.round((this.estado.equipos.con_gestion / t) * 100) : 0;
  }

  get aprovConFallas(): number { return this.aprovUltimos.filter(a => this.esMalo(a.estado)).length; }

  /** El color de la píldora de cada aprovisionamiento. */
  pillAprov(estado: string): string {
    return estado === 'listo' ? 'listo' : this.esMalo(estado) ? 'error' : estado === 'reemplazado' ? 'sin_leer' : 'pendiente';
  }

  // ── Aprovisionamiento automático al autorizar ─────────────────────────

  aprov: any = null;
  aprovForm = { aprovisionar: false, wan: true, wifi: true, admin: false, wifi_prefijo: '', admin_usuario: '', admin_clave: '' };
  aprovUltimos: any[] = [];
  guardandoAprov = false;
  /** El aprovisionamiento con los pasos a la vista. */
  abiertoAprov: number | null = null;

  readonly estadosAprov: Record<string, string> = {
    esperando: 'Esperando al equipo', aplicando: 'Aplicando', listo: 'Listo', con_errores: 'Con fallas',
    vencido: 'No apareció', error: 'Falla', reemplazado: 'Reemplazado',
  };

  esMalo(estado: string): boolean { return ['con_errores', 'vencido', 'error'].includes(estado); }

  reintentando: number | null = null;

  reintentarAprov(a: any, ev: Event) {
    ev.stopPropagation();
    this.reintentando = a.id;
    this.api.reintentarAprovisionamiento(a.id).subscribe({
      next: (r: any) => {
        this.reintentando = null;
        if (r?.error !== 0) { this.toast.error(r?.message ?? 'No se pudo reintentar'); return; }
        this.aprovUltimos = r.data ?? this.aprovUltimos;
        this.toast.success('Se reintenta en menos de un minuto. Tocá "Actualizar" para ver cómo va.');
      },
      error: (e: any) => { this.reintentando = null; this.toast.error(e?.error?.message ?? 'No se pudo reintentar'); },
    });
  }

  cargarAprov() {
    this.api.aprovisionamiento().subscribe({
      next: (r: any) => {
        if (r?.error !== 0) return;
        this.aprov = r.data.ajustes;
        this.aprovUltimos = r.data.ultimos ?? [];
        this.aprovForm = {
          aprovisionar: !!this.aprov.aprovisionar, wan: !!this.aprov.wan, wifi: !!this.aprov.wifi, admin: !!this.aprov.admin,
          wifi_prefijo: this.aprov.wifi_prefijo ?? '', admin_usuario: this.aprov.admin_usuario ?? '', admin_clave: '',
        };
      },
    });
  }

  guardarAprov() {
    this.guardandoAprov = true;
    this.api.guardarAprovisionamiento(this.aprovForm).subscribe({
      next: (r: any) => {
        this.guardandoAprov = false;
        if (r?.error !== 0) { this.toast.error(r?.message ?? 'No se pudo guardar'); return; }
        this.aprov = r.data;
        this.aprovForm.admin_clave = '';
        this.toast.success(this.aprovForm.aprovisionar ? 'Aprovisionamiento automático guardado' : 'Aprovisionamiento automático apagado');
      },
      error: (e: any) => {
        this.guardandoAprov = false;
        this.toast.error(e?.error?.message ?? 'No se pudo guardar');
        this.cargarAprov();
      },
    });
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
        this.armarItems();
        for (const g of this.diag?.grupos ?? []) {
          if (g.olt_id) this.nombresOlt[g.olt_id] = g.titulo;
        }
        // Apagado: lo único útil es configurarlo.
        if (!this.tabElegida && this.diag?.nivel === 'apagado') this.tab = 'config';
        if (this.tab === 'perfiles') this.cargarPerfilesDeTodas();
      },
      error: () => { this.revisando = false; this.error = 'No se pudo revisar'; },
    });
  }

  /** El botón de cada punto del diagnóstico lleva a donde se arregla. */
  hacer(item: any, grupo: any) {
    if (item.accion === 'activar') {
      this.abrirTab('config');
      if (!this.sug && !this.buscando) this.buscar();
    } else if (item.accion === 'perfiles') {
      this.abrirTab('perfiles');
      if (grupo?.olt_id) this.verPerfiles(grupo.olt_id);
    } else if (item.accion === 'al_dia') {
      // Sólo lleva a la pestaña: poner al día toca cientos de equipos y se decide ahí.
      this.abrirTab('equipos');
    }
  }

  irAlAsistente() { this.abrirTab('config'); }

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

  /** Se arma una vez por lectura: un arreglo nuevo en cada revisión hacía recalcular el selector sin parar. */
  private interfacesDe: { mapa: any; lista: string[] } = { mapa: null, lista: [] };

  get interfaces(): string[] {
    const mapa = this.sug?.interfaces ?? null;
    if (this.interfacesDe.mapa !== mapa) this.interfacesDe = { mapa, lista: Object.keys(mapa ?? {}) };
    return this.interfacesDe.lista;
  }

  /** Interfaces del MikroTik: cuántas VLAN cuelgan de cada una, con barra, y cuál se propone. */
  readonly presInterfaces: PresentacionSelect<string> = {
    valor: i => i,
    etiqueta: i => i,
    detalle: i => (i === this.sug?.interfaz ? 'La propuesta: la que más VLAN lleva' : null),
    insignia: (i, todas) => {
      const n = Number(this.sug?.interfaces?.[i] ?? 0);
      const mayor = Math.max(1, ...todas.map(x => Number(this.sug?.interfaces?.[x] ?? 0)));
      return { texto: `${n} VLAN de clientes`, tono: n ? 'ok' : 'neutral', proporcion: n / mayor };
    },
  };

  /** Puertos de subida de una OLT: sus VLAN y cuál coincide con el MikroTik. [value] guardaba texto. */
  readonly presUplinks: PresentacionSelect = {
    valor: p => String(p?.puerto),
    etiqueta: p => String(p?.puerto ?? ''),
    detalle: p => (p?.vlans?.length ? `VLAN ${p.vlans.join(', ')}` : 'Sin VLAN'),
    insignia: p => ((this.sug?.olts ?? []).some((o: any) => o.sugerido === p?.puerto && o.puertos?.includes(p))
      ? { texto: 'Sugerido', tono: 'ok' } : null),
    buscarEn: p => [p?.puerto, ...(p?.vlans ?? [])].join(' '),
  };

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

  /**
   * Prepara un perfil. Corre en segundo plano en el servidor; la promesa se
   * resuelve cuando termina, para poder encadenarlos de a uno.
   */
  prepararPerfil(oltId: number, perfil: any): Promise<boolean> {
    this.preparando = `${oltId}:${perfil.id}`;

    const cerrar = (ok: boolean, detalle: string, estado?: string) => {
      this.preparando = '';
      perfil.estado = ok ? 'listo' : (estado === 'no_soportado' ? 'no_soportado' : 'pendiente');
      perfil.detalle = detalle;
      perfil.fallo = !ok;
      this.recontar(oltId);
      ok ? this.toast.success(`Perfil ${perfil.nombre}: listo`) : this.toast.error(`Perfil ${perfil.nombre}: ${detalle}`);
    };

    return new Promise(resolve => {
      this.api.prepararPerfil(oltId, perfil.id).subscribe({
        next: (r: any) => {
          const id = r?.data?.tarea;
          if (r?.error !== 0 || !id) { cerrar(false, r?.message ?? 'No se pudo iniciar'); resolve(false); return; }

          this.tareas.seguir(id, `Preparando el perfil ${perfil.nombre}`, 'preparar_perfil').subscribe({
            next: (t: any) => {
              if (t?.estado === 'en_curso') { perfil.detalle = 'Preparando en la OLT…'; return; }
              const d = t?.resultado ?? {};
              const ok = t?.estado === 'listo' && d.ok !== false;
              cerrar(ok, d.detalle ?? t?.detalle ?? '', d.estado);
              resolve(ok);
            },
            error: () => { cerrar(false, 'Se perdió el seguimiento: volvé a leer los perfiles.'); resolve(false); },
          });
        },
        error: () => { cerrar(false, 'No se pudo iniciar.'); resolve(false); },
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

  /** La puesta al día en curso, para seguirla y poder pararla. */
  tareaAlDia = '';
  detalleAlDia = '';

  /**
   * Los equipos viejos no pasan por el alta, así que hay que darles el acceso
   * aparte. Son cientos: corre en el servidor hasta terminar, aunque se cierre
   * la pantalla, y se puede parar cuando se quiera.
   */
  ponerAlDia() {
    this.poniendoAlDia = true;
    this.detalleAlDia = 'Iniciando…';

    this.api.alDia().subscribe({
      next: (r: any) => {
        const id = r?.data?.tarea;
        if (r?.error !== 0 || !id) { this.poniendoAlDia = false; this.toast.error(r?.message ?? 'No se pudo iniciar'); return; }
        this.tareaAlDia = id;
        this.seguirAlDia(id);
      },
      error: () => { this.poniendoAlDia = false; this.toast.error('No se pudo iniciar la puesta al día'); },
    });
  }

  private seguirAlDia(id: string) {
    this.tareas.seguir(id, 'Poniendo al día los equipos', 'al_dia', 4000).subscribe({
      next: (t: any) => {
        this.alDia = t?.resultado?.hechas ?? this.alDia;
        this.quedan = t?.resultado?.quedan ?? this.quedan;
        this.detalleAlDia = t?.detalle ?? '';
        if (t?.estado === 'en_curso') return;

        this.poniendoAlDia = false;
        this.tareaAlDia = '';
        this.cargar();
        this.revisar();
        t?.estado === 'listo' ? this.toast.success(t.detalle || 'Los equipos quedaron al día') : this.toast.error(t?.detalle || 'La puesta al día se detuvo');
      },
      error: () => { this.poniendoAlDia = false; this.toast.error('Se perdió el seguimiento; la puesta al día sigue en el servidor'); },
    });
  }

  pararAlDia() {
    if (!this.tareaAlDia) { this.poniendoAlDia = false; return; }
    this.api.pararTarea(this.tareaAlDia).subscribe({
      next: () => this.toast.success('Se detiene después del equipo en curso'),
      error: () => this.toast.error('No se pudo pedir que pare'),
    });
  }

}
