import { Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ConsolaService, CuponConsola, PlanConsola, pesos } from '../../../services/consola.service';
import { DialogService } from '../../../services/dialog.service';
import { ToastService } from '../../../services/toast.service';

/** Códigos de descuento: alta, edición y quién los usó. */
@Component({
  selector: 'app-consola-cupones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consola-cupones.component.html',
  styleUrl: './consola-cupones.component.scss',
})
export class ConsolaCuponesComponent implements OnInit, OnDestroy {
  private destruir$ = new Subject<void>();
  private consola = inject(ConsolaService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  cargando = true;
  guardando = false;
  migrada = true;

  cupones: CuponConsola[] = [];
  planes: PlanConsola[] = [];

  /** Resumen de la cinta de la cabecera, calculado al cargar. */
  vigentes = 0;
  usosTotales = 0;

  /** Filas de mentira mientras llega la lista. */
  readonly esqueleto = [1, 2, 3, 4];

  modal = false;
  editando: CuponConsola | null = null;
  forma = this.formaVacia();
  /** Marcas de a qué planes y ciclos aplica; vacío = a todos. */
  planesElegidos: Record<string, boolean> = {};
  ciclosElegidos: Record<string, boolean> = { mensual: false, anual: false };

  modalUsos = false;
  cuponDeLosUsos: CuponConsola | null = null;
  usos: any[] = [];

  pesos = pesos;

  ngOnInit(): void { this.cargar(); }

  ngOnDestroy(): void { this.destruir$.next(); this.destruir$.complete(); }

  cargar(): void {
    this.cargando = true;

    this.consola.cupones().pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.cupones = r?.data?.cupones ?? [];
        this.planes = r?.data?.planes ?? [];
        this.migrada = r?.data?.migrada !== false;
        this.vigentes = this.cupones.filter(c => c.activo && !c.vencido && !c.agotado).length;
        this.usosTotales = this.cupones.reduce((suma, c) => suma + (c.usos || 0), 0);
        this.cargando = false;
      },
      error: e => { this.cargando = false; this.toast.error(e?.error?.message || 'No se pudieron cargar los cupones.'); },
    });
  }

  private formaVacia() {
    return {
      codigo: '', descripcion: '',
      tipo: 'porcentaje' as 'porcentaje' | 'monto',
      valor: null as number | null,
      desde: '', hasta: '',
      usos_maximos: null as number | null,
      usos_por_empresa: 1,
      duracion: 'primer_periodo' as 'primer_periodo' | 'n_periodos' | 'permanente',
      periodos: 3,
      activo: true,
      notas: '',
    };
  }

  nuevo(): void {
    this.editando = null;
    this.forma = this.formaVacia();
    this.planesElegidos = {};
    this.ciclosElegidos = { mensual: false, anual: false };
    this.modal = true;
  }

  abrir(c: CuponConsola): void {
    this.editando = c;
    this.forma = {
      codigo: c.codigo, descripcion: c.descripcion ?? '',
      tipo: c.tipo, valor: c.valor,
      desde: c.desde ?? '', hasta: c.hasta ?? '',
      usos_maximos: c.usos_maximos, usos_por_empresa: c.usos_por_empresa,
      duracion: c.duracion, periodos: c.periodos ?? 3,
      activo: c.activo, notas: c.notas ?? '',
    };

    this.planesElegidos = {};
    (c.planes ?? []).forEach(p => this.planesElegidos[p] = true);
    this.ciclosElegidos = { mensual: (c.ciclos ?? []).includes('mensual'), anual: (c.ciclos ?? []).includes('anual') };
    this.modal = true;
  }

  @HostListener('document:keydown.escape')
  alEscapar(): void { this.modal = false; this.modalUsos = false; }

  guardar(): void {
    if (!this.forma.codigo.trim() || !this.forma.valor) {
      this.toast.error('Ingrese el código y el valor del descuento.');
      return;
    }

    if (this.forma.tipo === 'porcentaje' && this.forma.valor > 100) {
      this.toast.error('Un descuento por porcentaje no puede pasar del 100%.');
      return;
    }

    this.guardando = true;

    const datos = {
      ...this.forma,
      codigo: this.forma.codigo.trim().toUpperCase(),
      descripcion: this.forma.descripcion || null,
      desde: this.forma.desde || null,
      hasta: this.forma.hasta || null,
      notas: this.forma.notas || null,
      planes: Object.keys(this.planesElegidos).filter(k => this.planesElegidos[k]),
      ciclos: Object.keys(this.ciclosElegidos).filter(k => this.ciclosElegidos[k]),
      periodos: this.forma.duracion === 'n_periodos' ? this.forma.periodos : null,
    };

    const peticion = this.editando
      ? this.consola.guardarCupon(this.editando.id, datos)
      : this.consola.crearCupon(datos);

    peticion.pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        this.guardando = false;
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.modal = false;
        this.cargar();
      },
      error: e => { this.guardando = false; this.toast.error(e?.error?.message || 'No se pudo guardar el cupón.'); },
    });
  }

  async borrar(c: CuponConsola): Promise<void> {
    if (!await this.dialog.confirm(`¿Eliminar el cupón ${c.codigo}?`)) return;

    this.consola.borrarCupon(c.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => {
        if (r?.error) { this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.cargar();
      },
      error: e => this.toast.error(e?.error?.message || 'No se pudo borrar.'),
    });
  }

  verUsos(c: CuponConsola): void {
    this.cuponDeLosUsos = c;
    this.usos = [];
    this.modalUsos = true;

    this.consola.usosDelCupon(c.id).pipe(takeUntil(this.destruir$)).subscribe({
      next: r => { this.usos = r?.data?.usos ?? []; },
      error: e => this.toast.error(e?.error?.message || 'No se pudieron leer los usos.'),
    });
  }

  descuento(c: CuponConsola): string {
    return c.tipo === 'porcentaje' ? `${c.valor}%` : pesos(c.valor);
  }

  duracion(c: CuponConsola): string {
    switch (c.duracion) {
      case 'permanente': return 'mientras dure la suscripción';
      case 'n_periodos': return `${c.periodos} períodos`;
      default:           return 'sólo el primer período';
    }
  }

  alcance(c: CuponConsola): string {
    const planes = c.planes?.length ? c.planes.join(', ') : 'todos los planes';
    const ciclos = c.ciclos?.length ? c.ciclos.join(' y ') : 'los dos ciclos';
    return `${planes} · ${ciclos}`;
  }

  estadoTexto(c: CuponConsola): string {
    if (!c.activo) return 'Desactivado';
    if (c.vencido) return 'Vencido';
    if (c.agotado) return 'Agotado';
    return 'Activo';
  }

  estadoClase(c: CuponConsola): string {
    if (!c.activo) return 'np-pill--neutral';
    return c.vencido || c.agotado ? 'np-pill--suspended' : 'np-pill--active';
  }

  /** La raya de color de la izquierda, con el mismo idioma que la píldora. */
  claseRaya(c: CuponConsola): string {
    if (!c.activo) return 'np-stripe--neutral';
    return c.vencido || c.agotado ? 'np-stripe--danger' : 'np-stripe--ok';
  }

  /** Cuánto le queda al cupón antes de agotarse. */
  porcentajeUso(c: CuponConsola): number {
    if (!c.usos_maximos) return 0;
    return Math.min(100, Math.round((c.usos / c.usos_maximos) * 100));
  }

  claseUso(c: CuponConsola): string {
    const p = this.porcentajeUso(c);
    if (p >= 100) return 'is-over';
    return p >= 80 ? 'is-warn' : '';
  }

  porId(i: number, c: { id?: number }): number { return c?.id ?? i; }
  porClave(i: number, p: PlanConsola): string { return p?.clave ?? String(i); }
  porIndice(i: number): number { return i; }

  fecha(d: string | null | undefined): string {
    return d ? new Date(d).toLocaleDateString('es-CO') : '—';
  }
}
