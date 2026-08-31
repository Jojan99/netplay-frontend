import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CompanyWhatsappService } from '../../../services/company-whatsapp.service';

@Component({
  selector: 'app-wa-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="max-w-7xl mx-auto mt-8 p-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">WhatsApp</h1>
      <p class="text-gray-500 dark:text-gray-400 mb-8">Selecciona el proveedor que quieres usar o configurar.</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Netplay Card -->
        <a routerLink="netplay" class="group block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow hover:shadow-lg transition">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
              <svg class="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-green-600 transition">WhatsApp Web (QR)</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">Servicio propio con QR</p>
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Usa tu propio número de WhatsApp escaneando un código QR. Ideal para pruebas y control total.
          </p>
          <span class="inline-flex items-center text-sm font-medium text-green-600 dark:text-green-400">
            Entrar
            <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>
          </span>
        </a>

        <!-- Meta Card -->
        <a routerLink="meta" class="group block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 shadow hover:shadow-lg transition">
          <div class="flex items-center gap-4 mb-4">
            <div class="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <svg class="w-6 h-6 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.175L2 22l4.825-1.438A9.96 9.96 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 01-4.287-1.235l-.307-.184-2.86.76.76-2.86-.184-.307A8 8 0 1112 20z"/>
              </svg>
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 transition">API Oficial de Meta</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">WhatsApp Business API</p>
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Usa la API oficial de Meta para enviar mensajes con plantillas, verificación de número y alta entregabilidad.
          </p>
          <span class="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400">
            Entrar
            <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>
          </span>
        </a>
      </div>
    </div>
  `
})
export class WaLandingComponent {}
