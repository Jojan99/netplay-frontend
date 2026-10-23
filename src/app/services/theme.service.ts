import { Injectable, signal } from '@angular/core';

/**
 * Claro u oscuro, para quien necesita saberlo (los mapas cambian de fondo, el portal tiene su
 * propio botón).
 *
 * La preferencia es una sola: la del botón de la luna del panel («color-theme»). Antes este
 * servicio guardaba la suya aparte y al crearse aplicaba el oscuro por su cuenta: abrir el mapa
 * de técnicos o el de la red pasaba todo el panel a oscuro aunque estuviera en claro. Ahora solo
 * lee lo que ya está puesto y sigue los cambios del botón del panel.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly KEY = 'color-theme';
  private readonly KEY_VIEJA = 'crm_theme';
  isDark = signal<boolean>(false);

  constructor() {
    if (typeof document === 'undefined') return;
    const raiz = document.documentElement;
    this.isDark.set(this.leer());
    // El botón de la barra cambia la clase «dark» del documento: se sigue sin tocarla.
    new MutationObserver(() => this.isDark.set(raiz.classList.contains('dark')))
      .observe(raiz, { attributes: true, attributeFilter: ['class'] });
  }

  toggle(): void {
    this.isDark.set(!this.isDark());
    try { localStorage.setItem(this.KEY, this.isDark() ? 'dark' : 'light'); localStorage.removeItem(this.KEY_VIEJA); } catch { /* sin almacenamiento */ }
    this.apply();
  }

  /** Lo que ya está aplicado manda; si nada lo aplicó todavía (el portal), la preferencia guardada. */
  private leer(): boolean {
    const raiz = document.documentElement;
    if (raiz.classList.contains('dark') || raiz.getAttribute('data-theme') === 'dark') return true;
    if (raiz.getAttribute('data-theme') === 'light') return false;
    let guardada: string | null = null;
    try { guardada = localStorage.getItem(this.KEY) ?? localStorage.getItem(this.KEY_VIEJA); } catch { /* sin almacenamiento */ }
    const oscuro = guardada ? guardada === 'dark' : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
    if (oscuro) this.apply(oscuro);
    return oscuro;
  }

  private apply(oscuro = this.isDark()): void {
    const raiz = document.documentElement;
    raiz.classList.toggle('dark', oscuro);
    raiz.setAttribute('data-theme', oscuro ? 'dark' : 'light');
  }
}
