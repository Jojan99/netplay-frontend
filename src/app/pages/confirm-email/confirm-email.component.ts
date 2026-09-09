import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CompanyService } from '../../services/company.service';
import { AuthService } from '../../services/auth.service';

/**
 * Pantalla que cierra el alta de una empresa. Cubre dos momentos distintos:
 *
 *  1. Recién registrado (sin parámetros en la URL): avisa que salió el correo,
 *     a qué dirección, y deja reenviarlo si no llegó.
 *  2. Volviendo desde el enlace del correo (?estado=…): confirma la cuenta y,
 *     si el enlace trae un vale, entra al panel sin pedir credenciales — quien
 *     abrió el enlace ya demostró que controla la casilla.
 *
 * Antes esto era una pantalla fija: el enlace del correo llevaba a una
 * respuesta JSON de la API y la persona tenía que buscar el login por su
 * cuenta.
 */
type Vista = 'registrado' | 'entrando' | 'confirmada' | 'ya' | 'invalido';

@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './confirm-email.component.html',
  styleUrl: '../sign-in/sign-in/sign-in.component.scss',
})
export class ConfirmEmailComponent implements OnInit {
  private route    = inject(ActivatedRoute);
  private router   = inject(Router);
  private company  = inject(CompanyService);
  private auth     = inject(AuthService);

  vista   = signal<Vista>('registrado');
  empresa = signal('');
  correo  = signal('');

  reenviando = signal(false);
  aviso      = signal('');
  avisoOk    = signal(true);

  ngOnInit(): void {
    // El correo del alta se deja en sessionStorage y no en la URL: no hace
    // falta que quede en el historial del navegador ni en los registros.
    if (typeof sessionStorage !== 'undefined') {
      this.correo.set(sessionStorage.getItem('alta_email') ?? '');
    }

    const p      = this.route.snapshot.queryParamMap;
    const estado = p.get('estado');
    const vale   = p.get('vale');

    this.empresa.set(p.get('empresa') ?? '');

    if (!estado) {
      this.vista.set('registrado');
      return;
    }

    if (estado === 'invalido') { this.vista.set('invalido'); return; }
    if (estado === 'ya')       { this.vista.set('ya');       return; }

    // estado === 'ok'
    if (!vale) { this.vista.set('confirmada'); return; }

    this.entrarConVale(vale);
  }

  /** Canjea el vale por una sesión y entra directo al panel. */
  private entrarConVale(vale: string): void {
    this.vista.set('entrando');

    this.company.confirmSession(vale).subscribe({
      next: (res) => {
        if (res?.error || !res?.data?.access_token) {
          // El vale venció o ya se usó: la cuenta igual quedó confirmada.
          this.vista.set('confirmada');
          return;
        }

        this.auth.login(res.data);
        this.auth.setModules(res.data.modules ?? []);

        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('alta_email');
          // Le avisa al panel que muestre la guía apenas cargue.
          sessionStorage.setItem('mostrar_guia', '1');
        }

        this.router.navigate(['/dashboard/home']);
      },
      error: () => this.vista.set('confirmada'),
    });
  }

  /** Vuelve a mandar el correo de activación. */
  reenviar(): void {
    const correo = this.correo().trim();

    if (!correo) {
      this.avisoOk.set(false);
      this.aviso.set('Escribí el correo con el que registraste la empresa.');
      return;
    }

    this.reenviando.set(true);
    this.aviso.set('');

    this.company.resendConfirmation('', correo).subscribe({
      next: (res) => {
        this.reenviando.set(false);
        this.avisoOk.set(!res?.error);
        this.aviso.set(res?.message ?? 'Te reenviamos el correo de activación.');
      },
      error: () => {
        this.reenviando.set(false);
        this.avisoOk.set(false);
        this.aviso.set('No pudimos reenviar el correo. Probá de nuevo en un momento.');
      },
    });
  }
}
