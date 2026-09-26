import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConciliacionPagosService, FilaCruce, PeticionDePagos } from '../../services/conciliacion-pagos.service';
import { ToastService } from '../../services/toast.service';
import { DialogService } from '../../services/dialog.service';
import { NpSelectComponent } from '../../common/np-select/np-select.component';
import { PRESENTACION_METODOS_PAGO, conValor } from '../../common/np-select/presentaciones';

type Est = 'Exacta' | 'Probable' | 'Corregida' | 'Revisar';

interface Fila extends FilaCruce {
  /** Se manda a aplicar. Revisar arranca en falso hasta que alguien la confirme. */
  incluir: boolean;
  forzar: boolean;
}

interface Lista {
  id: number;
  titulo: string;
  texto: string;
  cruzada: boolean;
  filas: Fila[];
  /** Lo que se ve, ya filtrado: en un campo, no en un getter (un getter que devuelve un array nuevo rompe los clics). */
  visibles: Fila[];
  noLeidas: string[];
  filtro: 'Todas' | Est;
  busca: string;
  conteos: Record<string, number>;
  totalValor: number;
  aAplicarN: number;
  aAplicarValor: number;

  metodoId: number | null;
  fecha: string;
  orden: 'antigua' | 'exacta';
  /** Lo genera la pantalla una vez por lista: es lo que impide aplicar dos veces si se toca el botón otra vez. */
  lote: string;

  reporte: any | null;
  reporteTipo: 'simulacion' | 'aplicado' | null;
  aplicada: boolean;

  trabajando: boolean;
  error: string;
  editando: string | null;
  resultados: any[];
  buscando: boolean;
}

/** Cómo se dice cada resultado de un pago. */
export const ESTADOS: Record<string, { texto: string; tono: string }> = {
  simulado:          { texto: 'Se aplicaría',       tono: 'active' },
  aplicado:          { texto: 'Aplicado',           tono: 'active' },
  posible_duplicado: { texto: 'Posible duplicado',  tono: 'noip' },
  sin_facturas:      { texto: 'Sin facturas',       tono: 'neutral' },
  sin_cliente:       { texto: 'Sin cliente',        tono: 'suspended' },
  ambiguo:           { texto: 'Cédula repetida',    tono: 'suspended' },
  ya_aplicado:       { texto: 'Ya aplicado',        tono: 'neutral' },
  monto_invalido:    { texto: 'Valor inválido',     tono: 'suspended' },
  error:             { texto: 'Error',              tono: 'suspended' },
};

/**
 * Conciliación de pagos.
 *
 * Llega una lista de «nombre y valor» de afuera —un cuaderno, un extracto, un chat— y hay
 * que aplicarla a las facturas de cada cliente. Cruzarla a ciegas es plata puesta en la
 * cuenta de otra persona, así que son tres pasos y sólo el último escribe:
 *
 *   1. Cruzar   a qué cliente corresponde cada nombre, con qué confianza
 *   2. Simular  qué facturas se pagarían y cuáles quedarían abonadas
 *   3. Aplicar  escribirlo, y sólo después de haber simulado exactamente eso
 *
 * Cada lista es una pestaña: se pueden ir sumando y cada una se aplica por separado.
 */
