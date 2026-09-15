import { DialogService } from '../../../services/dialog.service';
import { AuthService } from '../../../services/auth.service';
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WhatsappService } from '../../services/whatsapp.service';

interface InstanciaRecepcion {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  entregados_24h: number;
  fallidos_24h: number;
  ultimo_entregado: string | null;
  ultimo_estado: string | null;
  ultimo_error: string | null;
}

/**
 * Recepción de mensajes de WhatsApp Web en el CRM, logs y rate limit.
 *
 * Antes cada instancia pedía escribir a mano la URL del webhook. Si quedaba
 * vacía o con un dominio viejo, los mensajes de los clientes no llegaban a la
 * bandeja y nadie se enteraba. Ahora se activa o desactiva para toda la
 * empresa y la plataforma pone la dirección.
 */
@Component({
  selector: 'app-wa-webhook',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-webhook.component.html',
  styleUrl: './wa-webhook.component.scss',
  host: { class: 'np-console' },
})
export class WaWebhookComponent implements OnInit {
  private dialog = inject(DialogService);
  readonly esAdmin = inject(AuthService).isAdmin();

  // Recepción en el CRM (toda la empresa)
  recepcionActiva: boolean | null = null;
  instanciasRecepcion: InstanciaRecepcion[] = [];
  cargandoRecepcion   = true;
  guardandoRecepcion  = false;
  recepcionMsg        = '';
  recepcionOk         = true;

  // Instancias
  instances: any[]    = [];
  selectedInstance    = '';

  // Webhook logs
  webhookLogs: any[]  = [];
  loadingLogs         = false;

  // Rate limit
  rateLimitPerMin     = 20;
  rateLimitDelay      = 1000;
  rateLimitStats: any = null;
  savingRL            = false;
  saveMsgRL           = '';

  constructor(private wa: WhatsappService) {}

  ngOnInit(): void {
    this.cargarRecepcion();
    this.wa.getInstances().subscribe({
      next: (r: any) => { this.instances = r.instances || []; }
    });
  }

  /** Las líneas cuyo último envío al CRM falló. */
  get conFallas(): InstanciaRecepcion[] {
    return this.instanciasRecepcion.filter(i => i.ultimo_estado === 'failed');
  }

  onInstanceChange(): void {
    if (!this.selectedInstance) return;
    this.loadWebhookLogs();
    this.loadRateLimit();
  }

  // ── Recepción en el CRM ──────────────────────────────────────
  cargarRecepcion(): void {
    this.cargandoRecepcion = true;
    this.wa.getRecepcion().subscribe({
      next: (r: any) => this.aplicarRecepcion(r),
      error: (e: any) => {
        this.cargandoRecepcion = false;
        this.recepcionOk  = false;
        this.recepcionMsg = e.error?.message || 'No se pudo consultar la recepción de mensajes.';
      },
    });
  }

  async alternarRecepcion(): Promise<void> {
    if (!this.esAdmin || this.guardandoRecepcion || this.recepcionActiva === null) return;
    const activar = !this.recepcionActiva;

    if (!activar && !await this.dialog.confirm('¿Desactivar la recepción? Los mensajes que tus clientes escriban a tus líneas de WhatsApp Web dejarán de llegar a la bandeja del CRM.')) return;

    this.guardandoRecepcion = true;
    this.recepcionMsg = '';
    this.wa.setRecepcion(activar).subscribe({
      next: (r: any) => {
        this.guardandoRecepcion = false;
        this.aplicarRecepcion(r);
        this.recepcionOk  = true;
        this.recepcionMsg = r.message || (activar ? 'Recepción activada.' : 'Recepción desactivada.');
        setTimeout(() => this.recepcionMsg = '', 4000);
      },
      error: (e: any) => {
        this.guardandoRecepcion = false;
        this.recepcionOk  = false;
        this.recepcionMsg = e.error?.message || 'No se pudo cambiar la recepción.';
      },
    });
  }

  private aplicarRecepcion(r: any): void {
    this.cargandoRecepcion   = false;
    this.recepcionActiva     = !!r?.activa;
    this.instanciasRecepcion = r?.instancias || [];
  }

  // ── Webhook Logs ─────────────────────────────────────────────
  loadWebhookLogs(): void {
    this.loadingLogs = true;
    this.wa.getWebhookLogs(this.selectedInstance).subscribe({
      next: (r: any) => {
        this.webhookLogs = r.logs || [];
        this.loadingLogs = false;
      },
      error: () => { this.loadingLogs = false; }
    });
  }

  retry(logId: number): void {
    this.wa.retryWebhook(this.selectedInstance, logId).subscribe({
      next: () => {
        setTimeout(() => this.loadWebhookLogs(), 1000);
      }
    });
  }

  // ── Rate Limit ───────────────────────────────────────────────
  loadRateLimit(): void {
    this.wa.getRateLimit(this.selectedInstance).subscribe({
      next: (r: any) => {
        this.rateLimitPerMin = r.config?.limitPerMinute || 20;
        this.rateLimitDelay  = r.config?.delayMs        || 1000;
        this.rateLimitStats  = r.current;
      }
    });
  }

  saveRateLimit(): void {
    this.savingRL  = true;
    this.saveMsgRL = '';
    this.wa.setRateLimit(
      this.selectedInstance,
      this.rateLimitPerMin,
      this.rateLimitDelay
    ).subscribe({
      next: () => {
        this.savingRL  = false;
        this.saveMsgRL = 'Rate limit guardado';
        setTimeout(() => this.saveMsgRL = '', 3000);
      },
      error: (e: any) => {
        this.savingRL  = false;
        this.saveMsgRL = e.error?.message || 'Error al guardar';
      }
    });
  }
}
