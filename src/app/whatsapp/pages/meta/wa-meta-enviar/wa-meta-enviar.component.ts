import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

@Component({
  selector: 'app-wa-meta-enviar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-page">
      <header class="np-head">
        <div><p class="np-kicker">WhatsApp <b>/</b> API de Meta <b>/</b> Enviar</p><h1 class="np-title">Enviar mensaje de prueba</h1><div class="np-ribbon"><span *ngIf="windowInfo"><i class="np-dot" [style.background]="windowInfo.has_window ? 'var(--ok)' : 'var(--warn)'"></i>ventana 24 h {{ windowInfo.has_window ? 'activa hasta ' + windowInfo.expires_at : 'inactiva: enviá una plantilla primero' }}</span><span *ngIf="!windowInfo">Texto libre sólo dentro de la ventana de 24 h; fuera de ella, plantilla.</span></div></div>
      </header>
      <div class="np-scroll"><div class="np-grid-3">
        <section class="np-card">
          <div class="np-card-h"><h2>Mensaje</h2></div>
          <div class="np-form">
            <label class="np-field"><span>Número destino</span><input type="text" class="np-input np-mono" [(ngModel)]="to" placeholder="573001234567" /></label>
            <label class="np-field"><span>Tipo</span><select class="np-input" [(ngModel)]="type"><option value="text">Texto</option><option value="template">Plantilla</option></select></label>
            <label class="np-field np-field-full" *ngIf="type === 'text'"><span>Mensaje</span><textarea class="np-input np-textarea" [(ngModel)]="message" rows="4"></textarea></label>
            <label class="np-field np-field-full" *ngIf="type === 'template'"><span>Nombre de la plantilla</span><input type="text" class="np-input np-mono" [(ngModel)]="templateName" /></label>
            <div class="np-field-full np-btnrow np-btnrow--end"><button type="button" class="np-btn np-btn--ghost" (click)="checkWindow()" [disabled]="!to">Verificar ventana 24 h</button><button type="button" class="np-btn np-btn--primary" (click)="send()" [disabled]="sending">{{ sending ? 'Enviando…' : 'Enviar' }}</button></div>
          </div>
        </section>
        <section class="np-card">
          <div class="np-card-h"><h2>Resultado</h2></div>
          <p class="np-muted" *ngIf="!result">Todavía no enviaste nada.</p>
          <p class="np-notice" *ngIf="result" [ngClass]="result.ok ? 'np-notice--ok' : 'np-notice--danger'">{{ result.message }}</p>
        </section>
      </div></div>
    </div>
  `
})
export class WaMetaEnviarComponent {
  to = '';
  type = 'text';
  message = '';
  templateName = '';
  sending = false;
  result: any = null;
  windowInfo: any = null;

  constructor(private meta: MetaWhatsappService) {}

  send(): void {
    this.sending = true;
    this.result = null;
    this.meta.sendTest({
      to: this.to,
      type: this.type,
      message: this.message,
      template_name: this.templateName,
    }).subscribe({
      next: (r: any) => {
        this.sending = false;
        this.result = { ok: true, message: 'Mensaje enviado correctamente' };
      },
      error: (e: any) => {
        this.sending = false;
        this.result = { ok: false, message: e.error?.error || 'Error al enviar' };
      }
    });
  }

  checkWindow(): void {
    if (!this.to) return;
    this.meta.checkWindow(this.to).subscribe({
      next: (r: any) => { this.windowInfo = r; }
    });
  }
}
