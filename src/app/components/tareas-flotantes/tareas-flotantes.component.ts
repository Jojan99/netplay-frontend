import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { TareaSeguida, TareasEnSegundoPlanoService } from '../../services/tareas-en-segundo-plano.service';

/**
 * Ventana flotante con las tareas que corren en segundo plano.
 *
 * Aparece sola cuando se lanza una, cuenta en qué paso va y cuánto lleva, y se
 * minimiza a una pastilla para seguir trabajando. Vive en el layout del panel,
 * así que acompaña al usuario aunque cambie de pantalla.
 */
@Component({
  selector: 'app-tareas-flotantes',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './tareas-flotantes.component.html',
  styleUrl: './tareas-flotantes.component.scss',
})
export class TareasFlotantesComponent implements OnInit, OnDestroy {
  readonly svc = inject(TareasEnSegundoPlanoService);
  private router = inject(Router);

  /** Siempre con confirmación, diciendo qué queda hecho. */
  detener(t: TareaSeguida): void {
    const como = this.svc.comoSePara(t);
    const pregunta = como.modo === 'detener' ? `¿Detener «${t.titulo}»?` : `¿Dejar de seguir «${t.titulo}»?`;
    if (!confirm(`${pregunta}\n\n${como.aviso}`)) return;
    this.svc.detener(t.id);
  }

  verDetalle(t: TareaSeguida): void {
    if (!t.enlace) return;
    this.router.navigateByUrl(t.enlace);
    this.svc.alternarMinimizado();
  }
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  /** Reloj para el tiempo transcurrido y los pasos estimados. */
  readonly ahora = signal(Date.now());
  private reloj: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (this.enNavegador) this.reloj = setInterval(() => this.ahora.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  get terminadas(): number {
    return this.svc.tareas().filter(t => t.estado !== 'en_curso').length;
  }

  /**
   * Lo que está haciendo. Si el servidor todavía no contó nada, se dice algo
   * razonable según el tiempo que lleva, en vez de dejar la línea vacía.
   */
  paso(t: TareaSeguida): string {
    const generico = !t.detalle || /^en cola$/i.test(t.detalle);
    if (t.estado !== 'en_curso' || !generico) {
      return t.detalle || ({ listo: 'Listo', detenida: 'Detenida', no_aplica: 'No se puede configurar solo' } as Record<string, string>)[t.estado] || 'No se pudo completar';
    }

    const seg = (this.ahora() - t.inicio) / 1000;
    if (seg < 6) return 'Iniciando…';
    if (seg < 40) return 'Trabajando en la OLT…';
    return 'Ajustando los últimos detalles…';
  }

  duracion(t: TareaSeguida): string {
    const seg = Math.max(0, Math.round(((t.fin ?? this.ahora()) - t.inicio) / 1000));
    return seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min ${String(seg % 60).padStart(2, '0')} s`;
  }
}
