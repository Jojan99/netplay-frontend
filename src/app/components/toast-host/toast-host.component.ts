import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

/**
 * Los avisos flotantes, para pantallas que no viven dentro del panel.
 *
 * El panel los dibuja en su propio layout. La consola de Netvula tiene su
 * armazón aparte y no los tenía: cada `toast.success(...)` y cada
 * `toast.error(...)` de sus pantallas se perdía en el aire, así que una
 * operación que fallaba se veía igual que una que salía bien.
 *
 * (El panel todavía tiene su copia del marcado en layout.component.html. Son
 * dos implementaciones del mismo aviso; unificarlas es cambiar una pantalla
 * que hoy funciona, así que se deja anotado.)
 */
@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="th-zona" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="th-aviso" [attr.data-tipo]="t.type" role="status">
          <span>{{ t.message }}</span>
          <button type="button" (click)="toasts.dismiss(t.id)" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .th-zona {
      position: fixed; z-index: 9500; bottom: 20px; left: 50%; transform: translateX(-50%);
      display: grid; gap: 8px; width: min(420px, calc(100vw - 32px));
      pointer-events: none;
    }
    .th-aviso {
      pointer-events: auto;
      display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: var(--radius-lg, 10px);
      background: var(--surface); color: var(--text);
      border: 1px solid var(--line-strong); border-left: 4px solid var(--accent);
      box-shadow: 0 14px 34px -12px rgba(0, 10, 30, .45);
      font-size: 12.5px; line-height: 1.45;
      animation: th-entra .16s ease-out;

      span { flex: 1; min-width: 0; overflow-wrap: anywhere; }
      button { appearance: none; border: 0; background: none; cursor: pointer; color: var(--text-3); flex: none;
        svg { width: 14px; height: 14px; }
        &:hover { color: var(--text); } }

      &[data-tipo="success"] { border-left-color: var(--ok); }
      &[data-tipo="error"]   { border-left-color: var(--danger); }
      &[data-tipo="warning"] { border-left-color: var(--warn); }
      &[data-tipo="info"]    { border-left-color: var(--info); }
    }
    @keyframes th-entra { from { opacity: 0; transform: translateY(8px); } }
  `],
})
export class ToastHostComponent {
  readonly toasts = inject(ToastService);
}
