import { FinanzasTabsComponent } from '../../components/finanzas-tabs/finanzas-tabs.component';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CobranzaConfig, CobranzaResumen, CobranzaService } from '../../services/cobranza.service';

/**
 * Cobranza inteligente: a quién cobrarle, hasta dónde puede negociar el
 * asistente, cuándo escribe y cómo se presenta. Los casos se atienden desde
 * la burbuja del panel.
 */
@Component({
  selector: 'app-cobranza',
  standalone: true,
  imports: [FinanzasTabsComponent, CommonModule, FormsModule],
  templateUrl: './cobranza.component.html',
  styleUrls: ['./cobranza.component.scss', './cobranza-limpio.scss'],
  host: { class: 'np-console' },
})
export class CobranzaComponent implements OnInit {
  private svc = inject(CobranzaService);

  cfg: CobranzaConfig | null = null;
  iaDisponible = false;
  pasarela = false;
  lineas: Array<{ id: number; nombre: string; telefono: string | null; principal: number }> = [];

  /** Cómo viene la cobranza: detectados, en curso y escalados. */
  resumen: CobranzaResumen | null = null;

  /**
   * La conexión con la IA.
   *
   * Mientras no haya clave propia se usa la de Netvula, que tiene un tope
   * diario: por eso se muestra el consumo. La clave del cliente no vuelve
   * nunca desde el servidor, sólo si existe.
   */
  ia: { propia: boolean; modelos: string | null; limite_prueba: number; usadas_hoy: number; url_clave: string; url_limites: string } = {
    propia: false, modelos: null, limite_prueba: 0, usadas_hoy: 0, url_clave: '', url_limites: '',
  };

  abrirClave = false;
  verClave = false;
  claveNueva = '';
  probando = false;
  resultadoPrueba: { ok: boolean; texto: string } | null = null;

  /** Las opciones que casi nadie toca, plegadas. */
  avanzado = false;

  cargando = true;
  guardando = false;
  revisando = false;
  mensaje = '';
  mensajeTipo: 'ok' | 'error' = 'ok';
  errores: Record<string, string> = {};

  readonly DIAS = [
    { n: 1, t: 'L', largo: 'Lunes' }, { n: 2, t: 'M', largo: 'Martes' }, { n: 3, t: 'X', largo: 'Miércoles' },
    { n: 4, t: 'J', largo: 'Jueves' }, { n: 5, t: 'V', largo: 'Viernes' }, { n: 6, t: 'S', largo: 'Sábado' }, { n: 7, t: 'D', largo: 'Domingo' },
  ];
  diasElegidos = new Set<number>();

  // ── Tablero de casos (21-10-2026): por etapa, para atender sin abrir la burbuja ──
  vistaCob: 'casos' | 'reglas' = 'casos';
  cargandoCasos = false;
  columnas: Array<{ clave: string; titulo: string; ayuda: string; color: string; casos: any[] }> = [];
  casoAbierto: any = null;
  conversacion: any[] = [];
  cargandoConv = false;
  accionando = new Set<number>();

  private readonly ETAPAS = [
    { clave: 'escalado', titulo: 'Necesitan una persona', ayuda: 'El asistente no pudo resolver: hay que contestar.', color: '#b42318', estados: ['escalado'] },
    { clave: 'detectado', titulo: 'Para autorizar', ayuda: 'Con mora y sin escribirles todavía.', color: '#e9b949', estados: ['detectado'] },
    { clave: 'curso', titulo: 'En conversación', ayuda: 'El asistente está hablando con ellos.', color: '#d9772b', estados: ['autorizado', 'contactado', 'negociando', 'acuerdo'] },
    { clave: 'sin_respuesta', titulo: 'Sin respuesta', ayuda: 'Se les escribió y no contestan.', color: '#a0a3ac', estados: ['sin_respuesta'] },
    { clave: 'pagado', titulo: 'Pagaron', ayuda: 'Pagaron después de la conversación (últimos 30 días).', color: '#1f8a4c', estados: ['pagado'] },
  ];

  cargarCasos(): void {
    this.cargandoCasos = true;
    const todos: any[] = [];
    let faltan = 3;
    (['atencion', 'curso', 'resultados'] as const).forEach(g => this.svc.casos(g).subscribe({
      next: (r: any) => { todos.push(...(r?.data ?? [])); if (--faltan === 0) this.armarColumnas(todos); },
      error: () => { if (--faltan === 0) this.armarColumnas(todos); },
    }));
  }

  private armarColumnas(todos: any[]): void {
    this.cargandoCasos = false;
    this.columnas = this.ETAPAS.map(e => ({ ...e, casos: todos.filter(c => e.estados.includes(c.estado)) }));
  }

  pesos(v: unknown): string { return '$ ' + Math.round(Number(v) || 0).toLocaleString('es-CO'); }

  nombreCaso(c: any): string { return `${c?.names ?? ''} ${c?.lastname ?? ''}`.trim() || 'Sin nombre'; }

  accionCaso(c: any, que: 'autorizar' | 'descartar' | 'tomar' | 'devolver'): void {
    this.accionando.add(c.id);
    this.svc.accion(c.id, que).subscribe({
      next: (r: any) => { this.accionando.delete(c.id); this.avisar(r?.message || 'Listo', r?.status === 0 ? 'ok' : 'error'); if (r?.status === 0) { this.cargarCasos(); if (this.casoAbierto?.id === c.id) this.casoAbierto = null; } },
      error: (e: any) => { this.accionando.delete(c.id); this.avisar(e?.error?.message || 'No se pudo', 'error'); },
    });
  }