@Component({
  selector: 'app-conciliacion-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  templateUrl: './conciliacion-pagos.component.html',
  styleUrl: './conciliacion-pagos.component.scss',
  host: { class: 'np-console' },
})
export class ConciliacionPagosComponent implements OnInit {
  private svc = inject(ConciliacionPagosService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  readonly ESTADOS = ESTADOS;
  readonly FILTROS: ('Todas' | Est)[] = ['Todas', 'Exacta', 'Probable', 'Corregida', 'Revisar'];
  readonly presMetodos = conValor(PRESENTACION_METODOS_PAGO, (m: any) => m.id);

  listas: Lista[] = [];
  activa = 0;
  vista: 'listas' | 'historial' = 'listas';

  metodos: any[] = [];
  lotes: any[] = [];
  cargandoLotes = false;

  private contador = 0;
  private temporizador: any = null;

  ngOnInit(): void {
    this.nuevaLista();

    this.svc.metodos().subscribe({
      next: (r: any) => {
        this.metodos = r?.data ?? [];
        // Con un solo método activo no hay nada que elegir.
        const activos = this.metodos.filter(m => m.active);
        if (activos.length === 1) this.listas.forEach(l => (l.metodoId ??= activos[0].id));
      },
    });
  }

  // ── Las listas (pestañas) ─────────────────────────────────────────────────

  readonly hoyISO = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  private hoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** a-z, 0-9 y guion, de 8 a 40 caracteres: es lo que acepta el servidor. */
  private nuevoLote(): string {
    return 'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  }

  nuevaLista(): void {
    this.contador++;
    const activos = this.metodos.filter(m => m.active);

    this.listas.push({
      id: this.contador, titulo: `Lista ${this.contador}`, texto: '', cruzada: false, filas: [], visibles: [], noLeidas: [],
      filtro: 'Todas', busca: '', conteos: {}, totalValor: 0, aAplicarN: 0, aAplicarValor: 0,
      metodoId: activos.length === 1 ? activos[0].id : null, fecha: this.hoy(), orden: 'exacta', lote: this.nuevoLote(),
      reporte: null, reporteTipo: null, aplicada: false,
      trabajando: false, error: '', editando: null, resultados: [], buscando: false,
    });
    this.activa = this.listas.length - 1;
    this.vista = 'listas';
  }

  async cerrarLista(i: number): Promise<void> {
    const l = this.listas[i];

    if (l.cruzada && !l.aplicada && !await this.dialog.confirm(`«${l.titulo}» no se aplicó. ¿Descartarla?`, { okLabel: 'Descartar' })) return;

    this.listas.splice(i, 1);
    if (!this.listas.length) this.nuevaLista();
    this.activa = Math.min(this.activa, this.listas.length - 1);
  }

  irA(i: number): void { this.activa = i; this.vista = 'listas'; }

  get lista(): Lista { return this.listas[this.activa]; }

  abrirHistorial(): void {
    this.vista = 'historial';
    this.cargandoLotes = true;
    this.svc.lotes().subscribe({
      next: (r: any) => { this.cargandoLotes = false; this.lotes = r?.data ?? []; },
      error: () => { this.cargandoLotes = false; },
    });
  }

  // ── 1. Cruzar ─────────────────────────────────────────────────────────────

  cruzar(l: Lista): void {
    if (!l.texto.trim() || l.trabajando) return;

    l.trabajando = true; l.error = '';

    this.svc.cruzar(l.texto).subscribe({
      next: (r: any) => {
        l.trabajando = false;

        if (r?.status !== 0) { l.error = r?.message || 'No se pudo leer la lista.'; l.noLeidas = r?.data?.no_leidas ?? []; return; }

        l.filas = (r.data.filas as FilaCruce[]).map(f => ({ ...f, incluir: f.est !== 'Revisar' && !!f.cedula, forzar: false }));
        l.noLeidas = r.data.no_leidas ?? [];
        l.cruzada = true;
        this.recalcular(l);
      },
      error: (e: any) => { l.trabajando = false; l.error = e?.error?.message || 'No se pudo cruzar la lista.'; },
    });
  }

  // ── 2. Revisar el cruce ───────────────────────────────────────────────────

  /** Filtros, conteos y totales, en campos: se llama al cambiar algo, no en cada ciclo. */
  recalcular(l: Lista): void {
    const q = this.norm(l.busca);

    l.visibles = l.filas.filter(f =>
      (l.filtro === 'Todas' || f.est === l.filtro) && (!q || this.norm(`${f.nombre} ${f.base} ${f.cedula}`).includes(q)));

    l.conteos = { Todas: l.filas.length };
    for (const e of ['Exacta', 'Probable', 'Corregida', 'Revisar']) l.conteos[e] = l.filas.filter(f => f.est === e).length;

    l.totalValor = l.filas.reduce((a, f) => a + f.valor, 0);

    const va = l.filas.filter(f => this.seAplica(f));
    l.aAplicarN = va.length;
    l.aAplicarValor = va.reduce((a, f) => a + f.valor, 0);
  }

  private norm(t: string): string { return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  seAplica(f: Fila): boolean { return f.incluir && f.est !== 'Revisar' && !!f.cedula; }

  /** Cualquier cambio deja sin valor la simulación anterior: lo que se aplica es lo que se simuló. */
  private cambio(l: Lista): void {
    if (l.aplicada) return;
    l.reporte = null; l.reporteTipo = null;
    this.recalcular(l);
  }

  filtrar(l: Lista, f: 'Todas' | Est): void { l.filtro = f; this.recalcular(l); }
  buscar(l: Lista): void { this.recalcular(l); }

  alternar(l: Lista, f: Fila): void { if (l.aplicada) return; f.incluir = !f.incluir; this.cambio(l); }

  /** Quien mira una fila dudosa y dice «sí, es esa persona». */
  confirmar(l: Lista, f: Fila): void {
    if (l.aplicada || !f.cedula) return;
    f.est = 'Corregida'; f.incluir = true;
    this.cambio(l);
  }

  abrirCambio(l: Lista, f: Fila): void {
    if (l.aplicada) return;
    l.editando = l.editando === f.ref ? null : f.ref;
    l.resultados = [];
  }

  buscarCliente(l: Lista, q: string): void {
    clearTimeout(this.temporizador);
    if (q.trim().length < 2) { l.resultados = []; return; }

    this.temporizador = setTimeout(() => {
      l.buscando = true;
      this.svc.clientes(q.trim()).subscribe({
        next: (r: any) => { l.buscando = false; l.resultados = r?.data ?? []; },
        error: () => { l.buscando = false; },
      });
    }, 250);
  }

  elegirCliente(l: Lista, f: Fila, c: { cedula: string; nombre: string }): void {
    f.cedula = c.cedula; f.base = c.nombre; f.est = 'Corregida'; f.incluir = true;
    f.obs = 'Elegido a mano';
    l.editando = null; l.resultados = [];
    this.cambio(l);
  }

  quitarCedula(l: Lista, f: Fila): void {
    f.cedula = ''; f.base = ''; f.est = 'Revisar'; f.incluir = false;
    this.cambio(l);
  }

  // ── 3. Simular y aplicar ──────────────────────────────────────────────────

  private peticion(l: Lista): PeticionDePagos {
    return {
      filas: l.filas.filter(f => this.seAplica(f)).map(f => ({ ref: f.ref, cedula: f.cedula, nombre: f.nombre, valor: f.valor, forzar: f.forzar || undefined })),
      orden: l.orden, metodo_id: l.metodoId, fecha: l.fecha || null, titulo: l.titulo, lote: l.lote,
    };
  }

  configurado(l: Lista): void { this.cambio(l); }

  simular(l: Lista): void {
    if (!l.aAplicarN || l.trabajando) return;

    l.trabajando = true; l.error = '';

    this.svc.simular(this.peticion(l)).subscribe({
      next: (r: any) => {
        l.trabajando = false;
        if (r?.status !== 0) { l.error = r?.message || 'No se pudo simular.'; return; }
        l.reporte = r.data; l.reporteTipo = 'simulacion';
      },
      error: (e: any) => { l.trabajando = false; l.error = this.mensaje(e, 'No se pudo simular.'); },
    });
  }

  get puedeAplicar(): boolean {
    const l = this.lista;
    return !!l && l.reporteTipo === 'simulacion' && !!l.metodoId && !l.trabajando && !l.aplicada && (l.reporte?.resumen?.pagos_aplicados ?? 0) > 0;
  }

  async aplicar(l: Lista): Promise<void> {
    if (!this.puedeAplicar) return;

    const r = l.reporte.resumen;
    const metodo = this.metodos.find(m => m.id === l.metodoId)?.name ?? '';

    if (!await this.dialog.confirm(
      `Se van a aplicar ${r.pagos_aplicados} pagos por ${this.peso(r.aplicado)} a las facturas de los clientes, con «${metodo}». ` +
      `Esto escribe en facturación y queda a su nombre. ¿Continuamos?`,
      { okLabel: 'Sí, aplicar' },
    )) return;

    l.trabajando = true; l.error = '';

    this.svc.aplicar(this.peticion(l)).subscribe({
      next: (res: any) => {
        l.trabajando = false;
        if (res?.status !== 0) { l.error = res?.message || 'No se pudo aplicar.'; return; }
        l.reporte = res.data; l.reporteTipo = 'aplicado'; l.aplicada = true;
        this.toast.success(`Aplicado: ${this.peso(res.data.resumen.aplicado)} en ${res.data.resumen.pagos_aplicados} pagos.`);
      },
      error: (e: any) => { l.trabajando = false; l.error = this.mensaje(e, 'No se pudo aplicar.'); },
    });
  }

  /** «Es otro pago»: se vuelve a simular con la fila forzada. */
  forzar(l: Lista, ref: string, valor: boolean): void {
    const f = l.filas.find(x => x.ref === ref);
    if (!f || l.aplicada) return;
    f.forzar = valor;
    this.cambio(l);
  }

  esForzada(l: Lista, ref: string): boolean { return !!l.filas.find(x => x.ref === ref)?.forzar; }

  private mensaje(e: any, porDefecto: string): string {
    const v = e?.error?.errors;
    return v ? (Object.values(v) as any[]).flat().join(' ') : (e?.error?.message || porDefecto);
  }

  // ── Presentación ──────────────────────────────────────────────────────────

  peso(n: number): string { return '$' + Math.round(n ?? 0).toLocaleString('es-CO'); }

  cedulaConPuntos(c: string): string { return /^\d+$/.test(c) ? c.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : c; }

  estado(e: string): { texto: string; tono: string } { return ESTADOS[e] ?? { texto: e, tono: 'neutral' }; }

  trackRef = (_: number, f: { ref: string }) => f.ref;
  trackLista = (_: number, l: Lista) => l.id;

  /** El reporte, para llevárselo: CSV con BOM para que Excel respete las tildes. */
  descargarCsv(l: Lista): void {
    if (!l.reporte) return;
    const c = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const filas = (l.reporte.filas as any[]).map(f => [
      f.ref, f.nombre, f.cedula, f.cliente ?? '', f.valor, this.estado(f.estado).texto,
      (f.movimientos as any[]).map(m => `${m.factura} ${m.tipo === 'pago_completo' ? 'pagada' : 'abono'} ${m.monto}`).join(' | '),
      f.sobrante || 0, f.detalle ?? '',
    ].map(c).join(','));

    const t = '﻿Ref,Nombre,Cédula,Cliente,Valor,Resultado,Facturas,Sobrante,Detalle\n' + filas.join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv;charset=utf-8' }));
    a.download = `conciliacion_${l.titulo.toLowerCase().replace(/\s+/g, '_')}_${l.reporteTipo}.csv`;
    a.click();
  }
}
