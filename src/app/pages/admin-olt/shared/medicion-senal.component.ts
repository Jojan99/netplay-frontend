import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * De cuándo es la medición de señal que se ve y el botón para medir de nuevo.
 *
 * Abrir una pantalla ya no dispara un barrido de la OLT: se muestra la última
 * medición guardada (la revisión de alertas mide cada 15 minutos) y sólo
 * «Medir ahora» lanza una nueva.
 */
@Component({
  selector: 'app-medicion-senal',
  standalone: true,
  template: `
    <span class="ms" [class.is-vieja]="vieja">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12h3l3-8 4 16 3-8h7"/></svg>
      <span class="ms-txt">{{ texto }}</span>
      <button type="button" class="np-btn np-btn--ghost np-btn--sm" (click)="medir.emit()" [disabled]="midiendo || deshabilitado"
              title="Le pregunta a la OLT por la señal de todas las ONT (tarda cerca de un minuto)">
        {{ midiendo ? 'Midiendo…' : 'Medir ahora' }}
      </button>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; min-width: 0; }
    .ms { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; color: var(--text-2); }
    .ms svg { width: 14px; height: 14px; flex: none; color: var(--text-3); }
    .ms-txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ms.is-vieja .ms-txt { color: var(--warn); }
    @media (max-width: 760px) { .ms-txt { white-space: normal; } }
  `],
})
export class MedicionSenalComponent {
  /** ISO de la medición guardada, o null si no hay. */
  @Input() medidoEn: string | null = null;
  @Input() midiendo = false;
  @Input() deshabilitado = false;
  @Output() medir = new EventEmitter<void>();

  /** Más de una hora: se avisa en otro color. */
  get vieja(): boolean {
    return !!this.medidoEn && Date.now() - new Date(this.medidoEn).getTime() > 3600_000;
  }

  get texto(): string {
    if (this.midiendo && !this.medidoEn) return 'Midiendo la señal…';
    if (!this.medidoEn) return 'Sin medición de señal guardada';

    const d = new Date(this.medidoEn);
    const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
    const hace = min < 1 ? 'recién' : min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h ${min % 60} min`;

    return `Señal medida a las ${hora} (${hace})`;
  }
}
