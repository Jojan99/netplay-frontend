import { Component, AfterViewInit, OnDestroy, NgZone, PLATFORM_ID, ElementRef, inject, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MapaRedService, PuntoRed, ClienteMapa, EstadoCliente } from '../../services/mapa-red.service';
import { AuthService } from '../../services/auth.service';
import { DialogService } from '../../services/dialog.service';
import { EmployeeService } from '../../services/employee.service';
import { EchoService } from '../../services/echo.service';
import { ThemeService } from '../../services/theme.service';
import { SanitizeHtmlPipe } from '../../common/pipes/sanitize-html.pipe';
import { coincide } from '../../common/busqueda';
import { estiloWaze, ATRIBUCION_WAZE } from './estilo-waze';

type Modo = null | 'olt' | 'nap' | 'cliente';
type Pestana = 'problemas' | 'sin_ubicar' | 'puntos';
type TipoAlerta = 'falla' | 'caido' | 'senal';
/** Alturas de la hoja inferior en el teléfono: asomada, a la mitad o entera. */
type Hoja = 'peek' | 'half' | 'full';

interface Borrador {
  id?: number; tipo: 'olt' | 'nap'; nombre: string; lat: number; lng: number;
  olt_id: number | null; fsp: string; capacidad: number | null; nota: string;
}

/** Una caja (o un puerto PON sin caja) con clientes en problemas: el «reporte» estilo Waze. */
export interface Alerta {
  clave: string; tipo: TipoAlerta; titulo: string; detalle: string; etiqueta: string;
  n: number; caidos: number; falla: number; senal: number;
  lat: number | null; lng: number | null; punto: PuntoRed | null; fsp: string | null;
}

/** Técnico tal como lo devuelve technician-locations (y el canal en vivo). */
interface Tecnico {
  id: number; first_name: string; last_name: string; job_title: string | null;
  latitude: string | number | null; longitude: string | number | null; last_location_update: string | null;
}

interface Resultado {
  tipo: 'cliente' | 'punto'; id: number; titulo: string; detalle: string; color: string;
  cliente?: ClienteMapa; punto?: PuntoRed;
}

/** Cómo se pinta cada estado, del más grave al más leve. */
export const ESTADOS: { clave: EstadoCliente; label: string; color: string }[] = [
  { clave: 'caido',      label: 'Caído',           color: '#dc2626' },
  { clave: 'falla',      label: 'Falla de sector', color: '#9333ea' },
  { clave: 'senal',      label: 'Señal baja',      color: '#f59e0b' },
  { clave: 'suspendido', label: 'Suspendido',      color: '#64748b' },
  { clave: 'ok',         label: 'Bien',            color: '#10b981' },
  { clave: 'sin_ont',    label: 'Sin ONT',         color: '#cbd5e1' },
];
const PROBLEMA: EstadoCliente[] = ['caido', 'falla', 'senal'];

/** Iconos de las alertas (van dentro de los pines, que se dibujan fuera de Angular). */
export const ICONO_ALERTA: Record<TipoAlerta, string> = {
  falla: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  caido: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5M3 3l18 18"/></svg>',
  senal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/></svg>',
};
const SEVERIDAD: TipoAlerta[] = ['falla', 'caido', 'senal'];
/** Un técnico cuenta como «cerca» si mandó su posición hace 30 min o menos. */
const TECNICO_FRESCO_MIN = 30;

/**
 * Mapa de la red: OLT, cajas NAP y clientes con el color de su estado (caído, falla de
 * sector, señal baja, suspendido) para ver de un vistazo dónde está una falla.
 *
 * Se siente como Waze: fondo de calles claro u oscuro según el tema del panel, un buscador
 * flotante sobre el mapa, «reportes» (pines de alerta) en cada caja con problemas, los
 * técnicos en vivo como avatares, los clientes agrupados en
 * burbujas cuando se aleja y, en el teléfono, la lista como una hoja que sube desde abajo.
 *
 * La plataforma no sabía dónde está cada cosa: el administrador pone las OLT y las cajas
 * tocando el mapa, y ubica a cada cliente (o sólo lo cuelga de su caja). Un cliente sin
 * coordenadas pero con caja cuenta para el color de la caja.
 */
