import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { FormsModule } from '@angular/forms';
import { OltService } from '../../../../services/olt.service';
import { UserService } from '../../../../services/user.service';
import { ToastService } from '../../../../services/toast.service';
import { GestionRemotaService } from '../../../../services/gestion-remota.service';
import { TareasEnSegundoPlanoService } from '../../../../services/tareas-en-segundo-plano.service';
import { OltElegida } from '../../shared/olt-elegida';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';
import { PRESENTACION_OLTS, PRESENTACION_POR_PAGINA, conValor } from '../../../../common/np-select/presentaciones';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-olt-autorizadas',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent],
  templateUrl: './olt-autorizadas.component.html',
  styleUrls: ['../../shared/olt.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltAutorizadasComponent implements OnInit {

  /** Marca, modelo, IP y acceso de cada OLT; en el modelo queda el id, como antes. */
  readonly presOlts = conValor(PRESENTACION_OLTS, o => o.id);
  readonly presPorPagina = PRESENTACION_POR_PAGINA;

  /** Puertos PON: cuántas ONT tiene cada uno (con barra frente al más cargado) y cuántas están en línea. */
  readonly presPuertos: PresentacionSelect<string> = {
    valor: p => p,
    etiqueta: p => p,
    prefijo: () => 'PON',
    detalle: p => `${this.puertos().online[p] ?? 0} en línea`,
    insignia: p => {
      const { total } = this.puertos();
      const n = total[p] ?? 0;
      return { texto: `${n} ONT`, tono: 'neutral', proporcion: n / Math.max(1, ...Object.values(total)) };
    },
    buscarEn: p => p,
  };

  olts: any[]           = [];
  selectedOltId: number | null = null;
  loadingOlts           = false;

  onts: any[]           = [];
  loadingOnts           = false;
  lastFetched: Date | null = null;
  searchTerm            = '';
  filterPort            = '';
  page                  = 1;
  perPage               = 15;
  perPageOptions        = [15, 25, 50, 100];

  // Delete modal
  deleteModal           = false;
  selectedOnt: any      = null;
  processing            = false;

  // Detail modal
  detailModal           = false;
  detailOnt: any        = null;
  detailPorts: any[]    = [];
  detailInfo: any       = null;
  loadingDetail         = false;

  /**
   * Potencia de cada ONT, indexada por "fsp:id", del barrido óptico de la OLT.
   * Es una sola consulta para toda la red, así que la lista puede mostrar la
   * señal de cada cliente sin abrir su ficha.
   */
  senalPorOnt: Record<string, any> = {};
  cargandoSenal = false;
  soloConFalla  = false;

  // Assign client modal
  assignModal           = false;
  assignOnt: any        = null;
  clientSearch          = '';
  clientResults: any[]  = [];
  searchingClients      = false;
  selectedClient: any   = null;
  assigning             = false;
  private search$       = new Subject<string>();

  /** Se está dando el acceso remoto a este equipo. */
  dandoAcceso = false;
  /** Se está reiniciando este equipo. */
  reiniciando = false;

  constructor(
    private oltService: OltService,
    private userService: UserService,
    private toast: ToastService,
    private gestion: GestionRemotaService,
  ) {}

  /**
   * Le da acceso remoto a un equipo ya autorizado.
   *
   * Los nuevos lo reciben al autorizarlos; esto es para los que venían de
   * antes, cuando hay que atender a un cliente puntual y no se quiere esperar
   * a la puesta al día de todos.
   */
  /**
   * Reinicia el equipo desde la OLT. Le corta internet al cliente un minuto,
   * así que se pide confirmación. Sirve, por ejemplo, para que un C-Data tome
   * el servidor TR-069 que le mandó la OLT.
   */
  reiniciarEquipo(ont: any): void {
    if (!this.selectedOltId || !ont) return;
    if (!confirm(`¿Reiniciar el equipo de ${ont.description || ont.serial || 'este cliente'}? Se queda sin internet alrededor de un minuto.`)) return;

    this.reiniciando = true;
    this.gestion.reiniciar(this.selectedOltId, ont.fsp, ont.ont_id).subscribe({
      next: (r: any) => {
        const id = r?.data?.tarea;
        if (r?.error !== 0 || !id) { this.reiniciando = false; this.toast.error(r?.message ?? 'No se pudo reiniciar'); return; }

        this.seguirTarea(id, ont).subscribe({
          next: (t: any) => {
            if (t?.estado === 'en_curso') return;
            this.reiniciando = false;
            t?.estado === 'listo'
              ? this.toast.success('El equipo se está reiniciando: vuelve en un minuto')
              : this.toast.error(t?.detalle || 'No se pudo reiniciar');
          },
          error: () => { this.reiniciando = false; this.toast.error('Se perdió el seguimiento del reinicio'); },
        });
      },
      error: () => { this.reiniciando = false; this.toast.error('No se pudo reiniciar'); },
    });
  }

  private tareas = inject(TareasEnSegundoPlanoService);

  /** Sigue la tarea también en la ventana flotante del panel. */
  private seguirTarea(id: string, ont: any) {
    const quien = `${ont.description || ont.serial || 'equipo'} (${ont.fsp}:${ont.ont_id})`;

    return this.dandoAcceso
      ? this.tareas.seguir(id, `Dando acceso remoto · ${quien}`, 'dar_acceso')
      : this.tareas.seguir(id, `Reiniciando · ${quien}`, 'reiniciar');
  }

  darAccesoRemoto(ont: any): void {
    if (!this.selectedOltId || !ont) return;

    this.dandoAcceso = true;
    this.gestion.darAcceso(this.selectedOltId, ont.fsp, ont.ont_id).subscribe({
      next: (r: any) => {
        const id = r?.data?.tarea;
        if (r?.error !== 0 || !id) {
          this.dandoAcceso = false;
          this.toast.error(r?.message ?? 'No se pudo iniciar');
          return;
        }

        // Corre en segundo plano: la OLT tarda más de lo que aguanta la petición.
        this.toast.success('Configurando el acceso remoto… puede tardar un par de minutos');
        this.seguirTarea(id, ont).subscribe({
          next: (t: any) => {
            if (t?.estado === 'en_curso') return;
            this.dandoAcceso = false;
            t?.estado === 'listo'
              ? this.toast.success('El equipo ya puede reportar al TR-069')
              : this.toast.error(t?.detalle || 'No se pudo darle acceso');
          },
          error: () => { this.dandoAcceso = false; this.toast.error('Se perdió el seguimiento; revisá el diagnóstico en Acceso remoto'); },
        });
      },
      error: () => { this.dandoAcceso = false; this.toast.error('No se pudo iniciar'); },
    });
  }

  ngOnInit(): void {
    this.loadOlts();
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        this.searchingClients = true;
        return this.userService.searchClients(q);
      }),
    ).subscribe({
      next: (res) => { this.searchingClients = false; this.clientResults = res.data ?? []; },
      error: () => { this.searchingClients = false; },
    });
  }

  @HostListener('document:keydown.escape')
  onEsc(): void { this.deleteModal = false; this.detailModal = false; this.assignModal = false; }

  loadOlts(): void {
    this.loadingOlts = true;
    this.oltService.listOlts().subscribe({
      next: (res) => {
        this.loadingOlts = false;
        this.olts = res.data ?? [];
        // La OLT elegida en cualquier pestaña del módulo (o la primera).
        this.selectedOltId = OltElegida.de(this.olts);
        if (this.selectedOltId) this.loadOnts();
      },
      error: () => { this.loadingOlts = false; },
    });
  }

  onOltChange(): void {
    OltElegida.guardar(this.selectedOltId);
    this.onts = [];
    this.lastFetched = null;
    this.filterPort  = '';
    this.page        = 1;
    if (this.selectedOltId) this.loadOnts();
  }

  loadOnts(force = false): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getAuthorizedONTs(this.selectedOltId, force).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts        = res.data ?? [];
        this.lastFetched = new Date();
        this.cargarSenal();
      },
      error: (err) => {
        this.loadingOnts = false;
        this.toast.error(err?.error?.message || 'Error al obtener ONTs');
      },
    });
  }

  // ── Unique ports for filter dropdown ─────────────────────────────────────
  get uniquePorts(): string[] { return this.puertos().lista; }

  /**
   * Puertos y conteos, armados una vez por lista de ONT: con un arreglo nuevo
   * en cada revisión el selector recalculaba sus opciones sin parar.
   */
  private puertosDe: { onts: any[] | null; lista: string[]; total: Record<string, number>; online: Record<string, number> } =
    { onts: null, lista: [], total: {}, online: {} };

  private puertos() {
    if (this.puertosDe.onts !== this.onts) {
      const total: Record<string, number> = {};
      const online: Record<string, number> = {};
      for (const o of this.onts) {
        if (!o.fsp) continue;
        total[o.fsp] = (total[o.fsp] ?? 0) + 1;
        if (o.status === 'online') online[o.fsp] = (online[o.fsp] ?? 0) + 1;
      }
      this.puertosDe = { onts: this.onts, lista: Object.keys(total).sort(), total, online };
    }
    return this.puertosDe;
  }

  get filteredOnts(): any[] {
    let list = this.onts;
    if (this.filterPort) list = list.filter(o => o.fsp === this.filterPort);
    if (this.soloConFalla) {
      list = list.filter(o => ['baja', 'critica', 'saturada'].includes(this.estadoDeSenal(o)));
    }
    const t = this.searchTerm.toLowerCase();
    if (t) list = list.filter(o =>
      (o.fsp ?? '').toLowerCase().includes(t) ||
      (o.serial ?? '').toLowerCase().includes(t) ||
      (o.description ?? '').toLowerCase().includes(t)
    );
    return list;
  }

  get pagedOnts(): any[] {
    const start = (this.page - 1) * this.perPage;
    return this.filteredOnts.slice(start, start + this.perPage);
  }

  get totalPages(): number { return Math.max(1, Math.ceil(this.filteredOnts.length / this.perPage)); }

  get pageNumbers(): number[] {
    const delta = 2;
    const range: number[] = [];
    for (let i = Math.max(1, this.page - delta); i <= Math.min(this.totalPages, this.page + delta); i++) range.push(i);
    return range;
  }

  resetPage(): void { this.page = 1; }
  prevPage(): void  { if (this.page > 1) this.page--; }
  nextPage(): void  { if (this.page < this.totalPages) this.page++; }
  goPage(p: number): void { this.page = p; }
  changePerPage(): void { this.page = 1; }
  minVal(a: number, b: number): number { return Math.min(a, b); }

  get onlineCount(): number  { return this.onts.filter(o => o.status === 'online').length; }
  get offlineCount(): number { return this.onts.filter(o => o.status !== 'online').length; }

  // ── Delete ────────────────────────────────────────────────────────────────
  openDelete(ont: any): void {
    this.selectedOnt = ont;
    this.deleteModal = true;
  }

  /**
   * Resultado de una operación contra la OLT.
   *
   * El backend responde 200 aunque la OLT haya rechazado: el resultado viene
   * en el cuerpo. Mostrar cualquier respuesta como éxito hacía que un borrado
   * fallido se viera igual que uno bueno —modal cerrado, mensaje en verde— y
   * la ONT seguía ahí.
   */
  private resultado(res: any, alSalirBien: () => void, textoPorDefecto: string): void {
    if (res?.error !== 0) {
      this.toast.error(res?.message || 'La OLT no pudo completar la operación.');
      return;
    }

    this.toast.success(res.message || textoPorDefecto);
    alSalirBien();
  }

  confirmDelete(): void {
    if (!this.selectedOltId || !this.selectedOnt) return;
    this.processing = true;
    const d = { fsp: this.selectedOnt.fsp, ont_id: this.selectedOnt.ont_id };
    this.oltService.deleteONT(this.selectedOltId, d).subscribe({
      next: (res: any) => {
        this.processing = false;

        this.resultado(res, () => {
          this.deleteModal = false;
          this.loadOnts(true);
        }, 'ONT eliminada.');
      },
      error: (err: any) => {
        this.processing = false;
        this.toast.error(err?.error?.message || 'No se pudo contactar la OLT.');
      },
    });
  }

  // ── Detail (SP + señal) ───────────────────────────────────────────────────
  openDetail(ont: any): void {
    this.detailOnt   = ont;
    this.detailPorts = [];
    this.detailInfo  = null;
    this.detailModal = true;
    this.loadingDetail = true;

    let pending = 2;
    const done = () => { pending--; if (pending === 0) this.loadingDetail = false; };

    // Service ports frescos desde la OLT
    this.oltService.getServicePorts(this.selectedOltId!, ont.fsp, ont.ont_id).subscribe({
      next: (res) => { this.detailPorts = res.data ?? []; done(); },
      error: () => done(),
    });

    // Señal óptica
    this.oltService.getOntInfo(this.selectedOltId!, ont.fsp, ont.ont_id).subscribe({
      next: (res) => { this.detailInfo = res.data ?? null; done(); },
      error: () => done(),
    });
  }

  // ── Assign client ─────────────────────────────────────────────────────────
  openAssign(ont: any): void {
    this.assignOnt       = ont;
    this.clientSearch    = '';
    this.clientResults   = [];
    this.selectedClient  = ont.assigned_client ?? null;
    this.assignModal     = true;
  }

  onClientSearch(): void {
    if (this.clientSearch.trim().length >= 2) {
      this.search$.next(this.clientSearch.trim());
    } else {
      this.clientResults = [];
    }
  }

  selectClient(client: any): void {
    this.selectedClient  = client;
    this.clientSearch    = `${client.names} ${client.lastname}`;
    this.clientResults   = [];
  }

  confirmAssign(): void {
    if (!this.assignOnt || !this.selectedOltId) return;
    this.assigning = true;
    this.oltService.assignClientToOnt(
      this.selectedOltId, this.assignOnt.fsp, this.assignOnt.ont_id,
      this.selectedClient?.id ?? null,
    ).subscribe({
      next: (res) => {
        this.assigning = false;

        this.resultado(res, () => {
          this.assignModal = false;
          const idx = this.onts.findIndex(o => o.fsp === this.assignOnt.fsp && o.ont_id === this.assignOnt.ont_id);
          if (idx >= 0) {
            this.onts[idx] = { ...this.onts[idx], assigned_client: this.selectedClient, user_data_id: this.selectedClient?.id ?? null };
          }
        }, 'Cliente asignado a la ONT.');
      },
      error: (err) => {
        this.assigning = false;
        this.toast.error(err?.error?.message || 'Error al asignar cliente');
      },
    });
  }

  removeAssign(): void {
    if (!this.assignOnt || !this.selectedOltId) return;
    this.assigning = true;
    this.oltService.assignClientToOnt(this.selectedOltId, this.assignOnt.fsp, this.assignOnt.ont_id, null).subscribe({
      next: (res) => {
        this.assigning = false;

        this.resultado(res, () => {
          this.assignModal = false;
          const idx = this.onts.findIndex(o => o.fsp === this.assignOnt.fsp && o.ont_id === this.assignOnt.ont_id);
          if (idx >= 0) {
            this.onts[idx] = { ...this.onts[idx], assigned_client: null, user_data_id: null };
          }
        }, 'Cliente desvinculado de la ONT.');
      },
      error: (err) => {
        this.assigning = false;
        this.toast.error(err?.error?.message || 'Error');
      },
    });
  }

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }

  statusClass(status: string): string {
    return status === 'online'
      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  }

  rxTone(v: number | null | undefined): string {
    if (v == null) return '';
    if (v >= -20) return 'is-ok';
    if (v >= -27) return 'is-warn';
    return 'is-danger';
  }

  rxClass(v: number | null | undefined): string {
    if (v == null) return 'text-gray-400';
    if (v >= -20) return 'text-green-600 dark:text-green-400 font-semibold';
    if (v >= -27) return 'text-yellow-600 dark:text-yellow-400 font-semibold';
    return 'text-red-600 dark:text-red-400 font-semibold';
  }
  /** El barrido óptico de toda la OLT, para la columna de señal. */
  /** Vuelve a preguntar por la señal mientras el servidor mide. */
  private reintentoSenal: any = null;

  cargarSenal(refrescar = false): void {
    if (!this.selectedOltId) return;

    this.cargandoSenal = true;
    const olt = this.selectedOltId;

    this.oltService.getSenal(olt, refrescar).subscribe({
      next: (res) => {
        if (olt !== this.selectedOltId) return;
        const data = res?.data;

        // El barrido corre en el servidor: mientras mide se muestra la última
        // medición (si hay) y se vuelve a preguntar en un rato.
        if (data?.midiendo) {
          clearTimeout(this.reintentoSenal);
          this.reintentoSenal = setTimeout(() => this.cargarSenal(), 20000);
          // A la ventana de tareas: sigue aunque se cambie de pestaña.
          this.tareas.seguirMedicion(olt, this.olts.find(o => o.id === olt)?.name ?? 'OLT', () => this.oltService.getSenal(olt));
        }

        this.cargandoSenal = !!data?.midiendo && !data?.onts?.length;
        if (!data?.onts?.length && data?.midiendo) return;

        const mapa: Record<string, any> = {};

        for (const o of data?.onts ?? []) mapa[`${o.fsp}:${o.ont_id}`] = o;

        this.senalPorOnt = mapa;
      },
      error: () => { this.cargandoSenal = false; },
    });
  }

  senalDe(ont: any): any { return this.senalPorOnt[`${ont?.fsp}:${ont?.ont_id}`] ?? null; }

  potenciaDe(ont: any): number | null { return this.senalDe(ont)?.potencia ?? null; }

  estadoDeSenal(ont: any): string { return this.senalDe(ont)?.estado ?? 'sin_dato'; }

  tonoDeSenal(ont: any): string {
    return {
      buena: 'is-ok', regular: 'is-warn', baja: 'is-warn',
      critica: 'is-danger', saturada: 'is-danger', sin_dato: '',
    }[this.estadoDeSenal(ont)] ?? '';
  }

  etiquetaDeSenal(ont: any): string {
    return {
      buena: 'Buena', regular: 'Regular', baja: 'Baja',
      critica: 'Crítica', saturada: 'Saturada', sin_dato: 'Sin medir',
    }[this.estadoDeSenal(ont)] ?? '—';
  }

  get hayMedicionesDeSenal(): boolean { return Object.keys(this.senalPorOnt).length > 0; }

  get cuantasConFalla(): number {
    return this.onts.filter(o => ['baja', 'critica', 'saturada'].includes(this.estadoDeSenal(o))).length;
  }

}
