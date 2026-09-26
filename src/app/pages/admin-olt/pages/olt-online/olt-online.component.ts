import { Component, OnInit, inject } from '@angular/core';
import { OltElegida } from '../../shared/olt-elegida';
import { TareasEnSegundoPlanoService } from '../../../../services/tareas-en-segundo-plano.service';
import { CommonModule } from '@angular/common';
import { OltNavComponent } from '../../shared/olt-nav.component';
import { MedicionSenalComponent } from '../../shared/medicion-senal.component';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OltService } from '../../../../services/olt.service';
import { ToastService } from '../../../../services/toast.service';
import { NpSelectComponent, PresentacionSelect } from '../../../../common/np-select/np-select.component';
import { PRESENTACION_OLTS, PRESENTACION_POR_PAGINA, conValor } from '../../../../common/np-select/presentaciones';

@Component({
  selector: 'app-olt-online',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent, OltNavComponent, MedicionSenalComponent],
  templateUrl: './olt-online.component.html',
  styleUrls: ['../../shared/olt.scss', '../../shared/olt-movil.scss'],
  host: { class: 'np-console' },
})
export class OltOnlineComponent implements OnInit {

  /** Marca, modelo, IP y acceso de cada OLT; en el modelo queda el id, como antes. */
  readonly presOlts = conValor(PRESENTACION_OLTS, o => o.id);
  readonly presPorPagina = PRESENTACION_POR_PAGINA;

  /** Puertos PON: cuántas ONT en línea tiene cada uno, con barra frente al más cargado. */
  readonly presPuertos: PresentacionSelect<string> = {
    valor: p => p,
    etiqueta: p => p,
    prefijo: () => 'PON',
    insignia: p => {
      const { total } = this.puertos();
      const n = total[p] ?? 0;
      return { texto: `${n} en línea`, tono: 'ok', proporcion: n / Math.max(1, ...Object.values(total)) };
    },
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

  // Detail modal
  detailModal           = false;
  detailOnt: any        = null;
  detailPorts: any[]    = [];
  detailInfo: any       = null;
  loadingDetail         = false;

  /**
   * Potencia de cada ONT, indexada por "fsp:id".
   *
   * Viene del barrido óptico de la OLT —una sola consulta para toda la red—,
   * así que la lista puede mostrar la señal de cada cliente sin abrir su
   * detalle, que es lo que obligaba a entrar de a una.
   */
  senalPorOnt: Record<string, any> = {};
  cargandoSenal = false;

  /** Sólo las ONT cuya señal está por debajo del umbral. */
  soloConFalla = false;

  constructor(
    private oltService: OltService,
    private toast: ToastService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    // El tab Estado enlaza aquí con el puerto ya elegido.
    const puerto = this.route.snapshot.queryParamMap.get('puerto');
    if (puerto) this.filterPort = puerto;

    this.loadOlts();
  }

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
    this.onts        = [];
    this.lastFetched = null;
    this.filterPort  = '';
    this.page        = 1;
    this.senalPorOnt = {};
    if (this.selectedOltId) this.loadOnts();
  }

  loadOnts(): void {
    if (!this.selectedOltId) return;
    this.loadingOnts = true;
    this.oltService.getAuthorizedONTs(this.selectedOltId).subscribe({
      next: (res) => {
        this.loadingOnts = false;
        this.onts        = (res.data ?? []).filter((o: any) => o.status === 'online');
        this.lastFetched = new Date();
        this.cargarSenal();
      },
      error: (err) => {
        this.loadingOnts = false;
        this.toast.error(err?.error?.message || 'Error al cargar ONTs');
      },
    });
  }

  /** El barrido óptico de toda la OLT, para la columna de señal. */
  /** Vuelve a preguntar por la señal mientras el servidor mide. */
  private reintentoSenal: any = null;
  private tareas = inject(TareasEnSegundoPlanoService);

  /** Hora de la medición de señal que se ve, y si hay una en curso. */
  senalMedidaEn: string | null = null;
  midiendoSenal = false;

  /** Lo único que lanza un barrido de señal de la OLT. */
  medirSenal(): void { this.cargarSenal(true); }