  abrirCaso(c: any): void {
    this.casoAbierto = c;
    this.conversacion = [];
    this.cargandoConv = true;
    this.svc.caso(c.id).subscribe({
      next: (r: any) => { this.cargandoConv = false; this.conversacion = r?.data?.mensajes ?? []; },
      error: () => { this.cargandoConv = false; },
    });
  }

  ngOnInit(): void {
    this.cargarCasos();
    this.cargar();
    this.svc.resumen().subscribe({ next: r => this.resumen = r?.data ?? null, error: () => {} });
  }

  cargar(): void {
    this.cargando = true;
    this.svc.config().subscribe({
      next: r => {
        this.cargando = false;
        const d = r?.data ?? {};
        this.cfg = { ...d.config, activa: !!Number(d.config?.activa), compromiso_suspende: !!Number(d.config?.compromiso_suspende), instrucciones: d.config?.instrucciones ?? '' };
        this.iaDisponible = !!d.ia_disponible;
        this.pasarela = !!d.pasarela;
        this.lineas = d.lineas ?? [];
        this.ia = { ...this.ia, ...(d.ia ?? {}) };
        this.diasElegidos = new Set(String(this.cfg?.dias ?? '').split(',').map(Number).filter(Boolean));
      },
      error: () => { this.cargando = false; this.avisar('No se pudo cargar la configuración.', 'error'); },
    });
  }

  /** Cuánto del cupo de prueba se usó hoy, para la barrita. */
  get usoPct(): number {
    if (this.ia.propia || !this.ia.limite_prueba) return 0;
    return Math.min(100, Math.round(this.ia.usadas_hoy * 100 / this.ia.limite_prueba));
  }

  /** El primer mensaje, tal como le va a llegar al cliente. */
  get ejemploMensaje(): string {
    const c = this.cfg;
    const quien = c?.nombre_asistente || 'Asistente';
    const empresa = c?.nombre_empresa || 'su proveedor de internet';

    return `Hola, soy ${quien} de ${empresa}. Le escribo porque tiene una factura pendiente. ¿Quiere que veamos cómo ponerte al día?`;
  }

  probarClave(): void {
    this.probando = true;
    this.resultadoPrueba = null;

    this.svc.probarIa(this.claveNueva.trim() || undefined).subscribe({
      next: r => {
        this.probando = false;
        const ok = r?.error === 0;
        this.resultadoPrueba = { ok, texto: r?.message ?? (ok ? 'La clave responde.' : 'La clave no respondió.') };
        if (ok) this.iaDisponible = true;
      },
      error: e => {
        this.probando = false;
        this.resultadoPrueba = { ok: false, texto: e?.error?.message ?? 'No se pudo probar la clave.' };
      },
    });
  }

  /** Vuelve a la IA de Netvula. Se aplica al guardar, como todo lo demás. */
  quitarClave(): void {
    this.claveNueva = '';
    this.ia = { ...this.ia, propia: false };
    this.resultadoPrueba = { ok: true, texto: 'Al guardar se quita su clave y se vuelve a la IA de Netvula.' };
    this.quitandoClave = true;
  }

  private quitandoClave = false;

  alternarDia(n: number): void {
    this.diasElegidos.has(n) ? this.diasElegidos.delete(n) : this.diasElegidos.add(n);
    this.diasElegidos = new Set(this.diasElegidos);
  }

  guardar(): void {
    if (!this.cfg || this.guardando) return;
    this.guardando = true;
    this.errores = {};
    this.cfg.dias = [...this.diasElegidos].sort().join(',');

    this.svc.guardarConfig({
      ...this.cfg,
      ...(this.claveNueva.trim() ? { ia_clave: this.claveNueva.trim() } : {}),
      ...(this.quitandoClave ? { quitar_clave: true } : {}),
    }).subscribe({
      next: r => {
        this.guardando = false;
        this.avisar(r?.message ?? 'Guardado.', r?.error === 0 ? 'ok' : 'error');
      },
      error: e => {
        this.guardando = false;
        const errs = e?.error?.errors ?? {};
        this.errores = Object.fromEntries(Object.entries(errs).map(([k, v]: [string, any]) => [k, Array.isArray(v) ? v[0] : String(v)]));
        this.avisar(e?.error?.message && !Object.keys(errs).length ? e.error.message : 'Revise los campos marcados.', 'error');
      },
    });
  }

  revisarAhora(): void {
    this.revisando = true;
    this.svc.revisarAhora().subscribe({
      next: r => { this.revisando = false; this.avisar(r?.message ?? 'Listo.', r?.error === 0 ? 'ok' : 'error'); },
      error: () => { this.revisando = false; this.avisar('No se pudo revisar.', 'error'); },
    });
  }

  private avisar(texto: string, tipo: 'ok' | 'error'): void {
    this.mensaje = texto;
    this.mensajeTipo = tipo;
  }

  /** Ejemplo de lo que puede ofrecer, para ver los límites en palabras. */
  get ejemploOferta(): string {
    const c = this.cfg;
    if (!c) return '';
    const partes = [`pagar todo con el link${this.pasarela ? '' : ' (no hay pasarela: no se ofrece)'}`, `un compromiso a más tardar en ${c.plazo_max_dias} día(s)`];
    if (Number(c.cuotas_max) > 1) partes.push(`hasta ${c.cuotas_max} cuotas dentro de ese plazo`);
    if (Number(c.descuento_max_pct) > 0) partes.push(`hasta ${c.descuento_max_pct}% de descuento si paga todo en ${c.descuento_dias} día(s)`);
    return partes.join(', ') + '.';
  }
}
