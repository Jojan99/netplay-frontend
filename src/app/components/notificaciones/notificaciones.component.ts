import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, HostListener, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

interface Notificacion {
  origen: 'red' | 'cobranza' | 'equipo';
  nivel: 'critico' | 'aviso';
  titulo: string;
  detalle: string;
  cuando: string;
  ruta: string;
  nueva: boolean;
}

/**
 * La campana del encabezado, que antes era un adorno.
 *
 * Junta en un solo lugar lo que la plataforma ya sabía pero vivía repartido:
 * los avisos de la red, los clientes que esperan en cobranza y los equipos que
 * quedaron a medio configurar. Cada uno lleva a la pantalla donde se resuelve.
 */
@Component({
  selector: 'app-notificaciones',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notificaciones.component.html',
  styleUrl: './notificaciones.component.scss',
})
export class NotificacionesComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  private el = inject(ElementRef<HTMLElement>);
  private enNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  readonly lista = signal<Notificacion[]>([]);
  readonly sinVer = signal(0);
  readonly abierta = signal(false);
  readonly filtro = signal<'todo' | 'critico'>('todo');

  private reloj: ReturnType<typeof setInterval> | null = null;

  readonly ORIGENES: Record<string, string> = { red: 'Red', cobranza: 'Cobranza', equipo: 'Equipo' };

  @HostListener('document:mousedown', ['$event'])
  alHacerClic(e: MouseEvent): void {
    if (this.abierta() && !this.el.nativeElement.contains(e.target as Node)) this.abierta.set(false);
  }

  @HostListener('document:keydown.escape')
  alEscape(): void { this.abierta.set(false); }

  ngOnInit(): void {
    if (!this.enNavegador) return;
    this.cargar();
    this.reloj = setInterval(() => this.cargar(), 120_000);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  private cabeceras(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` });
  }

  private cargar(): void {
    this.http.get<any>(`${environment.rootUrl}api/company/notificaciones`, { headers: this.cabeceras() }).subscribe({
      next: r => {
        this.lista.set(r?.data?.items ?? []);
        this.sinVer.set(r?.data?.sin_ver ?? 0);
      },
      error: () => {},   // sin permiso o sin conexión: la campana queda callada
    });
  }

  get visibles(): Notificacion[] {
    return this.filtro() === 'critico' ? this.lista().filter(n => n.nivel === 'critico') : this.lista();
  }

  get criticas(): number { return this.lista().filter(n => n.nivel === 'critico').length; }

  alternar(): void {
    const abriendo = !this.abierta();
    this.abierta.set(abriendo);

    if (abriendo && this.sinVer() > 0) {
      this.http.post(`${environment.rootUrl}api/company/notificaciones/vistas`, {}, { headers: this.cabeceras() })
        .subscribe({ next: () => this.sinVer.set(0), error: () => {} });
    }
  }

  ir(n: Notificacion): void {
    this.abierta.set(false);
    this.router.navigateByUrl(n.ruta.startsWith('/') ? n.ruta : `/dashboard/${n.ruta}`);
  }
}
