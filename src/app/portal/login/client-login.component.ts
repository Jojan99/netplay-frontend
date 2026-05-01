import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ClientApiService }  from '../services/client-api.service';
import { ClientAuthService } from '../services/client-auth.service';

@Component({
  selector: 'app-client-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './client-login.component.html',
})
export class ClientLoginComponent {
  private api    = inject(ClientApiService);
  private auth   = inject(ClientAuthService);
  private router = inject(Router);

  username  = '';
  password  = '';
  loading   = signal(false);
  errorMsg  = signal('');

  login(): void {
    if (!this.username || !this.password) {
      this.errorMsg.set('Ingresa tu usuario y contraseña');
      return;
    }
    this.loading.set(true);
    this.errorMsg.set('');

    this.api.login(this.username, this.password).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.data?.access_token) {
          this.auth.save(res.data);
          this.router.navigate(['/portal/home']);
        } else {
          this.errorMsg.set(res.message ?? 'Credenciales incorrectas');
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMsg.set('Error de conexión. Intenta de nuevo.');
      },
    });
  }
}
