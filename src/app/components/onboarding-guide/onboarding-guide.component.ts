import { Component, OnInit, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { OnboardingService, Guia, PasoGuia } from '../../services/onboarding.service';
import { AuthService } from '../../services/auth.service';

/**
 * Guía de primeros pasos del panel.
 *
 * Deliberadamente no es un tour de burbujas encima de la pantalla: esos se
 * cierran a los dos clics y no dejan nada. Acá la guía es una lista de lo que
 * la empresa necesita dejar configurado para operar, y cada paso se marca solo
 * cuando el dato existe de verdad en la base. Así el avance es real y la lista
 * sigue sirviendo aunque la persona vuelva una semana después.
 *
 * Se muestra sola mientras queden pasos pendientes. Cuando está todo hecho, se
 * reduce a una línea de resumen en vez de desaparecer, para que quien entra
 * después sepa que existe.
 */
@Component({
  selector: 'app-onboarding-guide',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './onboarding-guide.component.html',
  styleUrl: './onboarding-guide.component.scss',
})
export class OnboardingGuideComponent implements OnInit {
  private api    = inject(OnboardingService);
  private router = inject(Router);
  private auth   = inject(AuthService);
  private esNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  guia      = signal<Guia | null>(null);
  cargando  = signal(true);
  abierta   = signal(true);
  ocultando = signal(false);

  /** El primero sin hacer: es el que se destaca como "seguí por acá". */
  siguiente = computed<PasoGuia | null>(
    () => this.guia()?.pasos.find(p => !p.hecho) ?? null
  );

  completa = computed(() => {
    const g = this.guia();
    return !!g && g.completados === g.total;
  });

  /** Se muestra si hay algo pendiente, o si la persona la pidió expresamente. */
  visible = computed(() => {
    const g = this.guia();
    if (!g) return false;
    return !g.oculta || this.abierta();
  });

  ngOnInit(): void {
    // Durante el prerender no hay navegador ni sesión: la guía se arma en el cliente.
    if (!this.esNavegador) { this.cargando.set(false); return; }

    // Al venir de confirmar el correo se fuerza a mostrarla aunque estuviera oculta.
    let forzar = false;
    try {
      forzar = sessionStorage.getItem('mostrar_guia') === '1';
      if (forzar) sessionStorage.removeItem('mostrar_guia');
    } catch {}

    this.api.obtener().subscribe({
      next: (res) => {
        this.cargando.set(false);
        const d: Guia | undefined = res?.data;
        if (!d) return;
        this.guia.set(d);
        this.abierta.set(forzar || !d.oculta);
      },
      error: () => this.cargando.set(false),
    });
  }

  ir(paso: PasoGuia): void {
    this.router.navigate([paso.ruta]);
  }

  /** La oculta para esta persona (queda guardado en su usuario, no en el navegador). */
  ocultar(): void {
    this.ocultando.set(true);
    this.api.marcar(false).subscribe({
      next: () => { this.ocultando.set(false); this.abierta.set(false); this.actualizarOculta(true); },
      error: () => { this.ocultando.set(false); this.abierta.set(false); },
    });
  }

  volverAMostrar(): void {
    this.abierta.set(true);
    this.api.marcar(true).subscribe({ next: () => this.actualizarOculta(false), error: () => {} });
  }

  private actualizarOculta(oculta: boolean): void {
    const g = this.guia();
    if (g) this.guia.set({ ...g, oculta });
  }

  get nombreEmpresa(): string {
    return this.guia()?.empresa || this.auth.getCompanyName();
  }
}
