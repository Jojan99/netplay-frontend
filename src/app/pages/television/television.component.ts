import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { TvService } from '../../services/tv.service';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';

type Vista = 'canales' | 'lineas' | 'configuracion';
type Canal = { id: number; nombre: string; estado: 'al_aire' | 'caido' | 'arrancando'; vigilar: boolean; desde: string | null; bitrate: number | null; espectadores: number; fuente: string | null; alerta: boolean; avisado: boolean; previa: string | null; previa_en: string | null; vivo: string | null };
type Bouquet = { id: number; nombre: string; canales: number };

const FILTROS = [
  { clave: '', titulo: 'Todas', conteo: 'todas' },
  { clave: 'con_cliente', titulo: 'Con cliente', conteo: 'con_cliente' },
  { clave: 'revisar', titulo: 'Por revisar', conteo: 'revisar' },
  { clave: 'sin_cliente', titulo: 'Sin cliente', conteo: 'sin_cliente' },
  { clave: 'suspendidas', titulo: 'Apagadas', conteo: 'suspendidas' },
  { clave: 'pendientes', titulo: 'Pendientes', conteo: 'pendientes' },
];

/**
 * Televisión (21-10-2026): los canales del panel XUI.one al aire y sin señal (con el aviso al
 * grupo cuando uno se cae), las líneas de los clientes ligadas a su ficha y la conexión con el
 * panel: qué planes llevan TV, el paquete por defecto y si la TV sigue a la cartera.
 */
