import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

interface Novedad {
  id: number;
  titulo: string;
  detalle: string;
  tipo: 'nuevo' | 'mejora' | 'arreglo';
  ruta: string | null;
  publicada_en: string;
  nueva: boolean;
}

/**
 * Novedades de la plataforma en el encabezado: un puntito cuando hay algo que
 * la empresa todavía no vio, y al tocarlo la lista de lo que se agregó, lo que
 * mejoró y lo que se arregló. Las escribe Netvula desde su consola.
 */
@Component({
  selector: 'app-novedades',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './novedades.component.html',
  styleUrl: './novedades.component.scss',
})
export class NovedadesComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private el = inject(ElementRef<HTMLElement>);
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly lista = signal<Novedad[]>([]);
  readonly sinVer = signal(0);
  readonly abierta = signal(false);

  readonly ETIQUETAS: Record<string, string> = { nuevo: 'Nuevo', mejora: 'Mejora', arreglo: 'Arreglo' };

  @HostListener('document:mousedown', ['$event'])
  alHacerClic(e: MouseEvent): void {
    if (this.abierta() && !this.el.nativeElement.contains(e.target as Node)) this.abierta.set(false);
  }

  @HostListener('document:keydown.escape')
  alEscape(): void { this.abierta.set(false); }

  ngOnInit(): void {
    if (this.enNavegador) this.cargar();
  }

  private cabeceras(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  }

  private cargar(): void {
    this.http.get<any>(`${environment.rootUrl}api/company/novedades`, { headers: this.cabeceras() }).subscribe({
      next: r => {
        this.lista.set(r?.data?.novedades ?? []);
        this.sinVer.set(r?.data?.sin_ver ?? 0);
      },
      error: () => {},   // sin sesión o sin permiso: el botón no muestra nada
    });
  }

  alternar(): void {
    const abriendo = !this.abierta();
    this.abierta.set(abriendo);

    if (abriendo && this.sinVer() > 0) {
      this.http.post(`${environment.rootUrl}api/company/novedades/vistas`, {}, { headers: this.cabeceras() })
        .subscribe({ next: () => this.sinVer.set(0), error: () => {} });
    }
  }

  /** «Verlo» lleva a la pantalla de la novedad. */
  ir(n: Novedad): void {
    if (!n.ruta) return;
    this.abierta.set(false);
    this.router.navigateByUrl(n.ruta.startsWith('/') ? n.ruta : `/dashboard/${n.ruta}`);
  }
}
