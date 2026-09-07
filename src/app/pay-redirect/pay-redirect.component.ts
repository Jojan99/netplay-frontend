import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

/**
 * Rescata los links de pago que quedaron sin la ruta.
 *
 * Una plantilla de WhatsApp salió a revisión con el botón apuntando a
 * netplay.com.co/{{1}} en vez de netplay.com.co/api/pay/{{1}}, y Meta no deja
 * corregir una plantilla mientras está en revisión. Sin esto, el cliente
 * tocaría "Pagar ahora" y caería en el portal sin entender por qué.
 *
 * Solo entra aquí una dirección con pinta de token de pago: veinte o más
 * caracteres sin puntos ni barras. Ninguna ruta de la aplicación se parece.
 */
@Component({
  selector: 'app-pay-redirect',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div class="text-center">
        <div class="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600"></div>
        <p class="text-sm text-slate-600">Abriendo tu pago…</p>
      </div>
    </div>
  `,
})
export class PayRedirectComponent implements OnInit {
  constructor(
    private route: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {
    // En el render del servidor no hay a dónde navegar; el navegador lo hace.
    if (!isPlatformBrowser(this.platformId)) return;

    const token = this.route.snapshot.url[0]?.path ?? '';

    // replace y no href: así el botón "atrás" no devuelve a esta pantalla
    // intermedia, que para el cliente no significa nada.
    window.location.replace(token ? `/api/pay/${token}` : '/inicio');
  }
}
