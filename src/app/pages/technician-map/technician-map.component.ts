import { Component, AfterViewInit, OnDestroy, NgZone, PLATFORM_ID, ElementRef, inject, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';
import { EchoService } from '../../services/echo.service';
import { ThemeService } from '../../services/theme.service';
import { MapaRedService } from '../../services/mapa-red.service';
import { coincide } from '../../common/busqueda';
import { estiloWaze, ATRIBUCION_WAZE } from '../mapa-red/estilo-waze';

/** Qué tan fresca es la última posición: en vivo (≤ 5 min), reciente (≤ 30 min) o sin señal. */
type Frescura = 'live' | 'recent' | 'stale';
type Filtro = 'todos' | 'activos' | Frescura;
/** Alturas de la hoja inferior en el teléfono: asomada, a la mitad o entera. */
type Hoja = 'peek' | 'half' | 'full';

/** Técnico tal como lo devuelve technician-locations (y el canal en vivo). */
interface Tecnico {
  id: number; first_name: string; last_name: string; job_title: string | null;
  latitude: string | number | null; longitude: string | number | null; last_location_update: string | null;
}

/** 30 días: así también se ve quién dejó de compartir su ubicación, no sólo quien está en línea. */
const VENTANA_MIN = 43200;
const EN_VIVO_MIN = 5;
const RECIENTE_MIN = 30;
/** Cuántas posiciones guarda el rastro de cada técnico. */
const RASTRO_MAX = 30;

/**
 * Mapa de técnicos en tiempo real: cada técnico con la app abierta envía su posición
 * (LocationTrackerService) y acá se ve como un avatar con sus iniciales, con un anillo
 * que dice qué tan fresca es (en vivo, reciente, sin señal) y el rastro de por dónde
 * pasó. Llega por el canal `technician-tracking`; el sondeo cada 20 s es el respaldo.
 *
 * Se ve igual que el mapa de la red: fondo de calles estilo Waze que sigue al tema del
 * panel, buscador flotante, botones redondos a la derecha y, en el teléfono, la lista
 * como una hoja que sube desde abajo.
 */
@Component({
  selector: 'app-technician-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './technician-map.component.html',
  styleUrl: './technician-map.component.scss',
  host: { class: 'np-console' },
})
export class TechnicianMapComponent implements AfterViewInit, OnDestroy {
  private empleados = inject(EmployeeService);
  private echo = inject(EchoService);
  private red = inject(MapaRedService);
  private tema = inject(ThemeService);
  private el = inject<ElementRef<HTMLElement>>(ElementRef);
  private zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);

  tecnicos: Tecnico[] = [];
  ultimaActualizacion: Date | null = null;
  cargando = true;
  error = '';
  filtro: Filtro = 'todos';
  busqueda = '';                  // filtra la lista del panel
  busquedaMapa = '';              // el buscador flotante sobre el mapa
  resultados: Tecnico[] = [];
  buscarAbierto = false;
  seleccion: Tecnico | null = null;
  siguiendo: number | null = null;  // técnico seguido: el mapa lo centra en cada actualización
  autoEncuadre = true;              // encuadrar a todos al recibir datos (hasta que el usuario mueva el mapa)
  mapStyle: 'streets' | 'satellite' = 'streets';

  /* Capa tenue con los clientes del mapa de la red (opcional, se carga al pedirla) */
  clientesVisibles = false;
  clientesDisponibles = true;     // false si el servidor no la da (sin el módulo): el botón se esconde
  clientesCargando = false;

  /* Hoja inferior (teléfono) */
  hoja: Hoja = 'peek';
  arrastrandoHoja = false;

  private L: any = null;
  private map: any = null;
  private tiles: any = null;
  private maplibreGL: ((opciones: any) => any) | null = null;   // la fábrica de la capa vectorial (null si no cargó)
  private vectorFallo = false;        // la capa vectorial no pudo dibujarse: se queda con OpenStreetMap
  private capaRastros: any = null;
  private capaTecnicos: any = null;
  private capaClientes: any = null;
  private lienzoClientes: any = null;
  private clientesCargados = false;
  private marcas = new Map<number, any>();
  private rastros = new Map<number, any>();
  private historial = new Map<number, [number, number][]>();
  private intervalo: any = null;
  private reloj: any = null;          // refresca «hace X min» y los colores aunque no llegue nada
  private canalTimer: any = null;
  private cerrarBusquedaTimer: any = null;
  private observador: ResizeObserver | null = null;
  private alResize = () => this.ajustarAltoMovil();
  private unidoAlCanal = false;
  private destruido = false;
  private primeraVez = true;
  private hojaInicio: { y: number; alto: number } | null = null;
  private hojaAltoArrastre = 0;

  /** Colombia entera: el encuadre de arranque mientras no haya nadie que mostrar. */
  private static readonly COLOMBIA: [[number, number], [number, number]] = [[-4.3, -79.1], [12.6, -66.8]];

  constructor() {
    // El fondo de calles sigue al tema del panel: claro o nocturno, y cambia con el botón del tema.
    effect(() => { this.tema.isDark(); if (this.map && this.mapStyle === 'streets') this.aplicarFondo(); });
  }

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const leaflet = await import('leaflet');
    this.L = leaflet.default ?? leaflet;
    // El plugin del fondo vectorial se engancha al L global: tiene que ser el mismo que usamos.
    (window as any).L = this.L;
    await this.cargarMapLibre();
    if (this.destruido) return;
    this.zone.runOutsideAngular(() => {
      this.map = this.L.map('technician-map', { zoomControl: false, maxZoom: 20 });
      this.map.fitBounds(TechnicianMapComponent.COLOMBIA, { padding: [10, 10] });
      this.aplicarFondo();
      // Zoom y escala abajo a la derecha, con la atribución: arriba va el buscador y la leyenda ocupa la esquina izquierda.
      this.L.control.zoom({ position: 'bottomright' }).addTo(this.map);
      this.L.control.scale({ imperial: false, position: 'bottomright' }).addTo(this.map);
      this.capaClientes = this.L.layerGroup();          // se añade al mapa sólo cuando se pide
      this.capaRastros = this.L.layerGroup().addTo(this.map);
      this.capaTecnicos = this.L.layerGroup().addTo(this.map);
      // Si el usuario mueve el mapa, se deja de encuadrar solo en cada actualización.
      this.map.on('dragstart', () => this.zone.run(() => { this.autoEncuadre = false; }));
      // El recuadro cambia de tamaño sin que cambie la ventana (la hoja sube, el tema
      // aprieta la cabecera): Leaflet sólo escucha «resize» de la ventana.
      const caja = document.getElementById('technician-map');
      if (caja && typeof ResizeObserver !== 'undefined') {
        this.observador = new ResizeObserver(() => this.map?.invalidateSize());
        this.observador.observe(caja);
      }
      window.addEventListener('resize', this.alResize);
      this.ajustarAltoMovil();
      this.ponerAltoHoja();
    });
    this.cargar();
    this.unirseAlCanal();
    // Las posiciones llegan por el canal en vivo; el sondeo es el respaldo por si se cae.
    this.intervalo = setInterval(() => this.cargar(true), 20000);
    this.reloj = setInterval(() => this.zone.run(() => { this.tecnicos = [...this.tecnicos]; this.dibujar(); }), 30000);
  }

  ngOnDestroy(): void {
    this.destruido = true;
    if (this.intervalo) clearInterval(this.intervalo);
    if (this.reloj) clearInterval(this.reloj);
    if (this.canalTimer) clearTimeout(this.canalTimer);
    if (this.cerrarBusquedaTimer) clearTimeout(this.cerrarBusquedaTimer);
    this.observador?.disconnect();
    if (isPlatformBrowser(this.platformId)) window.removeEventListener('resize', this.alResize);
    this.echo.leave('technician-tracking');
    this.map?.remove();
  }

  /* ── Datos ───────────────────────────────────────────────────── */
  cargar(silencioso = false): void {
    if (this.destruido) return;
    if (!silencioso) this.cargando = true;
    this.empleados.getTechnicianLocations(VENTANA_MIN).subscribe({
      next: (r: any) => this.zone.run(() => {
        this.tecnicos = r?.data ?? [];
        this.ultimaActualizacion = new Date();
        this.cargando = false;
        this.error = '';
        if (this.seleccion) this.seleccion = this.tecnicos.find(t => t.id === this.seleccion!.id) ?? null;
        this.dibujar();
        if (this.primeraVez) { this.primeraVez = false; this.encuadrar(true); this.ajustarAltoMovil(); }
        else if (this.autoEncuadre && !this.siguiendo) this.encuadrar();
      }),
      error: () => this.zone.run(() => { this.cargando = false; this.error = 'No se pudieron cargar las ubicaciones.'; }),
    });
  }

  private unirseAlCanal(): void {
    if (this.destruido || this.unidoAlCanal) return;
    const echo = this.echo.instance;
    if (!echo) { this.canalTimer = setTimeout(() => this.unirseAlCanal(), 800); return; }
    this.unidoAlCanal = true;
    echo.channel('technician-tracking').listen('.technician.location.updated', (d: any) => this.zone.run(() => {
      this.ultimaActualizacion = new Date();
      this.actualizarUno(d);
    }));
  }

  private actualizarUno(d: any): void {
    const id = Number(d.employee_id);
    const cuando = d.updated_at || new Date().toISOString();
    const t = this.tecnicos.find(x => x.id === id);
    if (t) { t.latitude = d.latitude; t.longitude = d.longitude; t.last_location_update = cuando; }
    else this.tecnicos.push({ id, first_name: d.first_name, last_name: d.last_name, job_title: d.job_title, latitude: d.latitude, longitude: d.longitude, last_location_update: cuando });
    this.tecnicos = [...this.tecnicos];
    this.dibujar();
    const c = this.coords(t ?? this.tecnicos[this.tecnicos.length - 1]);
    if (this.siguiendo === id && c) this.map?.panTo(c, { animate: true });
    if (this.seleccion?.id === id) this.seleccion = this.tecnicos.find(x => x.id === id) ?? null;
  }

  /* ── Frescura y textos ───────────────────────────────────────── */
  minutosDesde(fecha: string | null): number | null {
    if (!fecha) return null;
    const ms = Date.now() - new Date(fecha).getTime();
    return isNaN(ms) ? null : ms < 0 ? 0 : Math.floor(ms / 60000);
  }

  frescura(t: Tecnico): Frescura {
    const m = this.minutosDesde(t.last_location_update);
    return m === null ? 'stale' : m <= EN_VIVO_MIN ? 'live' : m <= RECIENTE_MIN ? 'recent' : 'stale';
  }

  /** «hace 12 min», «hace 3 h», «hace 2 d», «hace 3 sem», «hace 1 mes». */
  hace(fecha: string | null): string {
    const m = this.minutosDesde(fecha);
    if (m === null) return 'sin datos';
    if (m < 1) return 'ahora';
    if (m < 60) return `hace ${m} min`;
    if (m < 1440) return `hace ${Math.floor(m / 60)} h`;
    const d = Math.floor(m / 1440);
    if (d < 7) return `hace ${d} d`;
    if (d < 30) return `hace ${Math.floor(d / 7)} sem`;
    const meses = Math.floor(d / 30);
    return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  }

  /** Desde cuándo no manda posición: «hoy 14:32», «ayer 09:10», «12 oct». */
  desde(fecha: string | null): string {
    if (!fecha) return 'nunca';
    const d = new Date(fecha);
    if (isNaN(d.getTime())) return 'nunca';
    const hoy = new Date();
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    const hora = d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
    if (d.toDateString() === hoy.toDateString()) return `hoy ${hora}`;
    if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}) });
  }

  /** El estado en palabras, para la píldora: no basta el color. */
  estado(t: Tecnico): string {
    const f = this.frescura(t);
    if (f === 'live') return 'En vivo';
    if (f === 'recent') return `Hace ${this.minutosDesde(t.last_location_update)} min`;
    return `Sin señal desde ${this.desde(t.last_location_update)}`;
  }

  clasePill(t: Tecnico): string {
    const f = this.frescura(t);
    return f === 'live' ? 'np-pill--active' : f === 'recent' ? 'np-pill--noip' : 'np-pill--neutral';
  }

  nombre(t: Tecnico): string { return `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'Técnico'; }
  iniciales(t: Tecnico): string { return `${(t.first_name || 'T')[0]}${(t.last_name || '')[0] ?? ''}`.toUpperCase(); }
  private coords(t: Tecnico | undefined): [number, number] | null {
    if (!t) return null;
    const lat = parseFloat(String(t.latitude)), lng = parseFloat(String(t.longitude));
    return isNaN(lat) || isNaN(lng) ? null : [lat, lng];
  }

  /* ── Conteos y listas ────────────────────────────────────────── */
  get enVivo(): number { return this.tecnicos.filter(t => this.frescura(t) === 'live').length; }
  get recientes(): number { return this.tecnicos.filter(t => this.frescura(t) === 'recent').length; }
  get sinSenal(): number { return this.tecnicos.filter(t => this.frescura(t) === 'stale').length; }
  /** Hay técnicos pero ninguno manda posición: toca avisarlo, no dejar el mapa gris y callado. */
  get todosSinSenal(): boolean { return this.tecnicos.length > 0 && this.sinSenal === this.tecnicos.length; }

  /** Resumen de una línea para la cabecera y la hoja asomada del teléfono. */
  get resumen(): string {
    if (!this.tecnicos.length) return 'Nadie con ubicación todavía';
    if (this.todosSinSenal) return 'Nadie comparte su ubicación ahora';
    const partes: string[] = [];
    const v = this.enVivo, r = this.recientes, s = this.sinSenal;
    if (v) partes.push(`${v} en vivo`);
    if (r) partes.push(`${r} ${r === 1 ? 'reciente' : 'recientes'}`);
    if (s) partes.push(`${s} sin señal`);
    return partes.join(' · ');
  }

  private pasaFiltro(t: Tecnico): boolean {
    if (this.filtro === 'todos') return true;
    if (this.filtro === 'activos') return this.frescura(t) !== 'stale';
    return this.frescura(t) === this.filtro;
  }

  /** La leyenda marca cada estado como visible u oculto según el filtro. */
  filtroIncluye(f: Frescura): boolean {
    return this.filtro === 'todos' || this.filtro === f || (this.filtro === 'activos' && f !== 'stale');
  }

  get lista(): Tecnico[] {
    return this.tecnicos
      .filter(t => this.pasaFiltro(t))
      .filter(t => coincide(this.busqueda, t.first_name, t.last_name, t.job_title))
      .sort((a, b) => (this.minutosDesde(a.last_location_update) ?? 1e9) - (this.minutosDesde(b.last_location_update) ?? 1e9));
  }

  cambiarFiltro(f: Filtro): void { this.filtro = f; this.dibujar(); }

  /* ── Fondo del mapa ──────────────────────────────────────────── */
  private get oscuro(): boolean { return this.tema.isDark(); }

  /**
   * El fondo de calles estilo Waze son teselas vectoriales (OpenFreeMap) dibujadas con
   * MapLibre dentro de Leaflet (el mismo estilo del mapa de la red). Se carga aparte y
   * después de Leaflet: el plugin se cuelga del L global y de window.maplibregl. Si algo
   * falla (sin WebGL, sin red), el mapa sigue con las imágenes de OpenStreetMap.
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
      console.warn('Mapa de técnicos: sin fondo vectorial, se usa OpenStreetMap.', e);
      this.maplibreGL = null;
    }
  }

  private hayWebGL(): boolean {
    try {
      const lienzo = document.createElement('canvas');
      return !!(lienzo.getContext('webgl2') || lienzo.getContext('webgl'));
    } catch { return false; }
  }

  /** Fuera de Angular: el mapa GL se dibuja cuadro a cuadro y cada cuadro dispararía la detección de cambios. */
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
          console.warn('Mapa de técnicos: el fondo vectorial no cargó, se usa OpenStreetMap.', e?.error ?? e);
          this.vectorFallo = true;
          this.aplicarFondo();
        });
        this.tiles = capa;
        return;
      } catch (e) {
        console.warn('Mapa de técnicos: no se pudo dibujar el fondo vectorial, se usa OpenStreetMap.', e);
        this.vectorFallo = true;
        // Quedó a medio añadir: se saca del mapa sin pasar por su onRemove (que tropieza con el mapa GL que no existe).
        capa.onRemove = () => { capa.getContainer?.()?.remove(); };
        try { this.map.removeLayer(capa); } catch { /* nada que sacar */ }
      }
    }
    // Respaldo: OpenStreetMap en imágenes (no pide clave). En modo oscuro se oscurece con un filtro (ver el SCSS).
    this.tiles = this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 20, maxNativeZoom: 19, className: this.oscuro ? 'tm-fondo-oscuro' : 'tm-fondo-claro',
    });
    this.tiles.addTo(this.map);
  }
  cambiarFondo(): void { this.mapStyle = this.mapStyle === 'streets' ? 'satellite' : 'streets'; this.aplicarFondo(); }

  /* ── Marcadores ──────────────────────────────────────────────── */
  private escapar(s: any): string {
    return String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[ch]);
  }

  private popup(t: Tecnico): string {
    const f = this.frescura(t);
    const esc = (s: any) => this.escapar(s);
    return `<div class="tm-pop"><b>${esc(this.nombre(t))}</b><small>${esc(t.job_title || 'Técnico')}</small>`
      + `<span class="tm-pop-st is-${f}">${esc(this.estado(t))}${f === 'stale' ? ' · última ubicación ' + esc(this.hace(t.last_location_update)) : ''}</span>`
      + `<div class="tm-pop-acc"><a class="tm-waze" href="${this.waze(t)}" target="_blank" rel="noopener">Ir con Waze</a>`
      + `<a href="${this.googleMaps(t)}" target="_blank" rel="noopener">Google Maps</a></div></div>`;
  }

  dibujar(): void {
    if (!this.map) return;
    const vistos = new Set<number>();
    for (const t of this.tecnicos) {
      const c = this.coords(t);
      if (!c) continue;
      // El rastro se guarda siempre, se vea o no: así no se pierde al filtrar.
      const h = this.historial.get(t.id) ?? [];
      const ult = h[h.length - 1];
      if (!ult || ult[0] !== c[0] || ult[1] !== c[1]) { h.push(c); if (h.length > RASTRO_MAX) h.shift(); this.historial.set(t.id, h); }
      if (!this.pasaFiltro(t)) continue;
      vistos.add(t.id);
      const f = this.frescura(t);
      const clases = `tm-tec is-${f}${this.siguiendo === t.id ? ' is-sigue' : ''}${this.seleccion?.id === t.id ? ' is-sel' : ''}`;
      const html = `<div class="${clases}"><span>${this.escapar(this.iniciales(t))}</span><i></i></div>`;
      const icono = this.L.divIcon({ className: '', html, iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -18] });
      const popup = this.popup(t);
      const existente = this.marcas.get(t.id);
      if (existente) existente.setLatLng(c).setIcon(icono).setPopupContent(popup).setZIndexOffset(f === 'live' ? 1500 : f === 'recent' ? 1000 : 500);
      else {
        const id = t.id;
        const m = this.L.marker(c, { icon: icono, zIndexOffset: f === 'live' ? 1500 : f === 'recent' ? 1000 : 500, riseOnHover: true })
          .bindTooltip(this.nombre(t), { direction: 'top', offset: [0, -18] })
          .bindPopup(popup).addTo(this.capaTecnicos);
        m.on('click', () => this.zone.run(() => { const x = this.tecnicos.find(y => y.id === id); if (x) this.seleccionar(x, false); }));
        this.marcas.set(t.id, m);
      }
      if (h.length > 1) {
        const r = this.rastros.get(t.id);
        if (r) r.setLatLngs(h);
        else this.rastros.set(t.id, this.L.polyline(h, { className: 'tm-rastro', color: '#0f766e', weight: 3, opacity: .55, dashArray: '4 6', interactive: false }).addTo(this.capaRastros));
      }
    }
    this.marcas.forEach((m, id) => { if (!vistos.has(id)) { m.remove(); this.marcas.delete(id); this.rastros.get(id)?.remove(); this.rastros.delete(id); } });
  }

  /* ── Encuadre ────────────────────────────────────────────────── */
  encuadrar(alCargar = false, animar = false): void {
    if (!this.map) return;
    const pts = Array.from(this.marcas.values()).map(m => m.getLatLng());
    if (pts.length) {
      const limites = this.L.latLngBounds(pts);
      if (animar) this.map.flyToBounds(limites, { padding: [50, 50], maxZoom: 15, duration: .8 });
      else this.map.fitBounds(limites, { padding: [50, 50], maxZoom: 15 });
      return;
    }
    // Sin nadie ubicado: el país entero y, al abrir, donde está quien lo abre.
    this.map.fitBounds(TechnicianMapComponent.COLOMBIA, { padding: [10, 10] });
    if (alCargar && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => this.map?.setView([pos.coords.latitude, pos.coords.longitude], 13), () => {}, { timeout: 5000 });
    }
  }

  verTodos(): void {
    this.autoEncuadre = true;
    this.siguiendo = null;
    this.dibujar();
    this.encuadrar(false, true);
  }

  /** Centra el mapa en quien lo mira, como el botón de «mi ubicación» de Waze. */
  miUbicacion(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => { this.autoEncuadre = false; this.volar(pos.coords.latitude, pos.coords.longitude, Math.max(this.map.getZoom(), 16)); }, () => {}, { timeout: 8000 });
  }

  private volar(lat: number, lng: number, zoom: number): void {
    this.map?.flyTo([lat, lng], zoom, { duration: .8 });
  }

  /* ── Buscador flotante ───────────────────────────────────────── */
  buscarEnMapa(): void {
    const q = this.busquedaMapa.trim();
    this.buscarAbierto = true;
    if (!q) { this.resultados = []; return; }
    this.resultados = this.tecnicos
      .filter(t => coincide(q, t.first_name, t.last_name, t.job_title))
      .sort((a, b) => (this.minutosDesde(a.last_location_update) ?? 1e9) - (this.minutosDesde(b.last_location_update) ?? 1e9))
      .slice(0, 8);
  }

  elegirResultado(t: Tecnico): void {
    this.buscarAbierto = false;
    this.busquedaMapa = this.nombre(t);
    // Si el filtro lo esconde, se abre: encontrarlo y no verlo sería un chiste.
    if (!this.pasaFiltro(t)) this.filtro = 'todos';
    this.seleccionar(t);
  }

  limpiarBusquedaMapa(): void { this.busquedaMapa = ''; this.resultados = []; this.buscarAbierto = false; }

  /** El desplegable se cierra un instante después de salir del cuadro: da tiempo al clic en un resultado. */
  cerrarBusquedaLuego(): void {
    if (this.cerrarBusquedaTimer) clearTimeout(this.cerrarBusquedaTimer);
    this.cerrarBusquedaTimer = setTimeout(() => this.zone.run(() => { this.buscarAbierto = false; }), 160);
  }

  /* ── Selección y seguimiento ─────────────────────────────────── */
  seleccionar(t: Tecnico, centrar = true): void {
    this.seleccion = t;
    const c = this.coords(t);
    if (centrar && c) {
      this.autoEncuadre = false;
      this.volar(c[0], c[1], Math.max(this.map?.getZoom() ?? 0, 16));
      // En el teléfono, al elegirlo de la lista, la hoja baja para que se vea el mapa.
      if (this.esMovil) this.ponerHoja('peek');
    }
    this.dibujar();
    this.marcas.get(t.id)?.openPopup();
  }

  cerrarSeleccion(): void {
    if (this.seleccion) this.marcas.get(this.seleccion.id)?.closePopup();
    this.seleccion = null;
    this.dibujar();
  }

  seguir(t: Tecnico): void {
    this.siguiendo = this.siguiendo === t.id ? null : t.id;
    if (this.siguiendo) { this.autoEncuadre = false; this.seleccionar(t, true); }
    else this.dibujar();
  }

  dejarDeSeguir(): void { this.siguiendo = null; this.dibujar(); }
  get seguido(): Tecnico | null { return this.siguiendo ? (this.tecnicos.find(t => t.id === this.siguiendo) ?? null) : null; }

  waze(t: Tecnico): string { return `https://waze.com/ul?ll=${t.latitude},${t.longitude}&navigate=yes`; }
  googleMaps(t: Tecnico): string { return `https://www.google.com/maps?q=${t.latitude},${t.longitude}`; }

  /* ── Clientes de la red (capa tenue, opcional) ───────────────── */
  cambiarClientes(): void {
    this.clientesVisibles = !this.clientesVisibles;
    if (!this.map) return;
    if (!this.clientesVisibles) { this.capaClientes.remove(); return; }
    this.capaClientes.addTo(this.map);
    if (!this.clientesCargados && !this.clientesCargando) this.cargarClientes();
  }

  private cargarClientes(): void {
    this.clientesCargando = true;
    this.red.datos().subscribe({
      next: (r: any) => this.zone.run(() => {
        this.clientesCargando = false;
        this.clientesCargados = true;
        const clientes: any[] = r?.data?.clientes ?? [];
        this.zone.runOutsideAngular(() => {
          // En lienzo, no en SVG: pueden ser miles de puntos y no reciben clics.
          this.lienzoClientes ??= this.L.canvas({ padding: .5 });
          this.capaClientes.clearLayers();
          for (const c of clientes) {
            if (c.lat === null || c.lng === null) continue;
            this.L.circleMarker([c.lat, c.lng], { renderer: this.lienzoClientes, radius: 3.5, stroke: false, fillColor: '#7c8a9e', fillOpacity: .4, interactive: false }).addTo(this.capaClientes);
          }
        });
      }),
      // Sin el módulo del mapa de la red (403) o sin servicio: no hay capa y el botón se va.
      error: () => this.zone.run(() => {
        this.clientesCargando = false;
        this.clientesVisibles = false;
        this.clientesDisponibles = false;
        this.capaClientes?.remove();
      }),
    });
  }

  /* ── Hoja inferior (teléfono) ────────────────────────────────── */
  private get esMovil(): boolean { return isPlatformBrowser(this.platformId) && window.matchMedia('(max-width: 1000px)').matches; }

  /**
   * En el teléfono el mapa llena lo que queda de pantalla debajo de la cabecera (el
   * <main> es lo que scrollea), y la lista va como una hoja encima.
   */
  private ajustarAltoMovil(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const ws = this.el.nativeElement.querySelector('.np-techmap-ws') as HTMLElement | null;
    if (!ws) return;
    if (!this.esMovil) { ws.style.height = ''; return; }
    const main = ws.closest('main') as HTMLElement | null;
    const alto = main ? main.clientHeight : window.innerHeight;
    const top = main ? ws.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop : ws.getBoundingClientRect().top;
    ws.style.height = `${Math.max(420, Math.floor(alto - top - 24))}px`;
    this.ponerAltoHoja();
  }

  private altoHoja(h: Hoja): number {
    const ws = this.el.nativeElement.querySelector('.np-techmap-ws') as HTMLElement | null;
    const total = ws?.clientHeight || 600;
    return h === 'peek' ? 128 : h === 'half' ? Math.round(total * .5) : total - 64;
  }

  /** La altura de la hoja también la lee el CSS (--tm-hoja) para subir la atribución del mapa. */
  private ponerAltoHoja(px?: number): void {
    const ws = this.el.nativeElement.querySelector('.np-techmap-ws') as HTMLElement | null;
    ws?.style.setProperty('--tm-hoja', `${px ?? this.altoHoja(this.hoja)}px`);
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

  trackId(_: number, t: Tecnico): number { return t.id; }
}