  cargarSenal(refrescar = false): void {
    if (!this.selectedOltId) return;

    this.cargandoSenal = true;
    const olt = this.selectedOltId;

    this.oltService.getSenal(olt, refrescar).subscribe({
      next: (res) => {
        if (olt !== this.selectedOltId) return;
        const data = res?.data;

        // De cuándo es lo que se ve. Abrir la pantalla no mide: sólo «Medir ahora».
        this.senalMedidaEn = data?.medido_en ?? null;
        this.midiendoSenal = !!data?.midiendo;

        // El barrido corre en el servidor: mientras mide se muestra la última
        // medición (si hay) y se vuelve a preguntar en un rato.
        if (data?.midiendo) {
          clearTimeout(this.reintentoSenal);
          this.reintentoSenal = setTimeout(() => this.cargarSenal(), 20000);
          // A la ventana de tareas sólo la que pidió el usuario: sigue aunque se cambie de pestaña.
          if (refrescar) this.tareas.seguirMedicion(olt, this.olts.find(o => o.id === olt)?.name ?? 'OLT', () => this.oltService.getSenal(olt));
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

  /**
   * Temperatura, voltaje y láser: de la medición de la OLT o, si no los trae
   * (las ZTE no los dan por SNMP), de la ficha de la ONT, que los lee por consola.
   */
  optica(campo: 'temperatura' | 'voltaje' | 'corriente'): number | null {
    return this.senalDe(this.detailOnt)?.[campo] ?? this.detailInfo?.[campo] ?? null;
  }

  senalDe(ont: any): any { return this.senalPorOnt[`${ont.fsp}:${ont.ont_id}`] ?? null; }

  /**
   * Lo leído en vivo al abrir la ficha, para la ONT abierta: una recién
   * autorizada no está en la última medición de la OLT y salía sin potencia.
   */
  private enVivo(ont: any): any {
    return ont && this.detailOnt && ont === this.detailOnt ? this.detailInfo : null;
  }

  potenciaDe(ont: any): number | null { return this.senalDe(ont)?.potencia ?? this.enVivo(ont)?.potencia ?? null; }

  estadoDeSenal(ont: any): string { return this.senalDe(ont)?.estado ?? this.enVivo(ont)?.estado ?? 'sin_dato'; }

  tonoDeSenal(ont: any): string {
    return {
      buena: 'is-ok', regular: 'is-warn', baja: 'is-warn',
      critica: 'is-danger', saturada: 'is-danger', sin_dato: '',
    }[this.estadoDeSenal(ont)] ?? '';
  }

  get hayMedicionesDeSenal(): boolean { return Object.keys(this.senalPorOnt).length > 0; }

  etiquetaDeSenal(ont: any): string {
    return {
      buena: 'Buena', regular: 'Regular', baja: 'Baja',
      critica: 'Crítica', saturada: 'Saturada', sin_dato: 'Sin medir',
    }[this.estadoDeSenal(ont)] ?? '—';
  }

  /** Cuántas de las ONT en línea tienen la señal por debajo del umbral. */
  get cuantasConFalla(): number {
    return this.onts.filter(o => ['baja', 'critica', 'saturada'].includes(this.estadoDeSenal(o))).length;
  }

  // ── Detail: service-ports + señal óptica ─────────────────────────────────
  openDetail(ont: any): void {
    this.detailOnt   = ont;
    this.detailPorts = [];
    this.detailInfo  = null;
    this.detailModal = true;
    this.loadingDetail = true;

    let pending = 2;
    const done = () => { pending--; if (pending === 0) this.loadingDetail = false; };

    this.oltService.getServicePorts(this.selectedOltId!, ont.fsp, ont.ont_id).subscribe({
      next: (res) => { this.detailPorts = res.data ?? []; done(); },
      error: () => done(),
    });

    this.oltService.getOntInfo(this.selectedOltId!, ont.fsp, ont.ont_id).subscribe({
      next: (res) => {
        this.detailInfo = res.data ?? null;
        // El estado en vivo corrige la fila (la guardada puede ser del alta).
        if (this.detailInfo?.status && this.detailOnt) this.detailOnt.status = this.detailInfo.status;
        done();
      },
      error: () => done(),
    });
  }

  get uniquePorts(): string[] { return this.puertos().lista; }

  /**
   * Puertos y cuántas ONT tiene cada uno, armados una vez por lista: con un
   * arreglo nuevo en cada revisión el selector recalculaba sus opciones sin parar.
   */
  private puertosDe: { onts: any[] | null; lista: string[]; total: Record<string, number> } = { onts: null, lista: [], total: {} };

  private puertos() {
    if (this.puertosDe.onts !== this.onts) {
      const total: Record<string, number> = {};
      for (const o of this.onts) {
        if (o.fsp) total[o.fsp] = (total[o.fsp] ?? 0) + 1;
      }
      this.puertosDe = { onts: this.onts, lista: Object.keys(total).sort(), total };
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

  selectedOltName(): string {
    return this.olts.find(o => o.id === this.selectedOltId)?.name ?? '';
  }
}
