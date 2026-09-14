import { Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
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
  templateUrl: './tareas-flotantes.component.html',
  styleUrl: './tareas-flotantes.component.scss',
})
export class TareasFlotantesComponent implements OnInit, OnDestroy {
  readonly svc = inject(TareasEnSegundoPlanoService);
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
    if (t.estado !== 'en_curso' || !generico) return t.detalle || (t.estado === 'listo' ? 'Listo' : 'No se pudo completar');

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
