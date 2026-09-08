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
  `,
  styles: [`
    .np-overlay--top { z-index: 200; }
    .np-confirm-ico { display: grid; place-items: center; width: 52px; height: 52px; margin: 0 auto 12px; border-radius: 50%; background: var(--info-soft); color: var(--info); }
    .np-confirm-ico svg { width: 26px; height: 26px; }
    .np-confirm-ico.is-danger { background: var(--danger-soft); color: var(--danger); }
    h3 { margin: 0 0 6px; font-family: var(--font-display); font-weight: 600; font-size: 18px; color: var(--text); }
    .np-confirm-msg { margin: 0 0 18px; font-size: 14px; line-height: 1.5; color: var(--text-2); white-space: pre-wrap; }
    .np-btnrow--center { justify-content: center; }
  `],
})
export class DialogHostComponent {
  constructor(public dialog: DialogService) {}
  @HostListener('document:keydown.escape') onEsc(): void { if (this.dialog.current()) this.dialog.answer(false); }
  @HostListener('document:keydown.enter') onEnter(): void { if (this.dialog.current()) this.dialog.answer(true); }
}
