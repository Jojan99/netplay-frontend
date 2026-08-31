import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-netplay-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="max-w-7xl mx-auto mt-4">
      <!-- Sub-nav -->
      <div class="flex items-center gap-1 mb-4 overflow-x-auto pb-2 border-b border-gray-200 dark:border-gray-700">
        <a routerLink="panel" routerLinkActive="bg-green-600 text-white" class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition whitespace-nowrap text-gray-700 dark:text-gray-300">
          Panel Config.
        </a>
        <a routerLink="instancias" routerLinkActive="bg-green-600 text-white" class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition whitespace-nowrap text-gray-700 dark:text-gray-300">
          Instancias
        </a>
        <a routerLink="enviar" routerLinkActive="bg-green-600 text-white" class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition whitespace-nowrap text-gray-700 dark:text-gray-300">
          Enviar
        </a>
        <a routerLink="programados" routerLinkActive="bg-green-600 text-white" class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition whitespace-nowrap text-gray-700 dark:text-gray-300">
          Programados
        </a>
        <a routerLink="logs" routerLinkActive="bg-green-600 text-white" class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition whitespace-nowrap text-gray-700 dark:text-gray-300">
          Logs
        </a>
        <a routerLink="webhook" routerLinkActive="bg-green-600 text-white" class="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition whitespace-nowrap text-gray-700 dark:text-gray-300">
          Webhook
        </a>
        <a routerLink="/dashboard/whatsapp" class="ml-auto px-3 py-1.5 text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition">
          ← Volver
        </a>
      </div>
      <router-outlet></router-outlet>
    </div>
  `
})
export class NetplayLayoutComponent {}
