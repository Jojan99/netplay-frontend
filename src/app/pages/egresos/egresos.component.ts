import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { FiltrosEgresos, FinanceService } from '../../services/finance.service';
import { ToastService } from '../../services/toast.service';
import { NpSelectComponent } from '../../common/np-select/np-select.component';
import {
  OpcionSimple, PRESENTACION_METODOS_PAGO, PRESENTACION_POR_PAGINA,
  PRESENTACION_SIMPLE, PRESENTACION_TEXTOS, conValor,
} from '../../common/np-select/presentaciones';

type Pestana = 'tablero' | 'movimientos' | 'categorias';

/** Filtro que llega de un aviso del tablero, con su rótulo para el chip. */
interface FiltroDeAviso {
  etiqueta: string;
  sin_categoria?: boolean;
  sin_metodo?: boolean;
  sin_fecha?: boolean;
  ids?: number[];
}

@Component({
  selector: 'app-egresos',
  standalone: true,
  imports: [CommonModule, FormsModule, NpSelectComponent],
  templateUrl: './egresos.component.html',
  styleUrl: './egresos.component.scss',
  host: { class: 'np-console' },
})
export class EgresosComponent implements OnInit, OnDestroy {
  private destroy$  = new Subject<void>();
  private busqueda$ = new Subject<string>();
  private toast     = inject(ToastService);

  pestana: Pestana = 'tablero';

  // ── Filtros comunes al tablero, la lista y el CSV ────────────────────────
  busqueda  = '';
  desde     = '';
  hasta     = '';
  categoria = '';
  metodoId: number | null = null;
  aviso: FiltroDeAviso | null = null;

  // ── Tablero ──────────────────────────────────────────────────────────────
  cargandoTablero = true;
  tablero: any    = null;
  barrasCategorias: any[] = [];
  barrasMeses:      any[] = [];
  alertas:          any[] = [];
  mayores:          any[] = [];
  porMetodo:        any[] = [];
  recurrentes:      any[] = [];
  verTablaCategorias = false;

  // ── Movimientos ──────────────────────────────────────────────────────────
  cargandoLista = true;
  egresos: any[] = [];
  total    = 0;
  suma     = 0;
  ultimaPagina = 1;
  pagina   = 1;
  porPagina = 15;
  paginas: number[] = [];
  readonly opcionesPorPagina = [15, 25, 50, 100];

  // ── Categorías ───────────────────────────────────────────────────────────
  cargandoCategorias = true;
  categorias: any[] = [];
  /** Nombres activos: alimentan los selectores (campo fijo, nunca un getter). */
  nombresDeCategoria: string[] = [];
  nuevaCategoria = { name: '', color: '' };
  editandoId: number | null = null;
  nombreEditado = '';
  readonly paleta = ['#2a78d6', '#0f766e', '#b45309', '#b91c1c', '#7c3aed', '#be185d', '#4d7c0f', '#475569'];

  // ── Modal de egreso ──────────────────────────────────────────────────────
  modal = false;
  modoModal: 'crear' | 'editar' = 'crear';
  editandoEgreso: number | null = null;
  guardando = false;
  adjuntoActual: string | null = null;
  archivo: File | null = null;
  form = {
    concept: '', category: 'General', value: null as number | null,
    payment_method_id: null as number | null, expense_date: '',
    supplier: '', document_number: '', notes: '', recurrence: '',
  };

  metodosActivos: any[] = [];

  // ── Borrar ───────────────────────────────────────────────────────────────
  modalBorrar = false;
  borrandoId: number | null = null;

  readonly presTextos    = PRESENTACION_TEXTOS;
  readonly presPorPagina = PRESENTACION_POR_PAGINA;
  readonly presSimple    = PRESENTACION_SIMPLE;
  readonly presMetodos   = conValor(PRESENTACION_METODOS_PAGO, (m: any) => m.id);
  readonly opcionesRecurrencia: OpcionSimple[] = [
    { valor: '',          etiqueta: 'No se repite' },
    { valor: 'mensual',   etiqueta: 'Mensual',   detalle: 'Cada mes, el mismo día' },
    { valor: 'quincenal', etiqueta: 'Quincenal', detalle: 'Cada 15 días' },
  ];

  constructor(private finanzas: FinanceService) {}

