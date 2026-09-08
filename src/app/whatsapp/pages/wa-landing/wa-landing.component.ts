import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-wa-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  host: { class: 'np-console' },
  template: `
    <div class="np-page">
      <header class="np-head">
        <div>
          <p class="np-kicker">Comunicación <b>/</b> WhatsApp</p>
          <h1 class="np-title">WhatsApp</h1>
          <div class="np-ribbon"><span>Elegí el proveedor que querés usar o configurar.</span></div>
        </div>
      </header>
      <div class="np-scroll">
        <div class="np-grid-2">
          <a routerLink="netplay" class="np-card np-provider">
            <div class="np-card-h"><h2>WhatsApp Web (QR)</h2><span class="np-pill np-pill--active">Servicio propio</span></div>
            <p>Usá tu propio número escaneando un código QR. Ideal para pruebas y control total.</p>
            <dl class="np-dl"><dt>Incluye</dt><dd>Instancias, envíos, programados, logs y webhook.</dd></dl>
            <span class="np-btn np-btn--primary np-provider-cta">Entrar</span>
          </a>
          <a routerLink="meta" class="np-card np-provider">
            <div class="np-card-h"><h2>API oficial de Meta</h2><span class="np-pill np-pill--info">WhatsApp Business</span></div>
            <p>API oficial para plantillas aprobadas, verificación de número y alta entregabilidad.</p>
            <dl class="np-dl"><dt>Incluye</dt><dd>Número, plantillas, comunicados, bot, logs y configuración.</dd></dl>
            <span class="np-btn np-btn--primary np-provider-cta">Entrar</span>
          </a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .np-provider { text-decoration: none; color: inherit; transition: border-color .15s, transform .15s; }
    .np-provider:hover { border-color: var(--accent-line); transform: translateY(-1px); }
    .np-provider p { margin: 0; color: var(--text-2); font-size: 13px; }
    .np-provider-cta { justify-self: start; }
  `],
})
export class WaLandingComponent {}
