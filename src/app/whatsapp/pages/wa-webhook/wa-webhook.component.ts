import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WhatsappService } from '../../services/whatsapp.service';

@Component({
  selector: 'app-wa-webhook',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './wa-webhook.component.html'
})
export class WaWebhookComponent implements OnInit {

  // Instancias
  instances: any[]    = [];
  selectedInstance    = '';

  // Webhook config
  webhookUrl          = '';
  webhookSecret       = '';
  currentWebhook      = { url: '', secret: '' };
  saving              = false;
  saveMsg             = '';
  saveOk              = false;

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
    this.wa.ensureApiKey().subscribe({
      next: () => {
        this.wa.getInstances().subscribe({
          next: (r: any) => { this.instances = r.instances || []; }
        });
      }
    });
  }

  onInstanceChange(): void {
    if (!this.selectedInstance) return;
    this.loadWebhookConfig();
    this.loadWebhookLogs();
    this.loadRateLimit();
  }

  // ── Webhook ──────────────────────────────────────────────────
  loadWebhookConfig(): void {
    this.wa.getWebhook(this.selectedInstance).subscribe({
      next: (r: any) => {
        this.currentWebhook = {
          url:    r.webhook_url    || '',
          secret: r.webhook_secret || ''
        };
        this.webhookUrl    = r.webhook_url || '';
        this.webhookSecret = '';
      }
    });
  }

  save(): void {
    if (!this.webhookUrl.trim()) return;
    this.saving  = true;
    this.saveMsg = '';

    this.wa.setWebhook(
      this.selectedInstance,
      this.webhookUrl.trim(),
      this.webhookSecret.trim() || undefined
    ).subscribe({
      next: () => {
        this.saving  = false;
        this.saveOk  = true;
        this.saveMsg = 'Webhook guardado correctamente';
        this.loadWebhookConfig();
        setTimeout(() => this.saveMsg = '', 3000);
      },
      error: (e: any) => {
        this.saving  = false;
        this.saveOk  = false;
        this.saveMsg = e.error?.message || 'Error al guardar';
      }
    });
  }

  remove(): void {
    if (!confirm('¿Eliminar el webhook de esta instancia?')) return;
    this.wa.deleteWebhook(this.selectedInstance).subscribe({
      next: () => {
        this.currentWebhook = { url: '', secret: '' };
        this.webhookUrl     = '';
        this.saveOk         = true;
        this.saveMsg        = 'Webhook eliminado';
        setTimeout(() => this.saveMsg = '', 3000);
      }
    });
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