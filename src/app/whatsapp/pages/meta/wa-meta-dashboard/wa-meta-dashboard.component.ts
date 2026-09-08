import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MetaWhatsappService } from '../../../services/meta-whatsapp.service';

@Component({
  selector: 'app-wa-meta-dashboard',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-page">
      <header class="np-head">
        <div><p class="np-kicker">WhatsApp <b>/</b> API de Meta</p><h1 class="np-title">Resumen</h1><div class="np-ribbon"><span>Estado de la integración oficial de WhatsApp Business.</span></div></div>
      </header>
      <div class="np-scroll">
        <section class="np-kpis np-kpis--3">
          <div class="np-kpi np-kpi--accent"><span class="np-kpi-l">Proveedor</span><span class="np-kpi-v np-kpi-v--text">API oficial de Meta</span><span class="np-kpi-s">WhatsApp Business Platform</span></div>
          <div class="np-kpi"><span class="np-kpi-l">Estado</span><span class="np-kpi-v np-kpi-v--ok np-kpi-v--text">Activo</span><span class="np-kpi-s">integración operativa</span></div>
          <div class="np-kpi"><span class="np-kpi-l">Webhook</span><span class="np-kpi-v np-kpi-v--text">Configurado</span><span class="np-kpi-s np-mono">/api/webhooks/whatsapp-meta</span></div>
        </section>
      </div>
    </div>
    <style>.np-kpi-v--text { font-family: var(--font-display); font-size: 17px; }</style>
  `
})
export class WaMetaDashboardComponent {}
