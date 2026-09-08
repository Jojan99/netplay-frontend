import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CompanyWhatsappService } from '../../../../services/company-whatsapp.service';

@Component({
  selector: 'app-wa-meta-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-page">
      <header class="np-head">
        <div><p class="np-kicker">WhatsApp <b>/</b> API de Meta <b>/</b> Configuración</p><h1 class="np-title">Credenciales de Meta</h1><div class="np-ribbon"><span>Phone Number ID, WABA ID y token de acceso.</span></div></div>
        <div class="np-actions"><button type="button" class="np-btn np-btn--primary" (click)="save()" [disabled]="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button></div>
      </header>
      <div class="np-scroll"><div class="np-grid-2">
        <section class="np-card">
          <div class="np-card-h"><h2>Credenciales</h2></div>
          <div class="np-form np-form--single">
            <label class="np-field"><span>Phone Number ID</span><input type="text" class="np-input np-mono" [(ngModel)]="phoneNumberId" /></label>
            <label class="np-field"><span>WhatsApp Business Account ID (WABA)</span><input type="text" class="np-input np-mono" [(ngModel)]="businessId" /><small class="np-fine">Necesario para gestionar plantillas. Está en Facebook Developers → WhatsApp → API Setup.</small></label>
            <label class="np-field"><span>Access token</span><input type="password" class="np-input np-mono" [(ngModel)]="accessToken" placeholder="vacío = no cambiar" /></label>
            <p *ngIf="msg" class="np-notice" [ngClass]="error ? 'np-notice--danger' : 'np-notice--ok'">{{ msg }}</p>
          </div>
        </section>
        <section class="np-card">
          <div class="np-card-h"><h2>Webhook</h2></div>
          <p class="np-notice np-notice--code np-mono">https://netplay.com.co/api/webhooks/whatsapp-meta</p>
          <p class="np-fine">Registrá esta URL en la configuración de webhooks de tu app de Meta.</p>
        </section>
      </div></div>
    </div>
    <style>.np-form--single { grid-template-columns: 1fr; }</style>
  `
})
export class WaMetaPanelComponent implements OnInit {
  phoneNumberId = '';
  businessId = '';
  accessToken = '';
  saving = false;
  msg = '';
  error = false;

  constructor(private cwa: CompanyWhatsappService) {}

  ngOnInit(): void {
    this.cwa.getConfig().subscribe({
      next: (r: any) => {
        const d = r.data ?? r;
        this.phoneNumberId = d.wa_phone_number_id || '';
        this.businessId = d.wa_business_id || '';
      }
    });
  }

  save(): void {
    this.saving = true;
    this.msg = '';
    this.cwa.updateConfig({
      wa_provider: 'meta',
      wa_phone_number_id: this.phoneNumberId || null,
      wa_business_id: this.businessId || null,
      wa_access_token: this.accessToken || null,
    }).subscribe({
      next: () => {
        this.saving = false;
        this.msg = 'Configuración guardada';
        this.error = false;
      },
      error: (e: any) => {
        this.saving = false;
        this.msg = e.error?.message || 'Error al guardar';
        this.error = true;
      }
    });
  }
}
