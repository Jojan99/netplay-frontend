import { Component, OnInit, inject } from '@angular/core';
import { OltElegida } from '../../shared/olt-elegida';
import { TareasEnSegundoPlanoService } from '../../../../services/tareas-en-segundo-plano.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { OltEquipoComponent } from '../../shared/olt-equipo.component';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';
import { NpSelectComponent } from '../../../../common/np-select/np-select.component';
import { PRESENTACION_OLTS, conValor } from '../../../../common/np-select/presentaciones';

type EstadoSenal = 'buena' | 'regular' | 'baja' | 'critica' | 'saturada' | 'sin_dato';

interface OntConSenal {
  fsp: string;
  ont_id: number;
  potencia: number | null;
  temperatura: number | null;
  voltaje: number | null;
  corriente: number | null;
  serial: string | null;
  description: string | null;
  status: string | null;
  estado: EstadoSenal;
}

interface PuertoConSenal {
  fsp: string;
  total: number;
  online: number;
  con_falla: number;
  promedio: number | null;
  peor: number | null;
  mejor: number | null;
}

/**
 * Estado de la OLT.
 *
 * Antes esta pantalla sólo contaba ONT en línea y las repartía por puerto, que
 * es lo que la OLT ya dice sola. Lo que un ISP necesita saber es qué enlaces
 * están por caerse: la potencia óptica de todas las ONT se lee en un solo
 * barrido, así que acá se clasifica la red completa y se listan los clientes
 * que hay que atender antes de que llamen.
 */
