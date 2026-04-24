import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { WhatsappService } from '../../services/whatsapp.service';
import { interval, Subscription } from 'rxjs';
import { switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-wa-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './wa-dashboard.component.html'
})
export class WaDashboardComponent implements OnInit, OnDestroy {

  data: any    = null;
  loading      = false;
  apiError     = '';
  private autoRefresh$?: Subscription;

  get sentPct(): number {
    if (!this.data?.messages?.total) return 0;
    return Math.round((this.data.messages.sent / this.data.messages.total) * 100);
  }

  get failedPct(): number {
    if (!this.data?.messages?.total) return 0;
    return Math.round((this.data.messages.failed / this.data.messages.total) * 100);
  }

  constructor(private wa: WhatsappService) {}

  ngOnInit(): void {
    this.wa.ensureApiKey().subscribe({
      next: () => {
        this.load();
        this.autoRefresh$ = interval(30000)
          .pipe(switchMap(() => this.wa.getDashboard()))
          .subscribe({
            next:  (r: any) => { this.data = r; },
            error: (e: any) => { this.apiError = this.resolveError(e); }
          });
      },
      error: (e: any) => { this.apiError = this.resolveError(e); }
    });
  }

  ngOnDestroy(): void {
    this.autoRefresh$?.unsubscribe();
  }

  load(): void {
    this.loading  = true;
    this.apiError = '';
    this.wa.getDashboard().subscribe({
      next:  (r: any) => { this.data = r; this.loading = false; },
      error: (e: any) => { this.loading = false; this.apiError = this.resolveError(e); }
    });
  }

  private resolveError(e: any): string {
    if (e.status === 401 || e.message === 'API Key no configurada')
      return 'No autorizado: configura tu API Key de WhatsApp.';
    if (e.status === 403)
      return 'Acceso denegado: API Key inválida o empresa suspendida.';
    return e.error?.message || e.message || 'Error al cargar el dashboard.';
  }
}