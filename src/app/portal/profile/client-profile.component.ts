import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientApiService } from '../services/client-api.service';

@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-profile.component.html',
})
export class ClientProfileComponent implements OnInit {
  private api = inject(ClientApiService);

  loading  = signal(true);
  saving   = signal(false);
  profile  = signal<any>(null);
  editing  = signal(false);
  successMsg = signal('');
  errorMsg   = signal('');

  // Campos editables
  phone   = '';
  address = '';
  email   = '';

  ngOnInit(): void {
    this.api.getProfile().subscribe({
      next: (res) => {
        this.profile.set(res.data);
        this.phone   = res.data?.phone   ?? '';
        this.address = res.data?.address ?? '';
        this.email   = res.data?.email   ?? '';
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); },
    });
  }

  startEdit(): void {
    const p = this.profile();
    this.phone   = p?.phone   ?? '';
    this.address = p?.address ?? '';
    this.email   = p?.email   ?? '';
    this.editing.set(true);
    this.successMsg.set('');
    this.errorMsg.set('');
  }

  cancelEdit(): void {
    this.editing.set(false);
    this.errorMsg.set('');
  }

  save(): void {
    this.saving.set(true);
    this.errorMsg.set('');

    this.api.updateProfile({ phone: this.phone, address: this.address, email: this.email }).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.editing.set(false);
        this.successMsg.set('Perfil actualizado correctamente');
        // Actualizar perfil local
        this.profile.update(p => ({ ...p, phone: this.phone, address: this.address, email: this.email }));
        setTimeout(() => this.successMsg.set(''), 4000);
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(err.error?.message ?? 'Error al actualizar el perfil');
      },
    });
  }

  formatCurrency(v: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);
  }
}