  ngOnInit(): void {
    const hoy = new Date();
    this.desde = this.fmt(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    this.hasta = this.fmt(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));

    this.busqueda$.pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(() => { this.pagina = 1; this.cargarTodo(); });

    this.finanzas.getActivePaymentMethods().pipe(takeUntil(this.destroy$))
      .subscribe({ next: r => { this.metodosActivos = r?.data ?? []; } });

    this.cargarCategorias();
    this.cargarTodo();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('document:keydown.escape')
  alEscapar(): void {
    this.modal = false;
    this.modalBorrar = false;
  }

  // ── Carga ────────────────────────────────────────────────────────────────

  private filtros(extra: Partial<FiltrosEgresos> = {}): FiltrosEgresos {
    return {
      search:            this.busqueda || undefined,
      from:              this.desde || undefined,
      to:                this.hasta || undefined,
      category:          this.categoria || undefined,
      payment_method_id: this.metodoId ?? undefined,
      sin_categoria:     this.aviso?.sin_categoria,
      sin_metodo:        this.aviso?.sin_metodo,
      sin_fecha:         this.aviso?.sin_fecha,
      ids:               this.aviso?.ids,
      ...extra,
    };
  }

  cargarTodo(): void {
    this.cargarTablero();
    this.cargarLista();
  }

  cargarTablero(): void {
    this.cargandoTablero = true;
    // El tablero mira el período completo, no el filtro puntual de un aviso.
    const f: FiltrosEgresos = {
      search: this.busqueda || undefined, from: this.desde || undefined, to: this.hasta || undefined,
      category: this.categoria || undefined, payment_method_id: this.metodoId ?? undefined,
    };

    this.finanzas.getEgresosTablero(f).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        const d = r?.data ?? null;
        this.tablero          = d;
        this.alertas          = d?.alertas ?? [];
        this.mayores          = d?.mayores ?? [];
        this.porMetodo        = d?.por_metodo ?? [];
        this.recurrentes      = d?.recurrentes ?? [];
        this.barrasCategorias = this.aBarras(d?.por_categoria ?? [], (c: any) => c.total);
        this.barrasMeses      = this.aBarras(d?.mensual ?? [], (m: any) => m.total);
        this.cargandoTablero  = false;
      },
      error: () => { this.cargandoTablero = false; this.toast.error('No se pudo cargar el tablero de egresos.'); },
    });
  }

  /** Añade el alto proporcional una sola vez; el *ngFor recibe un arreglo fijo. */
  private aBarras(filas: any[], valor: (f: any) => number): any[] {
    const mayor = Math.max(1, ...filas.map(f => Number(valor(f) || 0)));
    return filas.map(f => ({ ...f, alto: Math.round((Number(valor(f) || 0) / mayor) * 100) }));
  }

  cargarLista(): void {
    this.cargandoLista = true;
    this.finanzas.getEgresosPaginated(this.filtros({ page: this.pagina, per_page: this.porPagina }))
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: r => {
          const d = r?.data ?? {};
          this.egresos      = d.items ?? [];
          this.total        = d.total ?? 0;
          this.suma         = d.suma ?? 0;
          this.ultimaPagina = d.last_page ?? 1;
          this.paginas      = this.rangoDePaginas();
          this.cargandoLista = false;
        },
        error: () => { this.cargandoLista = false; this.toast.error('No se pudo cargar la lista de egresos.'); },
      });
  }

  cargarCategorias(): void {
    this.cargandoCategorias = true;
    this.finanzas.getCategoriasEgreso().pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        this.categorias         = r?.data ?? [];
        this.nombresDeCategoria = this.categorias.filter(c => c.active).map(c => c.name);
        this.cargandoCategorias = false;
      },
      error: () => { this.cargandoCategorias = false; },
    });
  }

  private rangoDePaginas(): number[] {
    const paginas: number[] = [];
    for (let i = Math.max(1, this.pagina - 2); i <= Math.min(this.ultimaPagina, this.pagina + 2); i++) {
      paginas.push(i);
    }
    return paginas;
  }

  // ── Filtros ──────────────────────────────────────────────────────────────

  alBuscar(): void { this.busqueda$.next(this.busqueda); }

  alFiltrar(): void { this.pagina = 1; this.cargarTodo(); }

  cambiarPorPagina(): void { this.pagina = 1; this.cargarLista(); }

  periodo(cual: 'mes' | 'anterior' | 'anio' | 'doce'): void {
    const hoy = new Date();
    let ini: Date, fin: Date;
    switch (cual) {
      case 'anterior': ini = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0); break;
      case 'anio':     ini = new Date(hoy.getFullYear(), 0, 1);                  fin = new Date(hoy.getFullYear(), 11, 31); break;
      case 'doce':     ini = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1); fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0); break;
      default:         ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1);      fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    }
    this.desde = this.fmt(ini);
    this.hasta = this.fmt(fin);
    this.alFiltrar();
  }

  /** Salta al último mes que sí tiene egresos cargados. */
  irAlUltimoMesConDatos(): void {
    const mes = this.tablero?.ultimo_mes_con_datos;
    if (!mes) return;
    const [a, m] = mes.split('-').map(Number);
    this.desde = this.fmt(new Date(a, m - 1, 1));
    this.hasta = this.fmt(new Date(a, m, 0));
    this.alFiltrar();
  }

  /** El aviso manda a la lista ya filtrada por exactamente lo que señala. */
  verAviso(a: any): void {
    const f = a?.filtro ?? {};
    if (f.mes) {
      const [anio, mes] = String(f.mes).split('-').map(Number);
      this.desde = this.fmt(new Date(anio, mes - 1, 1));
      this.hasta = this.fmt(new Date(anio, mes, 0));
      this.aviso = null;
    } else if (f.category) {
      this.categoria = f.category;
      this.aviso = null;
    } else {
      this.aviso = { etiqueta: a.titulo, sin_categoria: !!f.sin_categoria, sin_metodo: !!f.sin_metodo, sin_fecha: !!f.sin_fecha, ids: f.ids };
    }
    this.pestana = 'movimientos';
    this.pagina  = 1;
    this.cargarLista();
  }

  limpiarAviso(): void {
    this.aviso  = null;
    this.pagina = 1;
    this.cargarLista();
  }

  // ── Paginación ───────────────────────────────────────────────────────────

  irAPagina(p: number): void { this.pagina = p; this.cargarLista(); }
  anterior(): void { if (this.pagina > 1) { this.pagina--; this.cargarLista(); } }
  siguiente(): void { if (this.pagina < this.ultimaPagina) { this.pagina++; this.cargarLista(); } }

  // ── Alta y edición ───────────────────────────────────────────────────────

  abrirCrear(): void {
    this.modoModal = 'crear';
    this.editandoEgreso = null;
    this.adjuntoActual  = null;
    this.archivo        = null;
    this.form = {
      concept: '', category: this.nombresDeCategoria[0] ?? 'General', value: null,
      payment_method_id: null, expense_date: this.fmt(new Date()),
      supplier: '', document_number: '', notes: '', recurrence: '',
    };
    this.modal = true;
  }

  abrirEditar(e: any): void {
    this.modoModal = 'editar';
    this.editandoEgreso = e.id;
    this.adjuntoActual  = e.tiene_adjunto ? (e.attachment_name || 'Comprobante') : null;
    this.archivo        = null;
    this.form = {
      concept: e.concept ?? '',
      category: e.category || 'General',
      value: +e.value || null,
      payment_method_id: e.payment_method_id ?? null,
      expense_date: (e.expense_date || e.fecha || '') as string,
      supplier: e.supplier ?? '',
      document_number: e.document_number ?? '',
      notes: e.notes ?? '',
      recurrence: e.recurrence ?? '',
    };
    // Si su categoría quedó desactivada, igual tiene que verse en el selector.
    if (this.form.category && !this.nombresDeCategoria.includes(this.form.category)) {
      this.nombresDeCategoria = [...this.nombresDeCategoria, this.form.category];
    }
    this.modal = true;
  }

  alElegirArchivo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.archivo = input.files?.[0] ?? null;
  }

  get formValido(): boolean {
    return this.form.concept.trim().length > 0 && (this.form.value ?? 0) > 0;
  }

  guardar(): void {
    if (!this.formValido || this.guardando) return;
    this.guardando = true;

    const datos = new FormData();
    datos.append('concept',  this.form.concept.trim());
    datos.append('value',    String(this.form.value ?? 0));
    datos.append('category', this.form.category || 'General');
    datos.append('payment_method_id', this.form.payment_method_id != null ? String(this.form.payment_method_id) : '');
    datos.append('expense_date',    this.form.expense_date || '');
    datos.append('supplier',        this.form.supplier || '');
    datos.append('document_number', this.form.document_number || '');
    datos.append('notes',           this.form.notes || '');
    datos.append('recurrence',      this.form.recurrence || '');
    if (this.archivo) datos.append('comprobante', this.archivo);

    const peticion = this.modoModal === 'crear'
      ? this.finanzas.createEgresoV2(datos)
      : this.finanzas.updateEgreso(this.editandoEgreso!, datos);

    peticion.pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        this.guardando = false;
        this.modal = false;
        this.toast.success(r?.message || 'Egreso guardado.');
        this.cargarTodo();
        this.cargarCategorias();
      },
      error: err => {
        this.guardando = false;
        this.toast.error(err?.error?.message || 'No se pudo guardar el egreso.');
      },
    });
  }

  abrirBorrar(e: any): void { this.borrandoId = e.id; this.modalBorrar = true; }

  confirmarBorrar(): void {
    if (!this.borrandoId) return;
    this.finanzas.deleteEgreso(this.borrandoId).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.modalBorrar = false;
        this.borrandoId  = null;
        this.toast.success('Egreso eliminado.');
        this.cargarTodo();
      },
      error: () => { this.toast.error('No se pudo eliminar el egreso.'); },
    });
  }

  /** Crea la siguiente cuota de un recurrente: sólo si el usuario lo pide. */
  repetir(r: any): void {
    this.finanzas.repetirEgreso(r.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: res => {
        if (res?.error) { this.toast.error(res?.message || 'No se pudo repetir el egreso.'); return; }
        this.toast.success(res?.message || 'Se creó el siguiente egreso.');
        this.cargarTodo();
      },
      error: () => { this.toast.error('No se pudo repetir el egreso.'); },
    });
  }

  verComprobante(e: any): void {
    this.finanzas.getComprobanteEgreso(e.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      },
      error: () => { this.toast.error('No se pudo abrir el comprobante.'); },
    });
  }

  // ── Categorías ───────────────────────────────────────────────────────────

  crearCategoria(): void {
    const nombre = this.nuevaCategoria.name.trim();
    if (!nombre) return;
    this.finanzas.crearCategoriaEgreso(nombre, this.nuevaCategoria.color || null)
      .pipe(takeUntil(this.destroy$)).subscribe({
        next: r => {
          if (r?.error) { this.toast.error(r?.message || 'No se pudo crear.'); return; }
          this.nuevaCategoria = { name: '', color: '' };
          this.toast.success(r?.message || 'Categoría creada.');
          this.cargarCategorias();
        },
        error: err => { this.toast.error(err?.error?.message || 'No se pudo crear la categoría.'); },
      });
  }

  empezarRenombrar(c: any): void { this.editandoId = c.id; this.nombreEditado = c.name; }
  cancelarRenombrar(): void { this.editandoId = null; this.nombreEditado = ''; }

  guardarNombre(c: any): void {
    const nombre = this.nombreEditado.trim();
    if (!nombre || nombre === c.name) { this.cancelarRenombrar(); return; }
    this.finanzas.actualizarCategoriaEgreso(c.id, { name: nombre }).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r?.message || 'No se pudo renombrar.'); return; }
        this.cancelarRenombrar();
        this.toast.success('Categoría renombrada; los movimientos viejos quedaron con el nombre nuevo.');
        this.cargarCategorias();
        this.cargarTodo();
      },
      error: () => { this.toast.error('No se pudo renombrar la categoría.'); },
    });
  }

  ponerColor(c: any, color: string): void {
    this.finanzas.actualizarCategoriaEgreso(c.id, { color }).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => { if (r?.error) { this.toast.error(r.message); return; } this.cargarCategorias(); },
      error: () => { this.toast.error('No se pudo cambiar el color.'); },
    });
  }

  alternarCategoria(c: any): void {
    this.finanzas.alternarCategoriaEgreso(c.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r?.message || 'No se pudo cambiar.'); return; }
        this.toast.success(r?.message || 'Categoría actualizada.');
        this.cargarCategorias();
      },
      error: () => { this.toast.error('No se pudo cambiar la categoría.'); },
    });
  }

  borrarCategoria(c: any): void {
    this.finanzas.eliminarCategoriaEgreso(c.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r?.message || 'No se pudo eliminar.'); return; }
        this.toast.success(r?.message || 'Categoría eliminada.');
        this.cargarCategorias();
      },
      error: () => { this.toast.error('No se pudo eliminar la categoría.'); },
    });
  }

  // ── CSV ──────────────────────────────────────────────────────────────────

  exportarCSV(): void {
    this.finanzas.exportEgresosCSV(this.filtros()).pipe(takeUntil(this.destroy$)).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `egresos_${this.desde || 'inicio'}_${this.hasta || 'hoy'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.toast.error('No se pudo exportar el CSV.'); },
    });
  }

  // ── Utilidades de presentación ───────────────────────────────────────────

  fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  pesos(v: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);
  }

  /** Valores grandes en los ejes: 33.696.084 → 33,7 M. */
  compacto(v: number | null | undefined): string {
    const n = Math.abs(Number(v) || 0);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + ' M';
    if (n >= 1_000)     return Math.round(n / 1_000) + ' k';
    return String(Math.round(n));
  }

  signo(v: number | null | undefined): string {
    if (v == null) return '';
    return v > 0 ? '+' : '';
  }

  /** En egresos, subir es malo y bajar es bueno: el color va al revés. */
  claseVariacion(v: number | null | undefined): string {
    if (v == null) return '';
    return v > 0 ? 'np-neg' : (v < 0 ? 'np-pos' : '');
  }

  colorDeCategoria(nombre: string): string | null {
    return this.categorias.find(c => c.name === nombre)?.color ?? null;
  }

  // trackBy: sin esto Angular rehace la tabla entera en cada respuesta.
  porId    = (_: number, x: any) => x?.id;
  porMes   = (_: number, x: any) => x?.mes;
  porNombre = (_: number, x: any) => x?.categoria ?? x?.metodo ?? x?.name;
  porTipo  = (_: number, x: any) => x?.tipo + x?.titulo;
  porValor = (_: number, x: any) => x;
}
