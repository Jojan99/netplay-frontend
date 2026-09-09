import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogService } from '../../services/dialog.service';

/** Modal global de confirmación (reemplaza a window.confirm). Se monta una vez en el layout. */
@Component({
  selector: 'app-dialog-host',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-overlay np-overlay--top" *ngIf="dialog.current() as d" (click)="dialog.answer(false)">
      <div class="np-modal np-modal--confirm" role="alertdialog" aria-modal="true" (click)="$event.stopPropagation()">
        <span class="np-confirm-ico" [class.is-danger]="d.opts.danger">
          <svg *ngIf="d.opts.danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4M12 17h.01M10.3 3.9 2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14.1a2 2 0 0 0-3.4 0z"/></svg>
          <svg *ngIf="!d.opts.danger" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5V14M12 17h.01"/></svg>
        </span>
        <h3 *ngIf="d.opts.title">{{ d.opts.title }}</h3>
        <p class="np-confirm-msg">{{ d.message }}</p>
        <div class="np-btnrow np-btnrow--center">
          <button type="button" class="np-btn np-btn--ghost" (click)="dialog.answer(false)">{{ d.opts.cancelLabel }}</button>
          <button type="button" class="np-btn" [class.np-btn--danger]="d.opts.danger" [class.np-btn--primary]="!d.opts.danger" (click)="dialog.answer(true)">{{ d.opts.okLabel }}</button>
        </div>
      </div>
    </div>

    <!-- Elegir entre varios caminos, no solo sí/no -->
    <div class="np-overlay np-overlay--top" *ngIf="dialog.currentChoice() as c" (click)="dialog.pick(null)">
      <div class="np-modal np-modal--confirm" role="alertdialog" aria-modal="true" (click)="$event.stopPropagation()">
        <h3 *ngIf="c.title">{{ c.title }}</h3>
        <p class="np-confirm-msg">{{ c.message }}</p>
        <div class="np-choice">
          <button type="button" class="np-choice-opt" *ngFor="let o of c.options" [disabled]="o.disabled" (click)="dialog.pick(o.id)">
            <b>{{ o.label }}</b>
            <small *ngIf="o.hint">{{ o.hint }}</small>
          </button>
        </div>
        <div class="np-btnrow np-btnrow--center">
          <button type="button" class="np-btn np-btn--ghost" (click)="dialog.pick(null)">Cancelar</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host, :host.np-console { display: contents !important; height: auto !important; }
    .np-overlay--top { z-index: 200; }
    .np-confirm-ico { display: grid; place-items: center; width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 50%; background: var(--info-soft); color: var(--info); }
    .np-confirm-ico svg { width: 26px; height: 26px; }
    .np-confirm-ico.is-danger { background: var(--danger-soft); color: var(--danger); }
    h3 { margin: 0 0 6px; font-family: var(--font-display); font-weight: 600; font-size: 18px; color: var(--text); }
    .np-confirm-msg { margin: 0 0 18px; font-size: 14px; line-height: 1.5; color: var(--text-2); white-space: pre-wrap; }
    .np-btnrow--center { justify-content: center; }
    .np-choice { display: grid; gap: 8px; margin-bottom: 16px; }
    .np-choice-opt {
      display: grid; gap: 2px; text-align: left; padding: 11px 13px;
      background: var(--surface); border: 1px solid var(--line-strong);
      border-radius: var(--radius); cursor: pointer; font-family: inherit;
      b { font-size: 13.5px; color: var(--text); }
      small { font-size: 12px; color: var(--text-3); line-height: 1.4; }
      &:hover:not(:disabled) { border-color: var(--accent); background: var(--accent-soft); }
      &:disabled { opacity: .5; cursor: default; }
    }
  `],
})
export class DialogHostComponent {
  constructor(public dialog: DialogService) {}
  @HostListener('document:keydown.escape') onEsc(): void {
    if (this.dialog.current()) this.dialog.answer(false);
    if (this.dialog.currentChoice()) this.dialog.pick(null);
  }
  @HostListener('document:keydown.enter') onEnter(): void { if (this.dialog.current()) this.dialog.answer(true); }
}