@Component({
  selector: 'app-mapa-red',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SanitizeHtmlPipe],
  templateUrl: './mapa-red.component.html',
  styleUrl: './mapa-red.component.scss',
  host: { class: 'np-console' },
})
export class MapaRedComponent implements AfterViewInit, OnDestroy {
  private svc = inject(MapaRedService);
  private dialog = inject(DialogService);
  private empleados = inject(EmployeeService);
  private echo = inject(EchoService);
  private tema = inject(ThemeService);
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);
  readonly esAdmin = inject(AuthService).isAdmin();
  readonly estados = ESTADOS;
  readonly iconoAlerta = ICONO_ALERTA;

  puntos: PuntoRed[] = [];
  clientes: ClienteMapa[] = [];
  olts: { id: number; nombre: string }[] = [];
  alertas: Alerta[] = [];
  medidoEn: string | null = null;
  cargando = true;
  error = '';

  filtro: EstadoCliente | 'todos' | 'problemas' = 'todos';
  pestana: Pestana = 'problemas';
  busqueda = '';                  // filtra la lista abierta en el panel
  busquedaMapa = '';              // el buscador flotante sobre el mapa
  resultados: Resultado[] = [];
  buscarAbierto = false;
  modo: Modo = null;
  editando = false;               // arrastrar puntos y clientes para corregir su posición
  borrador: Borrador | null = null;
  ubicando: ClienteMapa | null = null;
  ubicandoNap: number | null = null;
  ubicandoPos: { lat: number; lng: number } | null = null;
  seleccion: PuntoRed | null = null;
  guardando = false;
  aviso = '';
  mapStyle: 'streets' | 'satellite' = 'streets';

  /* Técnicos en vivo */
  tecnicos: Tecnico[] = [];
  tecnicosVisibles = true;
  tecnicosDisponibles = false;    // true cuando el servidor contestó la primera vez (si no tiene el módulo, no hay capa)

  /* Hoja inferior (teléfono) */
  hoja: Hoja = 'peek';
  arrastrandoHoja = false;

  private L: any = null;
  private map: any = null;
  private tiles: any = null;
  private maplibreGL: ((opciones: any) => any) | null = null;   // la fábrica de la capa vectorial (null si no cargó)
  private vectorFallo = false;        // la capa vectorial no pudo dibujarse: se queda con OpenStreetMap
  private capaClientes: any = null;   // clientes sueltos (modo Mover)
  private cluster: any = null;        // clientes agrupados
  private capaPuntos: any = null;
  private capaLineas: any = null;
  private capaAlertas: any = null;
  private capaTecnicos: any = null;
  private marcasCliente = new Map<number, any>();
  private marcasTecnico = new Map<number, any>();
  private marcaTemporal: any = null;
  private primeraVez = true;
  private intervalo: any = null;
  private intervaloTecnicos: any = null;
  private observador: ResizeObserver | null = null;
  private alResize = () => this.ajustarAltoMovil();
  private cerrarBusquedaTimer: any = null;
  private unidoAlCanal = false;
  private destruido = false;
  private hojaInicio: { y: number; alto: number } | null = null;
  private hojaAltoArrastre = 0;

  /** Colombia entera: el encuadre de arranque mientras no haya nada que mostrar. */
  private static readonly COLOMBIA: [[number, number], [number, number]] = [[-4.3, -79.1], [12.6, -66.8]];

  constructor() {
    // El fondo de calles sigue al tema del panel: claro o nocturno, y cambia con el botón del tema.
    effect(() => { this.tema.isDark(); if (this.map && this.mapStyle === 'streets') this.aplicarFondo(); });
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const leaflet = await import('leaflet');
    this.L = leaflet.default ?? leaflet;
    // El plugin de agrupación se engancha al L global: tiene que ser el mismo que usamos.
    (window as any).L = this.L;
    await import('leaflet.markercluster');
    await this.cargarMapLibre();
    if (this.destruido) return;
    this.zone.runOutsideAngular(() => {
      this.map = this.L.map('mapa-red', { zoomControl: false, maxZoom: 20 });
      this.map.fitBounds(MapaRedComponent.COLOMBIA, { padding: [10, 10] });
      this.aplicarFondo();
      // Zoom y escala abajo a la derecha, con la atribución: arriba va el buscador y la leyenda ocupa la esquina izquierda.
      this.L.control.zoom({ position: 'bottomright' }).addTo(this.map);
      this.L.control.scale({ imperial: false, position: 'bottomright' }).addTo(this.map);
      this.capaLineas = this.L.layerGroup().addTo(this.map);
      this.capaClientes = this.L.layerGroup().addTo(this.map);
      this.cluster = this.L.markerClusterGroup({
        disableClusteringAtZoom: 17, maxClusterRadius: 60, showCoverageOnHover: false,
        spiderfyOnMaxZoom: false, zoomToBoundsOnClick: true, chunkedLoading: true,
        iconCreateFunction: (c: any) => this.iconoCluster(c),
      }).addTo(this.map);
      this.capaPuntos = this.L.layerGroup().addTo(this.map);
      this.capaAlertas = this.L.layerGroup().addTo(this.map);
      this.capaTecnicos = this.L.layerGroup().addTo(this.map);
      this.map.on('click', (e: any) => this.zone.run(() => this.tocarMapa(e.latlng.lat, e.latlng.lng)));
      // El recuadro cambia de tamaño sin que cambie la ventana (la ficha se apila, el
      // tema aprieta la cabecera): Leaflet sólo escucha «resize» de la ventana.
      const caja = document.getElementById('mapa-red');
      if (caja && typeof ResizeObserver !== 'undefined') {
        this.observador = new ResizeObserver(() => this.map?.invalidateSize());
        this.observador.observe(caja);
      }
      window.addEventListener('resize', this.alResize);
      this.ajustarAltoMovil();
      this.ponerAltoHoja();
    });
    this.cargar();
    this.cargarTecnicos();
    // El estado cambia con la revisión de la OLT (cada 15 min): se refresca sin molestar.
    this.intervalo = setInterval(() => { if (!this.modo && !this.borrador && !this.guardando) this.cargar(true); }, 120000);
    // Los técnicos llegan por el canal en vivo; el sondeo es el respaldo por si se cae.
    this.intervaloTecnicos = setInterval(() => this.cargarTecnicos(), 30000);
  }

  ngOnDestroy(): void {
    this.destruido = true;
    if (this.intervalo) clearInterval(this.intervalo);
    if (this.intervaloTecnicos) clearInterval(this.intervaloTecnicos);
    if (this.cerrarBusquedaTimer) clearTimeout(this.cerrarBusquedaTimer);
    this.observador?.disconnect();
    if (isPlatformBrowser(this.platformId)) window.removeEventListener('resize', this.alResize);
    if (this.unidoAlCanal) this.echo.leave('technician-tracking');
    this.map?.remove();
  }

  /* ── Datos ───────────────────────────────────────────────────── */
  cargar(silencioso = false): void {
    if (!silencioso) this.cargando = true;
    this.svc.datos().subscribe({
      next: (r: any) => this.zone.run(() => {
        const d = r?.data ?? {};
        this.puntos = d.puntos ?? [];
        this.clientes = d.clientes ?? [];
        this.olts = d.olts ?? [];
        this.medidoEn = d.medido_en ?? null;
        if (this.seleccion) this.seleccion = this.puntos.find(p => p.id === this.seleccion!.id) ?? null;
        this.cargando = false;
        this.error = '';
        this.dibujar();
        if (this.primeraVez) { this.primeraVez = false; this.encuadrar(true); this.ajustarAltoMovil(); }
      }),
      error: () => this.zone.run(() => { this.cargando = false; this.error = 'No se pudo cargar el mapa.'; }),
    });
  }

  /* ── Conteos y listas ────────────────────────────────────────── */
  cuenta(e: EstadoCliente): number { return this.clientes.filter(c => c.estado === e).length; }
  get problemas(): number { return this.clientes.filter(c => PROBLEMA.includes(c.estado)).length; }
  get ubicados(): number { return this.clientes.filter(c => c.lat !== null).length; }
  get naps(): PuntoRed[] { return this.puntos.filter(p => p.tipo === 'nap'); }

  private pasaFiltro(c: ClienteMapa): boolean {
    if (this.filtro === 'todos') return true;
    if (this.filtro === 'problemas') return PROBLEMA.includes(c.estado);
    return c.estado === this.filtro;
  }

  get listaProblemas(): ClienteMapa[] {
    const orden = (e: EstadoCliente) => PROBLEMA.indexOf(e);
    return this.clientes
      .filter(c => PROBLEMA.includes(c.estado))
      .filter(c => coincide(this.busqueda, c.nombre, c.documento, c.direccion, c.fsp, this.nombreNap(c.nap_id)))
      .sort((a, b) => orden(a.estado) - orden(b.estado) || (a.fsp ?? '').localeCompare(b.fsp ?? ''));
  }

  get listaSinUbicar(): ClienteMapa[] {
    return this.clientes
      .filter(c => c.lat === null)
      .filter(c => coincide(this.busqueda, c.nombre, c.documento, c.direccion))
      .slice(0, 200);
  }

  get sinUbicarTotal(): number { return this.clientes.filter(c => c.lat === null).length; }

  get listaPuntos(): PuntoRed[] {
    return this.puntos.filter(p => coincide(this.busqueda, p.nombre, p.fsp, this.nombreOlt(p.olt_id)));
  }

  /** Las alertas que se muestran en el panel, filtradas por lo que se escribió. */
  get listaAlertas(): Alerta[] {
    return this.alertas.filter(a => coincide(this.busqueda, a.titulo, a.detalle, a.fsp));
  }

  /** Resumen de una línea para la hoja asomada del teléfono. */
  get resumenAlertas(): string {
    const partes: string[] = [];
    const f = this.alertas.filter(a => a.tipo === 'falla').length;
    const c = this.cuenta('caido'), s = this.cuenta('senal');
    if (f) partes.push(`${f} ${f === 1 ? 'falla de sector' : 'fallas de sector'}`);
    if (c) partes.push(`${c} ${c === 1 ? 'caído' : 'caídos'}`);
    if (s) partes.push(`${s} con señal baja`);
    return partes.length ? partes.join(' · ') : 'Sin problemas en la red';
  }

  clientesDe(p: PuntoRed): ClienteMapa[] { return this.clientes.filter(c => c.nap_id === p.id); }

  /** Los del mismo puerto PON que todavía no tienen caja: candidatos a colgar de esta. */
  delPuertoSinCaja(p: PuntoRed): ClienteMapa[] {
    if (!p.olt_id || !p.fsp) return [];
    return this.clientes.filter(c => c.nap_id === null && c.olt_id === p.olt_id && c.fsp === p.fsp);
  }

  estadoDeCaja(p: PuntoRed): EstadoCliente | null {
    if (p.falla) return 'falla';
    const suyos = this.clientesDe(p).map(c => c.estado);
    return PROBLEMA.find(e => suyos.includes(e)) ?? (suyos.length ? 'ok' : null);
  }

  conteoCaja(p: PuntoRed): { estado: EstadoCliente; label: string; color: string; n: number }[] {
    const suyos = this.clientesDe(p);
    return ESTADOS.map(e => ({ estado: e.clave, label: e.label, color: e.color, n: suyos.filter(c => c.estado === e.clave).length })).filter(x => x.n);
  }

  color(e: EstadoCliente | null): string { return ESTADOS.find(x => x.clave === e)?.color ?? '#94a3b8'; }
  label(e: EstadoCliente): string { return ESTADOS.find(x => x.clave === e)?.label ?? e; }
  nombreNap(id: number | null): string { return id ? (this.puntos.find(p => p.id === id)?.nombre ?? '') : ''; }
  nombreOlt(id: number | null): string { return id ? (this.olts.find(o => o.id === id)?.nombre ?? `OLT ${id}`) : ''; }
  puerto(c: { olt_id: number | null; fsp: string | null; ont_id?: number | null }): string {
    if (!c.olt_id) return 'Sin ONT';
    return `${this.nombreOlt(c.olt_id)} · ${c.fsp ?? '?'}${c.ont_id !== undefined && c.ont_id !== null ? ':' + c.ont_id : ''}`;
  }
  alertaDe(p: PuntoRed | null): Alerta | null { return p ? (this.alertas.find(a => a.punto?.id === p.id) ?? null) : null; }

  /* ── Alertas (los «reportes») ────────────────────────────────── */
  /**
   * Una alerta por caja con problemas y una por puerto PON (OLT + fsp) para los clientes
   * con problemas que no cuelgan de ninguna caja. Ordenadas de la más grave a la más leve.
   */
  private calcularAlertas(): Alerta[] {
    const lista: Alerta[] = [];
    const armar = (suyos: ClienteMapa[], fallaPuerto: boolean) => {
      const caidos = suyos.filter(c => c.estado === 'caido').length;
      const falla = suyos.filter(c => c.estado === 'falla').length;
      const senal = suyos.filter(c => c.estado === 'senal').length;
      const tipo: TipoAlerta | null = fallaPuerto || falla ? 'falla' : caidos ? 'caido' : senal ? 'senal' : null;
      if (!tipo) return null;
      const n = caidos + falla + senal;
      const etiqueta = tipo === 'falla' ? `Falla de sector · ${n || suyos.length}`
        : tipo === 'caido' ? `${caidos} ${caidos === 1 ? 'caído' : 'caídos'}`
        : `${senal} con señal baja`;
      return { tipo, n, caidos, falla, senal, etiqueta };
    };
    for (const p of this.naps) {
      const suyos = this.clientesDe(p);
      const a = armar(suyos, p.falla);
      if (!a) continue;
      lista.push({
        ...a, clave: `nap-${p.id}`, titulo: `Caja ${p.nombre}`, lat: p.lat, lng: p.lng, punto: p, fsp: p.fsp,
        detalle: [p.olt_id ? this.nombreOlt(p.olt_id) : '', p.fsp ? `puerto ${p.fsp}` : '', `${suyos.length} cliente(s)`].filter(Boolean).join(' · '),
      });
    }
    // Sin caja: se agrupan por puerto. El pin va en el centro de los que están ubicados.
    const porPuerto = new Map<string, ClienteMapa[]>();
    for (const c of this.clientes) {
      if (c.nap_id !== null || !PROBLEMA.includes(c.estado) || !c.olt_id) continue;
      const k = `${c.olt_id}|${c.fsp ?? '?'}`;
      porPuerto.set(k, [...(porPuerto.get(k) ?? []), c]);
    }
    porPuerto.forEach((suyos, k) => {
      const a = armar(suyos, false);
      if (!a) return;
      const [oltId, fsp] = k.split('|');
      const ubicados = suyos.filter(c => c.lat !== null);
      const lat = ubicados.length ? ubicados.reduce((s, c) => s + c.lat!, 0) / ubicados.length : null;
      const lng = ubicados.length ? ubicados.reduce((s, c) => s + c.lng!, 0) / ubicados.length : null;
      lista.push({
        ...a, clave: `puerto-${k}`, titulo: `Puerto ${fsp} · ${this.nombreOlt(Number(oltId))}`, lat, lng, punto: null, fsp,
        detalle: `${suyos.length} cliente(s) sin caja${ubicados.length ? '' : ' · sin ubicar'}`,
      });
    });
    return lista.sort((x, y) => SEVERIDAD.indexOf(x.tipo) - SEVERIDAD.indexOf(y.tipo) || y.n - x.n);
  }

  colorAlerta(t: TipoAlerta): string { return this.color(t); }

  irAlerta(a: Alerta): void {
    if (a.punto) { this.seleccionar(a.punto); return; }
    // Un puerto sin caja: se filtra la lista a ese puerto y, si hay ubicados, se vuela al centro.
    this.pestana = 'problemas';
    this.busqueda = a.fsp ?? '';
    if (a.lat !== null && a.lng !== null) this.volar(a.lat, a.lng, 16);
    if (this.hoja === 'peek') this.hoja = 'half';
  }

  /* ── Fondo del mapa ──────────────────────────────────────────── */
  private get oscuro(): boolean { return this.tema.isDark(); }

  /**
   * El fondo de calles estilo Waze son teselas vectoriales (OpenFreeMap) dibujadas con
   * MapLibre dentro de Leaflet. Se carga aparte y después de Leaflet: el plugin se cuelga
   * del L global (el mismo de las burbujas) y de window.maplibregl. Si algo falla (sin
   * WebGL, sin red), el mapa sigue con las imágenes de OpenStreetMap: nunca queda en blanco.
   */
  private async cargarMapLibre(): Promise<void> {
    try {
      if (!this.hayWebGL()) throw new Error('El navegador no tiene WebGL');
      const modulo: any = await import('maplibre-gl');
      const maplibregl = modulo.default ?? modulo;
      if (typeof maplibregl.supported === 'function' && !maplibregl.supported()) throw new Error('MapLibre no está soportado');
      (window as any).maplibregl = maplibregl;
      const plugin: any = await import('@maplibre/maplibre-gl-leaflet');
      this.maplibreGL = plugin.maplibreGL ?? plugin.default ?? this.L.maplibreGL ?? null;
    } catch (e) {
      console.warn('Mapa de la red: sin fondo vectorial, se usa OpenStreetMap.', e);
      this.maplibreGL = null;
    }
  }

  private hayWebGL(): boolean {
    try {
      const lienzo = document.createElement('canvas');
      return !!(lienzo.getContext('webgl2') || lienzo.getContext('webgl'));
    } catch { return false; }
  }

  /**
   * Fuera de Angular: el mapa GL se dibuja con requestAnimationFrame cuadro a cuadro y, si
   * se creara desde el efecto del tema o desde el botón, cada cuadro dispararía la
   * detección de cambios del panel entero.
   */
  private aplicarFondo(): void { this.zone.runOutsideAngular(() => this.pintarFondo()); }

  private pintarFondo(): void {
    // El fondo vectorial ya está y sólo cambió el tema: se le cambia el estilo, sin recrearlo.
    if (this.mapStyle === 'streets' && this.tiles?.getMaplibreMap) {
      try { this.tiles.getMaplibreMap()?.setStyle(estiloWaze(this.oscuro)); return; } catch { /* se recrea abajo */ }
    }
    try { this.tiles?.remove(); } catch { /* una capa a medio crear */ }
    this.tiles = null;
    if (this.mapStyle === 'satellite') {
      this.tiles = this.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri, Maxar, Earthstar Geographics', maxZoom: 20, maxNativeZoom: 19 });
      this.tiles.addTo(this.map);
      return;
    }
    if (this.maplibreGL && !this.vectorFallo) {
      const capa = this.maplibreGL({ style: estiloWaze(this.oscuro), attributionControl: { customAttribution: ATRIBUCION_WAZE }, maxZoom: 20 });
      try {
        capa.addTo(this.map);   // acá se crea el mapa GL: sin WebGL lanza error
        const gl = capa.getMaplibreMap();
        let cargado = false;
        gl.once('style.load', () => { cargado = true; });
        // Un error antes de que llegue el estilo (sin red hacia OpenFreeMap) = no hay fondo: se vuelve a OSM.
        gl.on('error', (e: any) => {
          if (cargado || this.tiles !== capa || this.destruido) return;
          console.warn('Mapa de la red: el fondo vectorial no cargó, se usa OpenStreetMap.', e?.error ?? e);
          this.vectorFallo = true;
          this.aplicarFondo();
        });
        this.tiles = capa;
        return;
      } catch (e) {
        console.warn('Mapa de la red: no se pudo dibujar el fondo vectorial, se usa OpenStreetMap.', e);
        this.vectorFallo = true;
        // Quedó a medio añadir: se saca del mapa sin pasar por su onRemove (que tropieza con el mapa GL que no existe).
        capa.onRemove = () => { capa.getContainer?.()?.remove(); };
        try { this.map.removeLayer(capa); } catch { /* nada que sacar */ }
      }
    }
    // Respaldo: OpenStreetMap en imágenes (no pide clave). En modo oscuro se oscurece con un filtro (ver el SCSS).
    this.tiles = this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 20, maxNativeZoom: 19, className: this.oscuro ? 'mr-fondo-oscuro' : 'mr-fondo-claro',
    });
    this.tiles.addTo(this.map);
  }
  cambiarFondo(): void { this.mapStyle = this.mapStyle === 'streets' ? 'satellite' : 'streets'; this.aplicarFondo(); }

  /** Burbuja de un grupo de clientes, del color del peor estado que hay adentro. */
  private iconoCluster(c: any): any {
    const estados: EstadoCliente[] = c.getAllChildMarkers().map((m: any) => m.options.estado as EstadoCliente);
    const peor = ESTADOS.find(e => estados.includes(e.clave))?.clave ?? 'ok';
    const n = c.getChildCount();
    const tam = n < 10 ? 36 : n < 100 ? 42 : 48;
    const grave = PROBLEMA.includes(peor) ? ' is-grave' : '';
    return this.L.divIcon({
      className: '', html: `<div class="mr-cluster${grave}" style="--c:${this.color(peor)};width:${tam}px;height:${tam}px"><b>${n}</b></div>`,
      iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2],
    });
  }

  dibujar(): void {
    this.alertas = this.calcularAlertas();
    if (!this.map) return;
    this.capaClientes.clearLayers();
    this.cluster.clearLayers();
    this.capaPuntos.clearLayers();
    this.capaLineas.clearLayers();
    this.capaAlertas.clearLayers();
    this.marcasCliente.clear();

    // Caja → OLT de la que cuelga.
    const oltDe = new Map<number, PuntoRed>();
    this.puntos.filter(p => p.tipo === 'olt' && p.olt_id).forEach(p => oltDe.set(p.olt_id!, p));
    for (const n of this.naps) {
      const o = n.olt_id ? oltDe.get(n.olt_id) : null;
      if (o) this.L.polyline([[o.lat, o.lng], [n.lat, n.lng]], { color: '#475569', weight: 2, opacity: .45, dashArray: '6 6', interactive: false }).addTo(this.capaLineas);
    }

    // Clientes de la caja seleccionada → su caja.
    if (this.seleccion?.tipo === 'nap') {
      for (const c of this.clientesDe(this.seleccion)) {
        if (c.lat !== null) this.L.polyline([[this.seleccion.lat, this.seleccion.lng], [c.lat, c.lng!]], { color: this.color(c.estado), weight: 1.5, opacity: .8, interactive: false }).addTo(this.capaLineas);
      }
    }

    // Mientras se mueven, van sueltos: así se arrastran sin que el grupo se meta.
    const destino = this.editando && this.esAdmin ? this.capaClientes : this.cluster;
    const marcas: any[] = [];
    for (const c of this.clientes) {
      if (c.lat === null || c.lng === null || !this.pasaFiltro(c)) continue;
      const grave = PROBLEMA.includes(c.estado);
      const icono = this.L.divIcon({
        className: '',
        html: `<span class="mr-cli${grave ? ' is-grave' : ''}" style="background:${this.color(c.estado)};--c:${this.color(c.estado)}"></span>`,
        iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -6],
      });
      const m = this.L.marker([c.lat, c.lng], { icon: icono, draggable: this.editando && this.esAdmin, zIndexOffset: grave ? 500 : 0, estado: c.estado })
        .bindPopup(this.popupCliente(c));
      m.on('dragend', (e: any) => this.zone.run(() => this.moverCliente(c, e.target.getLatLng())));
      this.marcasCliente.set(c.id, m);
      marcas.push(m);
    }
    if (destino === this.cluster) this.cluster.addLayers(marcas); else marcas.forEach(m => m.addTo(this.capaClientes));

    for (const p of this.puntos) {
      const estado = p.tipo === 'nap' ? this.estadoDeCaja(p) : null;
      const n = p.tipo === 'nap' ? this.clientesDe(p).length : 0;
      const conAlerta = p.tipo === 'nap' && this.alertas.some(a => a.punto?.id === p.id && a.tipo !== 'senal');
      const html = p.tipo === 'olt'
        ? `<div class="mr-olt${this.seleccion?.id === p.id ? ' is-sel' : ''}">OLT</div>`
        : `<div class="mr-nap${this.seleccion?.id === p.id ? ' is-sel' : ''}${estado && PROBLEMA.includes(estado) ? ' is-grave' : ''}" style="border-color:${this.color(estado)};--c:${this.color(estado)}"><b>${n}</b></div>`;
      const tam = p.tipo === 'olt' ? 40 : 30;
      const icono = this.L.divIcon({ className: '', html, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2], popupAnchor: [0, -tam / 2] });
      const m = this.L.marker([p.lat, p.lng], { icon: icono, draggable: this.editando && this.esAdmin, zIndexOffset: 1000, title: p.nombre })
        // Con un pin de alerta encima, el nombre va debajo para no taparlo.
        .bindTooltip(p.nombre, { direction: conAlerta ? 'bottom' : 'top', offset: [0, conAlerta ? tam / 2 : -tam / 2] })
        .addTo(this.capaPuntos);
      m.on('click', () => this.zone.run(() => this.seleccionar(p, false)));
      m.on('dragend', (e: any) => this.zone.run(() => this.moverPunto(p, e.target.getLatLng())));
    }

    // Los «reportes»: un pin flotando sobre cada caja (o puerto) con falla o caídos.
    for (const a of this.alertas) {
      if (a.lat === null || a.lng === null || a.tipo === 'senal') continue;
      const html = `<div class="mr-alerta is-${a.tipo}" style="--c:${this.color(a.tipo)}"><i>${ICONO_ALERTA[a.tipo]}</i><span>${this.escapar(a.etiqueta)}</span></div>`;
      const m = this.L.marker([a.lat, a.lng], {
        icon: this.L.divIcon({ className: 'mr-alerta-pin', html, iconSize: [0, 0], iconAnchor: [0, 0] }),
        zIndexOffset: 2000, interactive: true, keyboard: false,
      }).addTo(this.capaAlertas);
      m.on('click', () => this.zone.run(() => this.irAlerta(a)));
    }
  }

  private escapar(s: any): string {
    return String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch]);
  }

  private popupCliente(c: ClienteMapa): string {
    const esc = (s: any) => this.escapar(s);
    const pot = c.potencia !== null ? ` · ${c.potencia.toFixed(1)} dBm` : '';
    const caja = this.nombreNap(c.nap_id);
    return `<div class="mr-pop"><b>${esc(c.nombre)}</b>`
      + `<span class="mr-pop-st" style="color:${this.color(c.estado)}">${this.label(c.estado)}${pot}</span>`
      + `<small>${esc(this.puerto(c))}${caja ? ' · Caja ' + esc(caja) : ''}</small>`
      + (c.direccion ? `<small>${esc(c.direccion)}</small>` : '')
      + `<div class="mr-pop-acc"><a href="/dashboard/usuario?cliente=${c.id}">Abrir ficha</a>`
      + `</div></div>`;
  }


  encuadrar(alCargar = false): void {
    const pts: [number, number][] = [
      ...this.puntos.map(p => [p.lat, p.lng] as [number, number]),
      ...this.clientes.filter(c => c.lat !== null && this.pasaFiltro(c)).map(c => [c.lat!, c.lng!] as [number, number]),
    ];
    if (pts.length) { this.map.flyToBounds(this.L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17, duration: .8 }); return; }
    // Sin nada ubicado todavía: el país entero y, al abrir, donde está quien lo abre.
    this.map.fitBounds(MapaRedComponent.COLOMBIA, { padding: [10, 10] });
    if (alCargar && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => this.map.setView([pos.coords.latitude, pos.coords.longitude], 15), () => {}, { timeout: 5000 });
    }
  }

  /** Centra el mapa en quien lo mira, como el botón de «mi ubicación» de Waze. */
  miUbicacion(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => this.volar(pos.coords.latitude, pos.coords.longitude, Math.max(this.map.getZoom(), 16)), () => {}, { timeout: 8000 });
  }

  private volar(lat: number, lng: number, zoom: number): void {
    this.map.flyTo([lat, lng], zoom, { duration: .8 });
  }

  cambiarFiltro(f: EstadoCliente | 'todos' | 'problemas'): void { this.filtro = f; this.dibujar(); }
  cambiarEdicion(): void { this.editando = !this.editando; this.dibujar(); }

  /* ── Buscador flotante ───────────────────────────────────────── */
  buscarEnMapa(): void {
    const q = this.busquedaMapa.trim();
    this.buscarAbierto = true;
    if (!q) { this.resultados = []; return; }
    const puntos: Resultado[] = this.puntos
      .filter(p => coincide(q, p.nombre, p.fsp, this.nombreOlt(p.olt_id)))
      .slice(0, 6)
      .map(p => ({
        tipo: 'punto', id: p.id, punto: p, color: p.tipo === 'olt' ? '#1e293b' : this.color(this.estadoDeCaja(p)),
        titulo: `${p.tipo === 'olt' ? 'OLT' : 'Caja'} ${p.nombre}`,
        detalle: [p.olt_id ? this.nombreOlt(p.olt_id) : '', p.fsp ? `puerto ${p.fsp}` : '', p.tipo === 'nap' ? `${this.clientesDe(p).length} cliente(s)` : ''].filter(Boolean).join(' · '),
      }));
    const clientes: Resultado[] = this.clientes
      .filter(c => coincide(q, c.nombre, c.documento, c.direccion))
      .slice(0, 8)
      .map(c => ({
        tipo: 'cliente', id: c.id, cliente: c, color: this.color(c.estado), titulo: c.nombre,
        detalle: [this.label(c.estado), c.direccion, c.nap_id ? `caja ${this.nombreNap(c.nap_id)}` : (c.lat === null ? 'sin ubicar' : '')].filter(Boolean).join(' · '),
      }));
    this.resultados = [...puntos, ...clientes];
  }

  elegirResultado(r: Resultado): void {
    this.buscarAbierto = false;
    this.busquedaMapa = r.titulo;
    if (r.punto) this.seleccionar(r.punto);
    else if (r.cliente) this.irACliente(r.cliente);
  }

  limpiarBusquedaMapa(): void { this.busquedaMapa = ''; this.resultados = []; this.buscarAbierto = false; }

  /** El desplegable se cierra un instante después de salir del cuadro: da tiempo al clic en un resultado. */
  cerrarBusquedaLuego(): void {
    if (this.cerrarBusquedaTimer) clearTimeout(this.cerrarBusquedaTimer);
    this.cerrarBusquedaTimer = setTimeout(() => this.zone.run(() => { this.buscarAbierto = false; }), 160);
  }

  /* ── Técnicos en vivo ────────────────────────────────────────── */
  private cargarTecnicos(): void {
    if (this.destruido) return;
    // Hasta 24 h: los viejos se ven en gris; «cerca» sólo cuentan los de los últimos 30 min.
    this.empleados.getTechnicianLocations(1440).subscribe({
      next: (r: any) => this.zone.run(() => {
        this.tecnicos = r?.data ?? [];
        if (!this.tecnicosDisponibles) { this.tecnicosDisponibles = true; this.unirseAlCanal(); }
        this.dibujarTecnicos();
      }),
      // Sin el módulo de técnicos (403) o sin servicio: simplemente no hay capa. No se insiste.
      error: () => this.zone.run(() => {
        this.tecnicosDisponibles = false;
        this.tecnicos = [];
        if (this.intervaloTecnicos) { clearInterval(this.intervaloTecnicos); this.intervaloTecnicos = null; }
        this.capaTecnicos?.clearLayers();
      }),
    });
  }

  private unirseAlCanal(): void {
    if (this.destruido || this.unidoAlCanal) return;
    const echo = this.echo.instance;
    if (!echo) { setTimeout(() => this.unirseAlCanal(), 800); return; }
    this.unidoAlCanal = true;
    echo.channel('technician-tracking').listen('.technician.location.updated', (d: any) => this.zone.run(() => {
      const id = Number(d.employee_id);
      const t = this.tecnicos.find(x => x.id === id);
      const cuando = d.updated_at || new Date().toISOString();
      if (t) { t.latitude = d.latitude; t.longitude = d.longitude; t.last_location_update = cuando; }
      else this.tecnicos = [...this.tecnicos, { id, first_name: d.first_name, last_name: d.last_name, job_title: d.job_title, latitude: d.latitude, longitude: d.longitude, last_location_update: cuando }];
      this.dibujarTecnicos();
    }));
  }

  cambiarTecnicos(): void {
    this.tecnicosVisibles = !this.tecnicosVisibles;
    if (!this.map) return;
    if (this.tecnicosVisibles) this.capaTecnicos.addTo(this.map); else this.capaTecnicos.remove();
  }

  minutosDesde(fecha: string | null): number | null {
    if (!fecha) return null;
    const ms = Date.now() - new Date(fecha).getTime();
    return ms < 0 ? 0 : Math.floor(ms / 60000);
  }
  esFresco(t: Tecnico): boolean { const m = this.minutosDesde(t.last_location_update); return m !== null && m <= TECNICO_FRESCO_MIN; }
  hace(t: Tecnico): string {
    const m = this.minutosDesde(t.last_location_update);
    if (m === null) return 'sin datos';
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    if (m < 1440) return `hace ${Math.floor(m / 60)} h`;
    return `hace ${Math.floor(m / 1440)} d`;
  }
  iniciales(t: Tecnico): string { return `${(t.first_name || 'T')[0]}${(t.last_name || '')[0] ?? ''}`.toUpperCase(); }
  private coords(t: Tecnico): [number, number] | null {
    const lat = parseFloat(String(t.latitude)), lng = parseFloat(String(t.longitude));
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
  }

  /** El técnico más cercano a un punto, entre los que mandaron posición hace poco. */
  tecnicoCercano(lat: number, lng: number): { tecnico: Tecnico; distancia: string; lat: number; lng: number } | null {
    let mejor: { tecnico: Tecnico; m: number; lat: number; lng: number } | null = null;
    for (const t of this.tecnicos) {
      if (!this.esFresco(t)) continue;
      const c = this.coords(t);
      if (!c) continue;
      const m = this.metros(lat, lng, c[0], c[1]);
      if (!mejor || m < mejor.m) mejor = { tecnico: t, m, lat: c[0], lng: c[1] };
    }
    return mejor ? { tecnico: mejor.tecnico, distancia: this.distancia(mejor.m), lat: mejor.lat, lng: mejor.lng } : null;
  }

  distancia(m: number): string { return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`; }

  private dibujarTecnicos(): void {
    if (!this.map) return;
    const vistos = new Set<number>();
    for (const t of this.tecnicos) {
      const c = this.coords(t);
      if (!c) continue;
      vistos.add(t.id);
      const fresco = this.esFresco(t);
      const html = `<div class="mr-tec${fresco ? ' is-fresco' : ''}"><span>${this.escapar(this.iniciales(t))}</span><i></i></div>`;
      const icono = this.L.divIcon({ className: '', html, iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16] });
      const nombre = `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim();
      const popup = `<div class="mr-pop"><b>${this.escapar(nombre)}</b><small>${this.escapar(t.job_title || 'Técnico')}</small>`
        + `<span class="mr-pop-st" style="color:${fresco ? '#059669' : '#64748b'}">${fresco ? 'En vivo' : 'Sin señal'} · ${this.hace(t)}</span>`
        + `</div>`;
      const existente = this.marcasTecnico.get(t.id);
      if (existente) existente.setLatLng(c).setIcon(icono).setPopupContent(popup);
      else {
        const m = this.L.marker(c, { icon: icono, zIndexOffset: 1500, riseOnHover: true })
          .bindTooltip(nombre, { direction: 'top', offset: [0, -16] })
          .bindPopup(popup).addTo(this.capaTecnicos);
        this.marcasTecnico.set(t.id, m);
      }
    }
    this.marcasTecnico.forEach((m, id) => { if (!vistos.has(id)) { m.remove(); this.marcasTecnico.delete(id); } });
  }

  /* ── Hoja inferior (teléfono) ────────────────────────────────── */
  private get esMovil(): boolean { return isPlatformBrowser(this.platformId) && window.matchMedia('(max-width: 1000px)').matches; }

  /**
   * En el teléfono el mapa llena lo que queda de pantalla debajo de la cabecera (el
   * <main> es lo que scrollea), y la lista va como una hoja encima. Sin esto, el mapa
   * quedaba en un recuadro de 60 vh con la lista apilada debajo.
   */
  private ajustarAltoMovil(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const ws = this.el.nativeElement.querySelector('.np-mapared-ws') as HTMLElement | null;
    if (!ws) return;
    if (!this.esMovil) { ws.style.height = ''; return; }
    const main = ws.closest('main') as HTMLElement | null;
    const alto = main ? main.clientHeight : window.innerHeight;
    const top = main ? ws.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop : ws.getBoundingClientRect().top;
    ws.style.height = `${Math.max(420, Math.floor(alto - top - 24))}px`;
    this.ponerAltoHoja();
  }

  private altoHoja(h: Hoja): number {
    const ws = this.el.nativeElement.querySelector('.np-mapared-ws') as HTMLElement | null;
    const total = ws?.clientHeight || 600;
    return h === 'peek' ? 128 : h === 'half' ? Math.round(total * .5) : total - 64;
  }

  /** La altura de la hoja también la lee el CSS (--mr-hoja) para subir la atribución del mapa. */
  private ponerAltoHoja(px?: number): void {
    const ws = this.el.nativeElement.querySelector('.np-mapared-ws') as HTMLElement | null;
    ws?.style.setProperty('--mr-hoja', `${px ?? this.altoHoja(this.hoja)}px`);
  }

  ponerHoja(h: Hoja): void { this.hoja = h; this.ponerAltoHoja(); }
  alternarHoja(): void { this.ponerHoja(this.hoja === 'peek' ? 'half' : this.hoja === 'half' ? 'full' : 'peek'); }

  hojaInicioArrastre(e: PointerEvent): void {
    if (!this.esMovil) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.hojaInicio = { y: e.clientY, alto: this.altoHoja(this.hoja) };
    this.hojaAltoArrastre = this.hojaInicio.alto;
    this.arrastrandoHoja = true;
  }
  hojaArrastre(e: PointerEvent): void {
    if (!this.hojaInicio) return;
    const max = this.altoHoja('full');
    this.hojaAltoArrastre = Math.min(max, Math.max(80, this.hojaInicio.alto + (this.hojaInicio.y - e.clientY)));
    this.ponerAltoHoja(this.hojaAltoArrastre);
  }
  hojaFinArrastre(e: PointerEvent): void {
    if (!this.hojaInicio) return;
    const movido = Math.abs(e.clientY - this.hojaInicio.y);
    this.hojaInicio = null;
    this.arrastrandoHoja = false;
    if (movido < 6) { this.alternarHoja(); return; }
    // Se queda en la altura más cercana a donde se soltó.
    const opciones: Hoja[] = ['peek', 'half', 'full'];
    const mejor = opciones.reduce((a, b) => Math.abs(this.altoHoja(b) - this.hojaAltoArrastre) < Math.abs(this.altoHoja(a) - this.hojaAltoArrastre) ? b : a);
    this.ponerHoja(mejor);
  }

  /* ── Selección ───────────────────────────────────────────────── */
  seleccionar(p: PuntoRed, centrar = true): void {
    if (this.modo) return;
    this.seleccion = p;
    this.borrador = null;
    this.pestana = 'puntos';
    if (centrar) this.volar(p.lat, p.lng, Math.max(this.map.getZoom(), 17));
    if (this.hoja === 'peek') this.ponerHoja('half');
    this.dibujar();
  }

  cerrarSeleccion(): void { this.seleccion = null; this.dibujar(); }

  irACliente(c: ClienteMapa): void {
    if (c.lat !== null) {
      this.volar(c.lat, c.lng!, 18);
      const m = this.marcasCliente.get(c.id);
      // Al llegar ya no está agrupado (el grupo se deshace desde el zoom 17): ahí se abre su ficha.
      if (m) this.map.once('moveend', () => { if (this.map.hasLayer(m)) m.openPopup(); });
      if (this.esMovil) this.ponerHoja('peek');
      return;
    }
    const caja = this.puntos.find(p => p.id === c.nap_id);
    if (caja) this.seleccionar(caja);
  }

  /* ── Poner y mover ───────────────────────────────────────────── */
  empezar(modo: 'olt' | 'nap'): void {
    this.cancelar();
    this.modo = modo;
    if (this.esMovil) this.ponerHoja('peek');
  }

  empezarUbicar(c: ClienteMapa): void {
    this.cancelar();
    this.modo = 'cliente';
    this.ubicando = c;
    this.ubicandoNap = c.nap_id;
    if (this.esMovil) this.ponerHoja('peek');
  }

  cancelar(): void {
    this.modo = null;
    this.borrador = null;
    this.ubicando = null;
    this.ubicandoPos = null;
    this.aviso = '';
    this.marcaTemporal?.remove();
    this.marcaTemporal = null;
  }

  private tocarMapa(lat: number, lng: number): void {
    if (this.modo === 'olt' || this.modo === 'nap') {
      const tipo = this.modo;
      this.borrador = {
        tipo, lat, lng, nombre: tipo === 'nap' ? `NAP ${this.naps.length + 1}` : (this.olts[0]?.nombre ?? 'OLT'),
        olt_id: this.olts.length === 1 ? this.olts[0].id : null, fsp: '', capacidad: tipo === 'nap' ? 16 : null, nota: '',
      };
      this.modo = null;
      this.pestana = 'puntos';
      this.seleccion = null;
      this.ponerMarcaTemporal(lat, lng);
      if (this.hoja === 'peek') this.ponerHoja('half');
    } else if (this.modo === 'cliente' && this.ubicando) {
      this.ubicandoPos = { lat, lng };
      // La caja más cercana (dentro de 300 m) como sugerencia, si no tenía una.
      if (!this.ubicandoNap) this.ubicandoNap = this.napCercana(lat, lng, 300)?.id ?? null;
      this.ponerMarcaTemporal(lat, lng);
      if (this.hoja === 'peek') this.ponerHoja('half');
    }
  }

  private ponerMarcaTemporal(lat: number, lng: number): void {
    this.marcaTemporal?.remove();
    this.marcaTemporal = this.L.marker([lat, lng], {
      icon: this.L.divIcon({ className: '', html: '<span class="mr-temp"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }),
      draggable: true, zIndexOffset: 3000,
    }).addTo(this.map);
    this.marcaTemporal.on('dragend', (e: any) => this.zone.run(() => {
      const ll = e.target.getLatLng();
      if (this.borrador) { this.borrador.lat = ll.lat; this.borrador.lng = ll.lng; }
      if (this.ubicandoPos) this.ubicandoPos = { lat: ll.lat, lng: ll.lng };
    }));
  }

  private napCercana(lat: number, lng: number, maxMetros: number): PuntoRed | null {
    let mejor: PuntoRed | null = null;
    let dist = maxMetros;
    for (const n of this.naps) {
      const d = this.metros(lat, lng, n.lat, n.lng);
      if (d <= dist) { dist = d; mejor = n; }
    }
    return mejor;
  }

  private metros(a1: number, o1: number, a2: number, o2: number): number {
    const r = (x: number) => x * Math.PI / 180;
    const h = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(h));
  }

  editarPunto(p: PuntoRed): void {
    this.cancelar();
    this.borrador = { id: p.id, tipo: p.tipo, nombre: p.nombre, lat: p.lat, lng: p.lng, olt_id: p.olt_id, fsp: p.fsp ?? '', capacidad: p.capacidad, nota: p.nota ?? '' };
    if (this.hoja === 'peek') this.ponerHoja('half');
  }

  guardarPunto(): void {
    const b = this.borrador;
    if (!b || this.guardando) return;
    if (!b.nombre.trim()) { this.aviso = 'Escriba un nombre.'; return; }
    if (b.fsp && !/^\d+\/\d+\/\d+$/.test(b.fsp.trim())) { this.aviso = 'El puerto PON va como 0/0/3.'; return; }
    this.guardando = true;
    const datos = { tipo: b.tipo, nombre: b.nombre.trim(), lat: b.lat, lng: b.lng, olt_id: b.olt_id, fsp: b.fsp.trim() || null, capacidad: b.capacidad, nota: b.nota.trim() || null };
    const pedido = b.id ? this.svc.editarPunto(b.id, datos) : this.svc.crearPunto(datos);
    pedido.subscribe({
      next: (r: any) => {
        this.guardando = false;
        if (r?.error) { this.aviso = r.message || 'No se pudo guardar.'; return; }
        const id = r?.data?.id ?? b.id;
        this.cancelar();
        this.svc.datos().subscribe(x => {
          this.puntos = x?.data?.puntos ?? this.puntos;
          this.clientes = x?.data?.clientes ?? this.clientes;
          this.seleccion = this.puntos.find(p => p.id === id) ?? null;
          this.dibujar();
        });
      },
      error: (e: any) => { this.guardando = false; this.aviso = e?.error?.message || 'No se pudo guardar.'; },
    });
  }

  async borrarPunto(p: PuntoRed): Promise<void> {
    const n = this.clientesDe(p).length;
    const extra = n ? ` Sus ${n} cliente(s) quedan sin caja (no se borran).` : '';
    if (!await this.dialog.confirm(`¿Borrar ${p.tipo === 'olt' ? 'la OLT' : 'la caja'} «${p.nombre}» del mapa?${extra}`, { okLabel: 'Sí, borrar' })) return;
    this.svc.borrarPunto(p.id).subscribe(() => { this.seleccion = null; this.borrador = null; this.cargar(true); });
  }

  private moverPunto(p: PuntoRed, ll: any): void {
    this.svc.editarPunto(p.id, { tipo: p.tipo, nombre: p.nombre, lat: ll.lat, lng: ll.lng, olt_id: p.olt_id, fsp: p.fsp, capacidad: p.capacidad, nota: p.nota })
      .subscribe(() => { p.lat = ll.lat; p.lng = ll.lng; this.dibujar(); });
  }

  private moverCliente(c: ClienteMapa, ll: any): void {
    this.svc.ubicarCliente(c.id, ll.lat, ll.lng, c.nap_id).subscribe(() => { c.lat = ll.lat; c.lng = ll.lng; this.dibujar(); });
  }

  guardarUbicacion(): void {
    const c = this.ubicando;
    if (!c || this.guardando) return;
    const pos = this.ubicandoPos ?? (c.lat !== null ? { lat: c.lat, lng: c.lng! } : null);
    this.guardando = true;
    this.svc.ubicarCliente(c.id, pos?.lat ?? null, pos?.lng ?? null, this.ubicandoNap).subscribe({
      next: (r: any) => {
        this.guardando = false;
        if (r?.error) { this.aviso = r.message || 'No se pudo guardar.'; return; }
        c.lat = pos?.lat ?? null; c.lng = pos?.lng ?? null; c.nap_id = this.ubicandoNap;
        this.cancelar();
        this.dibujar();
      },
      error: () => { this.guardando = false; },
    });
  }

  /** Cuelga de la caja a un cliente del mismo puerto, sin moverlo de donde esté. */
  colgar(c: ClienteMapa, p: PuntoRed): void {
    this.svc.ubicarCliente(c.id, c.lat, c.lng, p.id).subscribe((r: any) => {
      if (r?.error) return;
      c.nap_id = p.id;
      this.dibujar();
    });
  }

  async quitar(c: ClienteMapa): Promise<void> {
    if (!await this.dialog.confirm(`¿Quitar a ${c.nombre} del mapa y de su caja?`, { okLabel: 'Sí, quitar' })) return;
    this.svc.quitarCliente(c.id).subscribe(() => { c.lat = null; c.lng = null; c.nap_id = null; this.dibujar(); });
  }

  trackId(_: number, x: { id: number }): number { return x.id; }
  trackClave(_: number, x: { clave: string }): string { return x.clave; }
}
