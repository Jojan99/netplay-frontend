import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ClientApiService } from '../services/client-api.service';

@Component({
  selector: 'app-ticket-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './ticket-form.component.html',
})
export class TicketFormComponent {
  private api    = inject(ClientApiService);
  private router = inject(Router);

  category    = '';
  description = '';
  loading     = signal(false);
  errorMsg    = signal('');
  successMsg  = signal('');

  readonly categories = [
    { value: 'sin_internet',  label: 'Sin internet',        icon: '📵' },
    { value: 'lentitud',      label: 'Conexión lenta',      icon: '🐢' },
    { value: 'intermitencia', label: 'Intermitencia',       icon: '⚡' },
    { value: 'wifi',          label: 'Problemas con WiFi',  icon: '📶' },
    { value: 'otro',          label: 'Otro problema',       icon: '🔧' },
  ];

  submit(): void {
    if (!this.category) {
      this.errorMsg.set('Selecciona el tipo de problema');
      return;
    }
    if (this.description.trim().length < 10) {
      this.errorMsg.set('La descripción debe tener al menos 10 caracteres');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set('');

    this.api.createTicket(this.category, this.description.trim()).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.successMsg.set(res.message ?? 'Reporte enviado correctamente');
        setTimeout(() => this.router.navigate(['/portal/reportes']), 2000);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.message ?? 'Error al enviar el reporte');
      },
    });
  }
}
