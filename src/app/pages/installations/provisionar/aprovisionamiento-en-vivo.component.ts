import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject } from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { startWith, switchMap } from 'rxjs/operators';
import { InstallationService } from '../../../services/installation.service';

const ESTADOS_TERMINADOS = ['listo', 'con_errores', 'error', 'vencido', 'no_aplica', 'cancelado', 'reemplazado'];

/**
 * Lo que el técnico ve mientras el equipo recién instalado se configura solo.
 *
 * El aprovisionamiento no pasa en el momento: queda programado y una tarea que corre cada minuto se lo
 * aplica cuando la ONT se reporta al TR-069 (ver AprovisionamientoDeOnt en el backend). Antes de esto, la
 * única señal era un texto fijo —«Corre sola en los próximos minutos»— y el técnico se iba sin saber si
 * de verdad pasó algo. Acá se consulta cada pocos segundos y se anima paso a paso, como si viera la
 * información llegando al equipo, hasta que termina (bien o mal) y deja de preguntar.
 */
@Component({
  selector: 'app-aprovisionamiento-en-vivo',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './aprovisionamiento-en-vivo.component.html',
  styleUrl: './aprovisionamiento-en-vivo.component.scss',
})
export class AprovisionamientoEnVivoComponent implements OnChanges, OnDestroy {
  private svc = inject(InstallationService);

  @Input({ required: true }) ordenId!: number;

  cargando = true;
  estado: string | null = null;
  detalle = '';
  pasos: any[] = [];
  motivo: string | null = null;
  queHacer: string | null = null;

  /** Desde cuándo está esto en curso, para el reloj: se congela en cuanto termina. */
  creadoEn: number | null = null;
  segundos = 0;

  private sub?: Subscription;
  private reloj?: Subscription;

  get enCurso(): boolean {
    return !!this.estado && !ESTADOS_TERMINADOS.includes(this.estado);
  }

  get termino(): boolean {
    return !!this.estado && ESTADOS_TERMINADOS.includes(this.estado);
  }

  get ok(): boolean {
    return this.estado === 'listo';
  }

  get sinResolver(): boolean {
    return ['con_errores', 'error', 'vencido'].includes(this.estado || '');
  }

  /** «0:45», «2:03»… para que el técnico vea que sigue vivo y cuánto lleva. */
  get tiempo(): string {
    const m = Math.floor(this.segundos / 60);
    const s = this.segundos % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  get titulo(): string {
    switch (this.estado) {
      case 'esperando':   return 'Esperando a que el equipo se reporte…';
      case 'aplicando':   return 'Aplicando la configuración…';
      case 'listo':       return 'Configuración aplicada';
      case 'con_errores': return 'Terminó con algunas fallas';
      case 'error':       return 'No se pudo aplicar';
      case 'vencido':     return 'El equipo no se reportó a tiempo';
      case 'no_aplica':   return 'No se puede configurar solo';
      case 'cancelado':   return 'Cancelado';
      default:            return 'Consultando…';
    }
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['ordenId']) this.empezar();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.reloj?.unsubscribe();
  }

  private empezar(): void {
    this.sub?.unsubscribe();
    this.reloj?.unsubscribe();
    this.cargando = true;
    this.estado = null;
    this.pasos = [];
    this.creadoEn = null;
    this.segundos = 0;

    // Un tic por segundo, aparte del polling: así el reloj no salta de 2.5 en 2.5.
    this.reloj = interval(1000).subscribe(() => {
      if (this.creadoEn) this.segundos = Math.max(0, Math.floor((Date.now() - this.creadoEn) / 1000));
    });

    // Cada 2.5s hasta que llegue a un estado final; ahí se deja de preguntar solo.
    this.sub = interval(2500).pipe(
      startWith(0),
      switchMap(() => this.svc.aprovisionamiento(this.ordenId)),
    ).subscribe({
      next: (r: any) => {
        this.cargando = false;
        const a = r?.data;

        if (!a) {
          // Sin aprovisionamiento programado: no hay nada que animar.
          this.estado = 'no_aplica';
          this.detalle = 'Esta instalación no tiene configuración automática.';
          this.sub?.unsubscribe();
          this.reloj?.unsubscribe();
          return;
        }

        this.estado = a.estado;
        this.detalle = a.detalle || '';
        this.pasos = a.pasos || [];
        this.motivo = a.motivo || null;
        this.queHacer = a.que_hacer || null;
        if (a.creado && this.creadoEn === null) this.creadoEn = new Date(a.creado).getTime();

        if (ESTADOS_TERMINADOS.includes(a.estado)) {
          this.sub?.unsubscribe();
          this.reloj?.unsubscribe();
        }
      },
      error: () => { this.cargando = false; },
    });
  }

  trackByIndex(i: number): number { return i; }
}
