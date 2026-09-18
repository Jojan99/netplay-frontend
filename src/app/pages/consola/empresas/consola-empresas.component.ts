import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ConsolaService, EmpresaConsola, ESTADOS_SUSCRIPCION, PlanConsola, SimulacionCobro, pesos } from '../../../services/consola.service';
import { DialogService } from '../../../services/dialog.service';
import { ToastService } from '../../../services/toast.service';

type Filtro = 'todas' | 'activas' | 'prueba' | 'mora' | 'suspendidas' | 'sin_plan';

/**
 * Las empresas registradas en Netvula: su tamaño, qué usan y cómo van con el
 * pago de la plataforma. El detalle es de sólo lectura salvo lo comercial:
 * plan, precio, cupón, crédito, cobros y suspensión.
 */
@Component({
  selector: 'app-consola-empresas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consola-empresas.component.html',
  styleUrl: './consola-empresas.component.scss',
})
export class ConsolaEmpresasComponent implements OnInit, OnDestroy {
  private destruir$ = new Subject<void>();
  private busqueda$ = new Subject<string>();
  private consola = inject(ConsolaService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  private ruta = inject(ActivatedRoute);

  cargando = true;
  cargandoDetalle = false;
  guardando = false;
  migrada = true;

  busqueda = '';
  filtro: Filtro = 'todas';
  conTr069 = false;

  /** La lista ya filtrada. Se recalcula al cambiar algo, nunca en el *ngFor. */
  empresas: EmpresaConsola[] = [];
  private todas: EmpresaConsola[] = [];

  seleccionada: EmpresaConsola | null = null;
  detalle: any = null;
  planes: PlanConsola[] = [];

  // Edición de la suscripción
  editando = false;
  forma = {
    plan_id: null as number | null,
    ciclo: 'mensual' as 'mensual' | 'anual',
    precio_pactado: null as number | null,
    estado: 'prueba',
    metodo_pago: '' as string,
    inicio: '',
    prueba_hasta: '',
    proxima_facturacion: '',
    notas: '',
  };

  codigoCupon = '';
  montoCredito: number | null = null;
  notaCredito = '';

  simulacion: SimulacionCobro | null = null;
  modalCobro = false;

  // Registro de un pago
  modalPago = false;
  cobroDelPago: any = null;
  pago = { monto: null as number | null, fecha: '', metodo: 'transferencia', referencia: '', nota: '' };
  archivoPago: File | null = null;

  readonly FILTROS: { valor: Filtro; titulo: string }[] = [
    { valor: 'todas', titulo: 'Todas' },
    { valor: 'activas', titulo: 'Al día' },
    { valor: 'prueba', titulo: 'En prueba' },
    { valor: 'mora', titulo: 'En mora' },
    { valor: 'suspendidas', titulo: 'Suspendidas' },
    { valor: 'sin_plan', titulo: 'Sin plan' },
  ];

  readonly ESTADOS = ESTADOS_SUSCRIPCION;
  pesos = pesos;

  ngOnInit(): void {
    this.busqueda$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destruir$))
      .subscribe(() => this.filtrar());

    this.cargar();