@Component({
  selector: 'app-olt-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent, OltEquipoComponent],
  templateUrl: './olt-dashboard.component.html',
  styleUrls: ['../../shared/olt.scss', './olt-dashboard.component.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltDashboardComponent implements OnInit {

  /** Marca, modelo, IP y acceso de cada OLT; en el modelo queda el id, como antes. */
  readonly presOlts = conValor(PRESENTACION_OLTS, o => o.id);

  olts: any[] = [];
  selectedOltId: number | null = null;
  loadingOlts = false;

  onts: any[] = [];
  loadingOnts = false;
  lastFetched: Date | null = null;

  senal: any = null;
  cargandoSenal = false;
  errorSenal: string | null = null;

  verEquipo = false;

  /** Qué clase de señal se está mirando en la lista de abajo. */
  filtroSenal: EstadoSenal | 'todas' | 'falla' = 'falla';

  readonly clasesDeSenal: { id: EstadoSenal; label: string; ayuda: string }[] = [
    { id: 'buena',    label: 'Buena',     ayuda: 'Por encima de −25 dBm' },
    { id: 'regular',  label: 'Regular',   ayuda: 'Entre −25 y −27 dBm' },
    { id: 'baja',     label: 'Baja',      ayuda: 'Entre −27 y −29 dBm' },
    { id: 'critica',  label: 'Crítica',   ayuda: 'Por debajo de −29 dBm' },
    { id: 'saturada', label: 'Saturada',  ayuda: 'Por encima de −8 dBm: el receptor se satura' },
    { id: 'sin_dato', label: 'Sin medir', ayuda: 'La ONT no reportó potencia' },
  ];

  constructor(
    private oltService: OltService,
    private toast: ToastService,
    private router: Router,
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
        if (this.selectedOltId) this.consultarTodo();
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    OltElegida.guardar(this.selectedOltId);
    this.onts  = [];
    this.senal = null;
    this.puertos = {};
    if (this.selectedOltId) this.consultarTodo();
  }

  consultarTodo(refrescar = false): void {
    this.loadOnts();
    this.cargarSenal(refrescar);
    this.cargarPuertos();
  }

  /** Lo que sabe el sistema de cada puerto, por fsp: ocupación, mora y alertas. */
  puertos: Record<string, any> = {};
  capacidadPuerto = 0;

  /** Vuelve a preguntar por la señal mientras el servidor mide. */
  private reintentoSenal: any = null;
  private tareas = inject(TareasEnSegundoPlanoService);

  cargarPuertos(): void {
    if (!this.selectedOltId) return;
    const olt = this.selectedOltId;

    this.oltService.getPuertos(olt).subscribe({
      next: (res) => {
        if (olt !== this.selectedOltId) return;
        this.capacidadPuerto = res?.data?.capacidad ?? 0;
        this.puertos = Object.fromEntries((res?.data?.puertos ?? []).map((p: any) => [p.fsp, p]));
      },
      // Sin estos datos la tabla sigue mostrando la señal: no hace falta avisar.
      error: () => { this.puertos = {}; },
    });
  }

  /** Datos del sistema para un puerto de la tabla (el fsp de la señal puede venir sin el marco). */
  datosDelPuerto(fsp: string): any | null {
    return this.puertos[fsp] ?? this.puertos['0/' + fsp] ?? null;
  }

  tonoDeOcupacion(pct: number): string {
    return pct >= 90 ? 'var(--danger)' : pct >= 75 ? 'var(--warn)' : 'var(--ok)';
  }

  loadOnts(): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getAuthorizedONTs(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts        = res.data ?? [];
        this.lastFetched = new Date();
      },
      error: (err) => {
        this.loadingOnts = false;
        this.toast.error(err?.error?.message || 'Error al cargar ONTs');
      },
    });
  }

  cargarSenal(refrescar = false): void {
    if (!this.selectedOltId) return;

    this.cargandoSenal = true;
    this.errorSenal    = null;

    const olt = this.selectedOltId;

    this.oltService.getSenal(olt, refrescar).subscribe({
      next: (res) => {
        if (olt !== this.selectedOltId) return;
        const data = res?.data ?? null;

        // El barrido corre en el servidor; mientras mide se muestra la última
        // medición (si hay) y se vuelve a preguntar en un rato.
        if (data?.midiendo) {
          this.senal = data.onts?.length ? data : this.senal;
          this.cargandoSenal = !data.onts?.length;
          clearTimeout(this.reintentoSenal);
          this.reintentoSenal = setTimeout(() => this.cargarSenal(), 20000);
          // A la ventana de tareas: sigue aunque se cambie de pestaña.
          this.tareas.seguirMedicion(olt, this.selectedOltName() || 'OLT', () => this.oltService.getSenal(olt));
          return;
        }

        this.cargandoSenal = false;
        this.senal         = data;

        if (res?.status === 1) this.errorSenal = this.senal?.error || res?.message || 'Sin mediciones ópticas';
      },
      error: (err) => {
        this.cargandoSenal = false;
        this.errorSenal    = err?.error?.message || 'No se pudo leer la señal óptica';
      },
    });
  }

  // ── Conteos de ONT ──────────────────────────────────────────────────────

  get totalOnts(): number    { return this.onts.length; }
  get onlineCount(): number  { return this.onts.filter(o => o.status === 'online').length; }
  get offlineCount(): number { return this.totalOnts - this.onlineCount; }
  get onlinePct(): number    { return this.totalOnts ? Math.round(this.onlineCount / this.totalOnts * 100) : 0; }

  // ── Señal ───────────────────────────────────────────────────────────────

  get resumen(): any            { return this.senal?.resumen ?? null; }
  get conteo(): any             { return this.resumen?.conteo ?? {}; }
  get ontsConSenal(): OntConSenal[] { return this.senal?.onts ?? []; }
  get peores(): OntConSenal[]   { return this.senal?.peores ?? []; }

  /** El tramo más alto del histograma, para escalar las barras. */
  get picoHistograma(): number {
    const tramos = this.resumen?.histograma ?? [];
    return tramos.reduce((max: number, t: any) => Math.max(max, t.total), 0) || 1;
  }

  get histograma(): any[] { return this.resumen?.histograma ?? []; }

  altoBarra(total: number): number {
    return Math.round(total / this.picoHistograma * 100);
  }

  /** Cuántas ONT hay en esa clase de señal. */
  cuantas(clase: EstadoSenal): number { return this.conteo[clase] ?? 0; }

  porcentaje(clase: EstadoSenal): number {
    const total = this.resumen?.total ?? 0;
    return total ? Math.round(this.cuantas(clase) / total * 100) : 0;
  }

  /** Las ONT que corresponden al filtro elegido, de peor a mejor. */
  get listado(): OntConSenal[] {
    const conFalla: EstadoSenal[] = ['baja', 'critica', 'saturada'];

    const filtradas = this.ontsConSenal.filter(o =>
      this.filtroSenal === 'todas' ? true
      : this.filtroSenal === 'falla' ? conFalla.includes(o.estado)
      : o.estado === this.filtroSenal);

    return [...filtradas].sort((a, b) => (a.potencia ?? 99) - (b.potencia ?? 99)).slice(0, 200);
  }

  // ── Puertos PON ─────────────────────────────────────────────────────────

  /**
   * Un renglón por puerto PON. Cuando hay señal se usa la del barrido, que
   * además trae promedio y peor enlace; si no, se cae al reparto de ONT.
   */
  get porPon(): PuertoConSenal[] {
    if (this.senal?.por_pon?.length) return this.senal.por_pon;

    const mapa: Record<string, { total: number; online: number }> = {};

    for (const o of this.onts) {
      const puerto = (o.fsp ?? '').split('/').slice(0, 3).join('/');
      if (!mapa[puerto]) mapa[puerto] = { total: 0, online: 0 };
      mapa[puerto].total++;
      if (o.status === 'online') mapa[puerto].online++;
    }

    return Object.entries(mapa)
      .map(([fsp, v]) => ({ fsp, ...v, con_falla: 0, promedio: null, peor: null, mejor: null }))
      .sort((a, b) => a.fsp.localeCompare(b.fsp, undefined, { numeric: true }));
  }

  // ── Presentación ────────────────────────────────────────────────────────

  /** El color con el que se pinta una potencia. */
  tonoDe(estado: EstadoSenal | null | undefined): string {
    return {
      buena: 'is-ok', regular: 'is-warn', baja: 'is-warn',
      critica: 'is-danger', saturada: 'is-danger', sin_dato: 'is-muted',
    }[estado ?? 'sin_dato'] ?? 'is-muted';
  }

  etiquetaDe(estado: EstadoSenal): string {
    return this.clasesDeSenal.find(c => c.id === estado)?.label ?? estado;
  }

  /** Un promedio de puerto corrido avisa de un problema de troncal o splitter. */
  tonoDePromedio(promedio: number | null): string {
    if (promedio === null) return 'is-muted';
    if (promedio >= -25)   return 'is-ok';
    if (promedio >= -27)   return 'is-warn';
    return 'is-danger';
  }

  pctOnline(p: PuertoConSenal): number {
    return p.total ? Math.round(p.online / p.total * 100) : 0;
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }

  get marcaSeleccionada(): string | null {
    return this.olts.find(o => o.id === this.selectedOltId)?.brand ?? null;
  }

  /** Lleva al listado de ONT en línea con ese puerto ya filtrado. */
  verPuerto(fsp: string): void {
    this.router.navigate(['/dashboard/olt/online'], { queryParams: { puerto: fsp } });
  }
}