@Component({
  selector: 'app-television',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './television.component.html',
  styleUrls: ['./television.component.scss'],
})
export class TelevisionComponent implements OnInit, OnDestroy {
  private tv = inject(TvService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  vista: Vista = 'canales';
  readonly FILTROS = FILTROS;

  // ── Canales ──
  cargandoCanales = true;
  canales: Canal[] = [];
  revisadoEn: string | null = null;
  errorPanel: string | null = null;
  avisaAlGrupo = false;
  minutos = 3;
  buscarCanal = '';
  revisando = false;
  private reloj: any;

  // ── Líneas ──
  lineas: any[] = [];
  conteo: Record<string, number> = {};
  filtro = '';
  q = '';
  pagina = 1;
  total = 0;
  cargandoLineas = false;
  sincronizando = false;
  private buscar$ = new Subject<void>();
  private subs: Subscription[] = [];
  ligando: { linea: any; q: string; resultados: any[]; buscando: boolean } | null = null;
  private buscarCliente$ = new Subject<void>();

  // ── Configuración ──
  cfg: any = null;
  cargandoCfg = false;
  guardandoCfg = false;
  form = { url: '', codigo_api: '', api_key: '', url_clientes: '', bouquets: [] as number[], pantallas: 2, sincronizar_cartera: false, clave_fija: '' };
  bouquets: Bouquet[] = [];
  planes: any[] = [];

  /** Entró por «Conectar panel de TV»: solo la configuración, sin canales ni líneas todavía. */
  readonly soloConfig = !!this.route.snapshot.data['soloConfig'];

  ngOnInit(): void {
    if (this.soloConfig) { this.vista = 'configuracion'; this.cargarCfg(); return; }
    const v = this.route.snapshot.queryParamMap.get('vista') as Vista | null;
    this.abrir(v && ['canales', 'lineas', 'configuracion'].includes(v) ? v : 'canales');
    this.subs.push(this.buscar$.pipe(debounceTime(300)).subscribe(() => { this.pagina = 1; this.cargarLineas(); }));
    this.subs.push(this.buscarCliente$.pipe(debounceTime(300)).subscribe(() => this.buscarClientes()));
    // Los canales se refrescan solos mientras la pantalla está abierta.
    this.reloj = setInterval(() => { if (this.vista === 'canales' && !document.hidden) this.cargarCanales(); }, 60000);
  }

  ngOnDestroy(): void {
    this.pararVivo();
    this.hlsGrande?.destroy();
    if (this.reloj) clearInterval(this.reloj);
    this.subs.forEach(s => s.unsubscribe());
  }

  abrir(v: Vista): void {
    this.vista = v;
    this.router.navigate([], { queryParams: { vista: v === 'canales' ? null : v }, queryParamsHandling: 'merge', replaceUrl: true });
    if (v === 'canales') this.cargarCanales();
    if (v === 'lineas' && !this.lineas.length) this.cargarLineas();
    if (v === 'configuracion' && !this.cfg) this.cargarCfg();
  }

  // ── Canales ───────────────────────────────────────────────────────────────

  cargarCanales(): void {
    this.tv.canales().subscribe({
      next: (r: any) => {
        this.cargandoCanales = false;
        const d = r?.data;
        this.canales = d?.canales ?? [];
        this.revisadoEn = d?.revisado_en ?? null;
        this.errorPanel = d?.ultimo_error ?? null;
        this.avisaAlGrupo = !!d?.avisa_al_grupo;
        this.minutos = d?.minutos_para_avisar ?? 3;
      },
      error: (e: any) => { this.cargandoCanales = false; this.errorPanel = e?.error?.message ?? 'No se pudieron cargar los canales.'; },
    });
  }

  private filtrados(lista: Canal[]): Canal[] {
    const q = this.buscarCanal.trim().toLowerCase();
    return q ? lista.filter(c => c.nombre.toLowerCase().includes(q)) : lista;
  }

  get alAire(): Canal[] { return this.filtrados(this.canales.filter(c => c.estado === 'al_aire')); }
  get sinSenal(): Canal[] { return this.filtrados(this.canales.filter(c => c.estado !== 'al_aire' && c.vigilar)); }
  get apagados(): Canal[] { return this.filtrados(this.canales.filter(c => c.estado !== 'al_aire' && !c.vigilar)); }
  get totalAlAire(): number { return this.canales.filter(c => c.estado === 'al_aire').length; }
  get totalSinSenal(): number { return this.canales.filter(c => c.estado !== 'al_aire' && c.vigilar).length; }
  get totalApagados(): number { return this.canales.filter(c => c.estado !== 'al_aire' && !c.vigilar).length; }
  get viendo(): number { return this.canales.reduce((n, c) => n + (c.espectadores || 0), 0); }

  revisarYa(): void {
    this.revisando = true;
    this.tv.revisarCanales().subscribe({
      next: (r: any) => { this.revisando = false; r?.error ? this.toast.error(r.message) : this.cargarCanales(); },
      error: (e: any) => { this.revisando = false; this.toast.error(e?.error?.message ?? 'No se pudo revisar.'); },
    });
  }

  vigilar(c: Canal, si: boolean): void {
    this.tv.vigilarCanal(c.id, si).subscribe({
      next: (r: any) => { if (r?.error) { this.toast.error(r.message); return; } c.vigilar = si; if (!si) c.alerta = false; this.toast.success(r.message); },
      error: () => this.toast.error('No se pudo cambiar.'),
    });
  }

  /** «hace 12 min», «hace 3 h», «hace 22 días». */
  hace(fecha: string | null): string {
    if (!fecha) return '';
    const min = Math.max(0, Math.round((Date.now() - new Date(fecha).getTime()) / 60000));
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
  }

  mbps(kbps: number | null): string { return kbps ? (kbps / 1000).toFixed(1).replace('.', ',') + ' Mb/s' : ''; }

  // ── En vivo ───────────────────────────────────────────────────────────────
  // Un canal a la vez en su cuadro (sin sonido, al pasar el mouse) y uno en grande (con sonido).
  // La señal pasa por la plataforma con enlaces firmados: el panel está en la red interna.

  readonly tactil = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;
  enVivo: number | null = null;
  grande: Canal | null = null;
  errorVivo = '';
  private hls: any = null;
  private hlsGrande: any = null;
  private espera: any = null;
  private corte: any = null;

  url(relativa: string): string { return environment.rootUrl.replace(/\/$/, '') + relativa; }

  /** Hora de la foto más vieja de las que se ven: dice qué tan frescas son. */
  get fotosDe(): string {
    const f = this.canales.filter(c => c.estado === 'al_aire' && c.previa_en).map(c => new Date(c.previa_en!).getTime());
    return f.length ? this.hace(new Date(Math.min(...f)).toISOString()) : '';
  }

  alEntrar(c: Canal): void {
    if (this.tactil || !c.vivo) return;
    clearTimeout(this.espera);
    // Un momento antes de arrancar: pasar el mouse de largo por la cuadrícula no abre nada.
    this.espera = setTimeout(() => this.verEnCuadro(c), 450);
  }

  alSalir(c: Canal): void {
    clearTimeout(this.espera);
    if (this.enVivo === c.id) this.pararVivo();
  }

  private async verEnCuadro(c: Canal): Promise<void> {
    this.pararVivo();
    this.enVivo = c.id;
    setTimeout(async () => {
      const v = document.getElementById('tv-v-' + c.id) as HTMLVideoElement | null;
      if (!v || this.enVivo !== c.id) return;
      this.hls = await this.conectar(v, this.url(c.vivo!));
      // Un minuto y medio y se corta solo: es una previa, no para dejarla puesta.
      this.corte = setTimeout(() => { if (this.enVivo === c.id) this.pararVivo(); }, 90000);
    });
  }

  pararVivo(): void {
    clearTimeout(this.corte);
    this.hls?.destroy?.();
    this.hls = null;
    this.enVivo = null;
  }

  abrirGrande(c: Canal): void {
    if (!c.vivo) return;
    this.pararVivo();
    this.grande = c;
    this.errorVivo = '';
    setTimeout(async () => {
      const v = document.getElementById('tv-grande') as HTMLVideoElement | null;
      if (v) this.hlsGrande = await this.conectar(v, this.url(c.vivo!), true);
    });
  }

  cerrarGrande(): void {
    this.hlsGrande?.destroy?.();
    this.hlsGrande = null;
    this.grande = null;
  }

  /** Conecta el video a la lista HLS: hls.js donde hace falta, nativo en Safari/iPhone. */
  private async conectar(v: HTMLVideoElement, fuente: string, conSonido = false): Promise<any> {
    v.muted = !conSonido;
    const fallo = () => { if (conSonido) this.errorVivo = 'No se pudo abrir el canal. Puede que se haya caído en este momento.'; };
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = fuente;
      v.onerror = fallo;
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
      return { destroy: () => { v.removeAttribute('src'); v.load(); } };
    }
    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) { fallo(); return null; }
    const hls = new Hls({ lowLatencyMode: false, maxBufferLength: 20, backBufferLength: 10 });
    hls.on(Hls.Events.ERROR, (_: any, d: any) => { if (d?.fatal) { fallo(); hls.destroy(); } });
    hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => { v.muted = true; v.play().catch(() => {}); }));
    hls.loadSource(fuente);
    hls.attachMedia(v);
    return hls;
  }

  // ── Líneas ────────────────────────────────────────────────────────────────

  cargarLineas(): void {
    this.cargandoLineas = true;
    this.tv.lineas({ filtro: this.filtro, q: this.q.trim(), pagina: this.pagina }).subscribe({
      next: (r: any) => {
        this.cargandoLineas = false;
        this.lineas = r?.data?.lineas ?? [];
        this.conteo = r?.data?.conteo ?? {};
        this.total = r?.data?.total ?? 0;
      },
      error: () => { this.cargandoLineas = false; this.toast.error('No se pudieron cargar las líneas.'); },
    });
  }

  elegirFiltro(f: string): void { this.filtro = f; this.pagina = 1; this.cargarLineas(); }
  alBuscar(): void { this.buscar$.next(); }
  irAPagina(p: number): void { this.pagina = p; this.cargarLineas(); }
  get paginas(): number { return Math.max(1, Math.ceil(this.total / 50)); }

  sincronizar(): void {
    this.sincronizando = true;
    this.tv.sincronizarLineas().subscribe({
      next: (r: any) => {
        this.sincronizando = false;
        if (r?.error) { this.toast.error(r.message); return; }
        const d = r?.data;
        this.toast.success(`${d?.lineas ?? 0} líneas · ${d?.nuevas ?? 0} nuevas · ${d?.vinculadas ?? 0} ligadas`);
        this.cargarLineas();
      },
      error: (e: any) => { this.sincronizando = false; this.toast.error(e?.error?.message ?? 'No se pudo sincronizar.'); },
    });
  }

  ligarSugerido(l: any): void { this.ligar(l, l.sugerido_user_id); }

  ligar(l: any, userId: number | null): void {
    this.tv.vincular(l.id, userId).subscribe({
      next: (r: any) => { if (r?.error) { this.toast.error(r.message); return; } this.toast.success(r.message); this.ligando = null; this.cargarLineas(); },
      error: () => this.toast.error('No se pudo guardar.'),
    });
  }

  abrirLigar(l: any): void { this.ligando = { linea: l, q: '', resultados: [], buscando: false }; }
  alBuscarCliente(): void { this.buscarCliente$.next(); }

  private buscarClientes(): void {
    const g = this.ligando;
    if (!g || g.q.trim().length < 2) { if (g) g.resultados = []; return; }
    g.buscando = true;
    this.tv.buscarClientes(g.q.trim()).subscribe({
      next: (r: any) => { g.buscando = false; g.resultados = r?.data ?? []; },
      error: () => { g.buscando = false; },
    });
  }

  estadoLinea(l: any): { texto: string; tono: string } {
    if (l.estado === 'pendiente') return { texto: 'Pendiente', tono: 'warn' };
    if (l.estado === 'suspendida') return { texto: 'Suspendida por mora', tono: 'mal' };
    if (l.estado === 'desactivada') return { texto: 'Apagada en el panel', tono: 'neutro' };
    if (l.cliente_retirado) return { texto: 'Activa · cliente retirado', tono: 'warn' };
    if (l.cliente_suspendido) return { texto: 'Activa · cliente suspendido', tono: 'warn' };
    return { texto: 'Activa', tono: 'ok' };
  }

  // ── Configuración ─────────────────────────────────────────────────────────

  cargarCfg(): void {
    this.cargandoCfg = true;
    this.tv.configuracion().subscribe({
      next: (r: any) => {
        this.cargandoCfg = false;
        const d = r?.data ?? {};
        this.cfg = d;
        this.bouquets = d.bouquets ?? [];
        this.planes = (d.planes ?? []).map((p: any) => ({ ...p, tv_pantallas: p.tv_pantallas ?? null, guardando: false }));
        const p = d.panel;
        if (p) this.form = { url: p.url, codigo_api: p.codigo_api, api_key: '', url_clientes: p.url_clientes ?? '', bouquets: p.bouquets ?? [], pantallas: p.pantallas ?? 2, sincronizar_cartera: !!p.sincronizar_cartera, clave_fija: p.clave_fija ?? '' };
      },
      error: () => { this.cargandoCfg = false; this.toast.error('No se pudo cargar la configuración.'); },
    });
  }

  alternar(lista: number[], id: number): number[] { return lista.includes(id) ? lista.filter(x => x !== id) : [...lista, id]; }

  async guardarCfg(): Promise<void> {
    const apagaria = this.cfg?.cartera?.se_apagarian ?? 0;
    if (this.form.sincronizar_cartera && !this.cfg?.panel?.sincronizar_cartera && apagaria > 0) {
      const ok = await this.dialog.confirm(`En los próximos 10 minutos se apagan ${apagaria} líneas de clientes que hoy están suspendidos o retirados y siguen viendo TV.`, { title: 'Seguir a la cartera', okLabel: 'Sí, prenderlo' });
      if (!ok) return;
    }
    this.guardandoCfg = true;
    const f = this.form;
    this.tv.guardarConfiguracion({
      url: f.url.trim(), codigo_api: f.codigo_api.trim(), url_clientes: f.url_clientes.trim() || null,
      bouquets: f.bouquets, pantallas: Number(f.pantallas) || 2, sincronizar_cartera: f.sincronizar_cartera, clave_fija: f.clave_fija.trim() || null,
      ...(f.api_key.trim() ? { api_key: f.api_key.trim() } : {}),
    }).subscribe({
      next: (r: any) => {
        this.guardandoCfg = false;
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        // Recién conectado: se recarga para que el menú traiga Televisión con sus canales y líneas.
        if (this.soloConfig) { setTimeout(() => location.assign('/dashboard/television?vista=configuracion'), 900); return; }
        this.cargarCfg();
      },
      error: (e: any) => {
        this.guardandoCfg = false;
        const errores = e?.error?.errors;
        this.toast.error((errores ? String((Object.values(errores)[0] as any)?.[0] ?? '') : '') || e?.error?.message || 'No se pudo guardar.');
      },
    });
  }

  guardarPlan(p: any): void {
    if (p.tv_incluida && !p.tv_bouquets.length) { this.toast.error('Elija al menos un paquete para ese plan.'); return; }
    p.guardando = true;
    this.tv.guardarPlan(p.id, { tv_incluida: p.tv_incluida, tv_bouquets: p.tv_bouquets, tv_pantallas: p.tv_pantallas ? Number(p.tv_pantallas) : null }).subscribe({
      next: (r: any) => { p.guardando = false; r?.error ? this.toast.error(r.message) : this.toast.success(r.message); },
      error: () => { p.guardando = false; this.toast.error('No se pudo guardar el plan.'); },
    });
  }

  alternarPlan(p: any): void {
    p.tv_incluida = !p.tv_incluida;
    if (p.tv_incluida && !p.tv_bouquets.length) p.tv_bouquets = [...this.form.bouquets];
    this.guardarPlan(p);
  }

  nombreBouquet(id: number): string { return this.bouquets.find(b => b.id === id)?.nombre ?? `#${id}`; }
  pesos(n: number): string { return '$ ' + Math.round(n || 0).toLocaleString('es-CO'); }

  trackId = (_: number, x: { id: number }) => x.id;
}
