import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ConsolaService, PlanConsola, pesos } from '../../../services/consola.service';
import { DialogService } from '../../../services/dialog.service';
import { ToastService } from '../../../services/toast.service';

/**
 * Los planes que vende Netvula.
 *
 * Cambiar un precio acá no cambia lo que paga nadie: cada empresa tiene su
 * precio pactado. Para pasarlas al precio nuevo hay un botón aparte que dice
 * a cuántas afecta antes de tocar nada.
 */
@Component({
  selector: 'app-consola-planes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consola-planes.component.html',
  styleUrl: './consola-planes.component.scss',
})
export class ConsolaPlanesComponent implements OnInit, OnDestroy {
  private destruir$ = new Subject<void>();
  private consola = inject(ConsolaService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  cargando = true;
  guardando = false;
  enBase = true;
  moneda = 'COP';
  notaPrecios = '';

  planes: PlanConsola[] = [];

  modal = false;
  editando: PlanConsola | null = null;
  forma = this.formaVacia();
  incluyeTexto = '';
  motivoPrecio = '';

  /** Historial de precios y empresas del plan abierto. */
  modalPrecios = false;
  planDelHistorial: PlanConsola | null = null;
  historial: any[] = [];
  afectadas: any[] = [];
  /** Cuántas de las afectadas tienen precio especial (las que cambiarían). */
  conPrecioEspecial = 0;

  pesos = pesos;

  ngOnInit(): void { this.cargar(); }

  ngOnDestroy(): void { this.destruir$.next(); this.destruir$.complete(); }

  cargar(): void {
    this.cargando = true;

    this.consola.planes().pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        const d = r?.data ?? {};
        this.planes = d.planes ?? [];
        this.enBase = d.en_base !== false;
        this.moneda = d.moneda ?? 'COP';
        this.notaPrecios = d.nota_precios ?? '';
        this.cargando = false;
      },
      error: e => { this.cargando = false; this.toast.error(e?.error?.message || 'No se pudieron cargar los planes.'); },
    });
  }

  private formaVacia() {
    return {
      clave: '', nombre: '', para: '',
      precio_mensual: null as number | null,
      precio_anual: null as number | null,
      clientes: null as number | null,
      destacado: false, activo: true, orden: 0,
    };
  }

  nuevo(): void {
    this.editando = null;
    this.forma = this.formaVacia();
    this.forma.orden = (this.planes.length + 1) * 10;
    this.incluyeTexto = '';
    this.motivoPrecio = '';
    this.modal = true;
  }

  abrir(p: PlanConsola): void {
    this.editando = p;
    this.forma = {
      clave: p.clave, nombre: p.nombre, para: p.para ?? '',
      precio_mensual: p.precio_mensual, precio_anual: p.precio_anual,
      clientes: p.clientes, destacado: p.destacado, activo: p.activo, orden: p.orden,
    };
    this.incluyeTexto = (p.incluye ?? []).join('\n');
    this.motivoPrecio = '';
    this.modal = true;
  }

  @HostListener('document:keydown.escape')
  alEscapar(): void { this.modal = false; this.modalPrecios = false; }

  guardar(): void {
    if (!this.forma.clave.trim() || !this.forma.nombre.trim()) {
      this.toast.error('La clave y el nombre son obligatorios.');
      return;
    }

    this.guardando = true;

    const datos = {
      ...this.forma,
      clave: this.forma.clave.trim().toLowerCase(),
      para: this.forma.para || null,
      incluye: this.incluyeTexto.split('\n').map(l => l.trim()).filter(Boolean),
      motivo_precio: this.motivoPrecio || null,
    };

    const peticion = this.editando?.id
      ? this.consola.guardarPlan(this.editando.id, datos)
      : this.consola.crearPlan(datos);

    peticion.pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.guardando = false;
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.modal = false;
        this.cargar();
      },
      error: e => { this.guardando = false; this.toast.error(e?.error?.message || 'No se pudo guardar el plan.'); },
    });
  }

  async borrar(p: PlanConsola): Promise<void> {
    if (!p.id) return;
    if (!await this.dialog.confirm(`¿Eliminar el plan "${p.nombre}"?`)) return;

    this.consola.borrarPlan(p.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.cargar();
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo borrar.'),
    });
  }

  verPrecios(p: PlanConsola): void {
    if (!p.id) return;
    this.planDelHistorial = p;
    this.historial = [];
    this.afectadas = [];
    this.modalPrecios = true;

    this.consola.preciosDelPlan(p.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.historial = r?.data?.historial ?? [];
        this.afectadas = r?.data?.afectadas ?? [];
        // Las que hoy tienen precio especial son las que cambiarían.
        this.conPrecioEspecial = this.afectadas.filter(a => a.precio_pactado !== null).length;
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo leer el historial.'),
    });
  }

  async pasarAlPrecioNuevo(): Promise<void> {
    if (!this.planDelHistorial?.id) return;

    const cuantas = this.conPrecioEspecial;

    const ok = await this.dialog.confirm(
      cuantas === 0
        ? 'Ninguna empresa de este plan tiene precio especial: ya pagan el de lista.'
        : `Esto le quita el precio pactado a ${cuantas} empresa(s) del plan "${this.planDelHistorial.nombre}". ` +
          'Desde su próximo cobro pagan el precio de lista.',
      { okLabel: 'Pasarlas al precio nuevo' }
    );

    if (!ok || cuantas === 0) return;

    this.consola.aplicarPrecio(this.planDelHistorial.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.verPrecios(this.planDelHistorial!);
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo aplicar el precio.'),
    });
  }

  fecha(d: string | null | undefined): string {
    return d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }
}
