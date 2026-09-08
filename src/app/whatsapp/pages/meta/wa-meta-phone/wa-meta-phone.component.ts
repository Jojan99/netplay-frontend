import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

@Component({
  selector: 'app-wa-meta-phone',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-page">
      <header class="np-head">
        <div><p class="np-kicker">WhatsApp <b>/</b> API de Meta <b>/</b> Número</p><h1 class="np-title">{{ phoneInfo?.display_phone_number || phoneInfo?.phone_number || 'Número de WhatsApp' }}</h1>
          <div class="np-ribbon" *ngIf="phoneInfo"><span><span class="np-pill np-pill--active">{{ phoneInfo.verified_name }}</span></span><span>calidad <span class="np-n">{{ phoneInfo.quality_rating }}</span></span><span>modo <span class="np-mono">{{ phoneInfo.account_mode }}</span></span></div></div>
      </header>
      <div class="np-scroll">
        <div *ngIf="loading" class="np-loading"><span class="np-spinner"></span> Consultando a Meta…</div>
        <p class="np-notice np-notice--danger" *ngIf="!loading && !phoneInfo">No se pudo obtener la información del número. Revisá las credenciales en Configuración.</p>
        <section class="np-card" *ngIf="!loading && phoneInfo">
          <div class="np-card-h"><h2>Información del número</h2></div>
          <dl class="np-dl">
            <dt>Número</dt><dd class="np-mono">{{ phoneInfo.display_phone_number || phoneInfo.phone_number }}</dd>
            <dt>Nombre verificado</dt><dd>{{ phoneInfo.verified_name || '—' }}</dd>
            <dt>Calidad</dt><dd>{{ phoneInfo.quality_rating || '—' }}</dd>
            <dt>Modo</dt><dd class="np-mono">{{ phoneInfo.account_mode || '—' }}</dd>
          </dl>
        </section>
      </div>
    </div>
  `
})
export class WaMetaPhoneComponent implements OnInit {
  loading = true;
  phoneInfo: any = null;

  constructor(private meta: MetaWhatsappService) {}

  ngOnInit(): void {
    this.meta.getPhoneInfo().subscribe({
      next: (r: any) => { this.phoneInfo = r.data; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }
}
