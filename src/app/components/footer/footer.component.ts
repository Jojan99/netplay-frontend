import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  readonly year = new Date().getFullYear();
  /** El dominio desde el que se abre el panel (netplay.com.co o netvula.com). */
  readonly sitio = typeof window !== 'undefined' && window.location?.hostname ? window.location.hostname : 'netplay.com.co';
}