    const pedida = Number(this.ruta.snapshot.queryParamMap.get('empresa') || 0);
    if (pedida) {
      // Se abre cuando llegue la lista.
      this.esperada = pedida;
    }
  }

  ngOnDestroy(): void { this.destruir$.next(); this.destruir$.complete(); }

  private esperada = 0;

  cargar(): void {
    this.cargando = true;

    this.consola.empresas('', this.conTr069).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.todas = r?.data?.empresas ?? [];
        this.migrada = r?.data?.migrada !== false;
        this.filtrar();
        this.cargando = false;

        if (this.esperada) {
          const e = this.todas.find(x => x.id === this.esperada);
          this.esperada = 0;
          if (e) this.abrir(e);
        }
      },
      error: e => {
        this.cargando = false;
        this.toast.error(e?.error?.message || 'No se pudieron cargar las empresas.');
      },
    });
  }

  alEscribir(v: string): void { this.busqueda = v; this.busqueda$.next(v); }

  filtrar(): void {
    const aguja = this.busqueda.trim().toLowerCase();

    this.empresas = this.todas.filter(e => {
      if (aguja) {
        const campos = `${e.nombre} ${e.subdominio ?? ''} ${e.nit ?? ''} ${e.email ?? ''}`.toLowerCase();
        if (!campos.includes(aguja)) return false;
      }

      const estado = e.suscripcion?.estado ?? null;

      switch (this.filtro) {
        case 'activas':     return estado === 'al_dia' && !e.suspendida;
        case 'prueba':      return estado === 'prueba';
        case 'mora':        return estado === 'en_mora';
        case 'suspendidas': return e.suspendida;
        case 'sin_plan':    return !e.suscripcion?.plan_id;
        default:            return true;
      }
    });
  }

  cambiarFiltro(f: Filtro): void { this.filtro = f; this.filtrar(); }

  alternarTr069(): void { this.conTr069 = !this.conTr069; this.cargar(); }

  // ── Detalle ───────────────────────────────────────────────────────────
  abrir(e: EmpresaConsola): void {
    this.seleccionada = e;
    this.detalle = null;
    this.editando = false;
    this.simulacion = null;
    this.cargandoDetalle = true;

    this.consola.empresa(e.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.detalle = r?.data ?? null;
        this.planes = this.detalle?.planes ?? [];
        this.cargarForma();
        this.cargandoDetalle = false;
      },
      error: err => {
        this.cargandoDetalle = false;
        this.toast.error(err?.error?.message || 'No se pudo abrir la empresa.');
      },
    });
  }

  cerrar(): void { this.seleccionada = null; this.detalle = null; this.editando = false; }

  @HostListener('document:keydown.escape')
  alEscapar(): void {
    if (this.modalPago) { this.modalPago = false; return; }
    if (this.modalCobro) { this.modalCobro = false; return; }
    this.cerrar();
  }

  private cargarForma(): void {
    const s = this.detalle?.suscripcion;

    this.forma = {
      plan_id: s?.plan_id ?? null,
      ciclo: s?.ciclo ?? 'mensual',
      precio_pactado: s?.precio_pactado ?? null,
      estado: s?.estado ?? 'prueba',
      metodo_pago: s?.metodo_pago ?? '',
      inicio: s?.inicio ?? '',
      prueba_hasta: s?.prueba_hasta ?? '',
      proxima_facturacion: s?.proxima ?? '',
      notas: s?.notas ?? '',
    };
  }

  /** El precio de lista del plan elegido, para mostrarlo al lado del pactado. */
  get precioDeLista(): number | null {
    const p = this.planes.find(x => x.id === Number(this.forma.plan_id));
    if (!p) return null;
    return this.forma.ciclo === 'anual' ? p.precio_anual : p.precio_mensual;
  }

  guardarSuscripcion(): void {
    if (!this.seleccionada) return;
    this.guardando = true;

    const datos = {
      ...this.forma,
      plan_id: this.forma.plan_id ? Number(this.forma.plan_id) : null,
      precio_pactado: this.forma.precio_pactado === null || this.forma.precio_pactado === ('' as any) ? null : Number(this.forma.precio_pactado),
      metodo_pago: this.forma.metodo_pago || null,
      inicio: this.forma.inicio || null,
      prueba_hasta: this.forma.prueba_hasta || null,
      proxima_facturacion: this.forma.proxima_facturacion || null,
      notas: this.forma.notas || null,
    };

    this.consola.guardarSuscripcion(this.seleccionada.id, datos).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.guardando = false;
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r?.message || 'Suscripción guardada.');
        this.editando = false;
        this.recargar();
      },
      error: e => { this.guardando = false; this.toast.error(e?.error?.message || 'No se pudo guardar.'); },
    });
  }

  // ── Cupón y crédito ───────────────────────────────────────────────────
  aplicarCupon(): void {
    if (!this.seleccionada || !this.codigoCupon.trim()) return;

    this.consola.aplicarCupon(this.seleccionada.id, this.codigoCupon.trim()).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.codigoCupon = '';
        this.recargar();
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo aplicar el cupón.'),
    });
  }

  async quitarCupon(): Promise<void> {
    if (!this.seleccionada) return;
    if (!await this.dialog.confirm('¿Quitar el cupón de esta empresa? Desde el próximo cobro paga el precio completo.')) return;

    this.consola.quitarCupon(this.seleccionada.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: () => { this.toast.success('Cupón quitado.'); this.recargar(); },
      error: e => this.toast.error(e?.error?.message || 'No se pudo quitar el cupón.'),
    });
  }

  ajustarCredito(): void {
    if (!this.seleccionada || !this.montoCredito || !this.notaCredito.trim()) {
      this.toast.error('Poné el monto y por qué se ajusta.');
      return;
    }

    this.consola.ajustarCredito(this.seleccionada.id, Number(this.montoCredito), this.notaCredito.trim())
      .pipe(takeUntil(this.destruir$)).subscribe({
        next: r => {
          if (r?.error) { this.toast.error(r.message); return; }
          this.toast.success(r.message);
          this.montoCredito = null;
          this.notaCredito = '';
          this.recargar();
        },
        error: e => this.toast.error(e?.error?.message || 'No se pudo ajustar el crédito.'),
      });
  }

  // ── Cobros ────────────────────────────────────────────────────────────
  simular(): void {
    if (!this.seleccionada) return;
    this.simulacion = null;
    this.modalCobro = true;

    this.consola.simular(this.seleccionada.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => { this.simulacion = r?.data ?? { ok: false, motivo: r?.message }; },
      error: e => { this.simulacion = { ok: false, motivo: e?.error?.message || 'No se pudo simular el cobro.' }; },
    });
  }

  confirmarCobro(): void {
    if (!this.seleccionada) return;
    this.guardando = true;

    this.consola.generarCobro(this.seleccionada.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.guardando = false;
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.modalCobro = false;
        this.recargar();
      },
      error: e => { this.guardando = false; this.toast.error(e?.error?.message || 'No se pudo generar el cobro.'); },
    });
  }

  abrirPago(cobro: any): void {
    this.cobroDelPago = cobro;
    this.archivoPago = null;
    this.pago = {
      monto: cobro.saldo,
      fecha: new Date().toISOString().slice(0, 10),
      metodo: this.detalle?.suscripcion?.metodo_pago || 'transferencia',
      referencia: '',
      nota: '',
    };
    this.modalPago = true;
  }

  elegirArchivo(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.archivoPago = input.files?.[0] ?? null;
  }

  registrarPago(): void {
    if (!this.cobroDelPago || !this.pago.monto) return;
    this.guardando = true;

    const datos = new FormData();
    datos.append('monto', String(this.pago.monto));
    datos.append('fecha', this.pago.fecha);
    datos.append('metodo', this.pago.metodo);
    if (this.pago.referencia) datos.append('referencia', this.pago.referencia);
    if (this.pago.nota) datos.append('nota', this.pago.nota);
    if (this.archivoPago) datos.append('comprobante', this.archivoPago);

    this.consola.registrarPago(this.cobroDelPago.id, datos).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.guardando = false;
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.modalPago = false;
        this.recargar();
      },
      error: e => { this.guardando = false; this.toast.error(e?.error?.message || 'No se pudo registrar el pago.'); },
    });
  }

  async anular(cobro: any): Promise<void> {
    if (!await this.dialog.confirm(`¿Anular el cobro del período ${cobro.periodo_inicio}? El crédito que haya consumido se le devuelve.`)) return;

    this.consola.anularCobro(cobro.id, 'Anulado desde la consola').pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success('Cobro anulado.');
        this.recargar();
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo anular.'),
    });
  }

  // ── Suspender / reactivar ─────────────────────────────────────────────
  async suspender(): Promise<void> {
    if (!this.seleccionada) return;

    const ok = await this.dialog.confirm(
      `¿Suspender el acceso de ${this.seleccionada.nombre} a la plataforma?\n\n` +
      'Su equipo deja de entrar al panel. Sus clientes NO se ven afectados: siguen con internet y con su portal abierto.',
      { okLabel: 'Suspender' }
    );

    if (!ok) return;

    this.consola.suspender(this.seleccionada.id, 'Suspendida desde la consola').pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.cargar();
        this.recargar();
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo suspender.'),
    });
  }

  async reactivar(): Promise<void> {
    if (!this.seleccionada) return;
    if (!await this.dialog.confirm(`¿Devolverle el acceso al panel a ${this.seleccionada.nombre}?`, { okLabel: 'Reactivar' })) return;

    this.consola.reactivar(this.seleccionada.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.cargar();
        this.recargar();
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo reactivar.'),
    });
  }

  private recargar(): void {
    if (this.seleccionada) this.abrir(this.seleccionada);
    this.cargar();
  }

  // ── Presentación ──────────────────────────────────────────────────────
  claseEstado(e: EmpresaConsola): string {
    if (e.suspendida) return 'np-pill--suspended';

    switch (e.suscripcion?.estado) {
      case 'al_dia':  return 'np-pill--active';
      case 'en_mora': return 'np-pill--suspended';
      case 'prueba':  return 'np-pill--info';
      default:        return 'np-pill--neutral';
    }
  }

  textoEstado(e: EmpresaConsola): string {
    if (e.suspendida) return 'Suspendida';
    return this.ESTADOS[e.suscripcion?.estado ?? ''] ?? 'Sin suscripción';
  }

  fecha(d: string | null | undefined): string {
    return d ? new Date(d).toLocaleDateString('es-CO') : '—';
  }

  fechaHora(d: string | null | undefined): string {
    return d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : 'sin registro';
  }
}
