import {
  Component, OnInit, OnDestroy, AfterViewInit,
  NgZone, PLATFORM_ID, Inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { EmployeeService } from '../../services/employee.service';

@Component({
  selector: 'app-technician-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './technician-map.component.html',
  styleUrl: './technician-map.component.scss',
})
export class TechnicianMapComponent implements OnInit, AfterViewInit, OnDestroy {

  technicians: any[] = [];
  lastUpdate: Date | null = null;
  isLoading = true;
  errorMsg = '';

  private map: any = null;
  private markers: Map<number, any> = new Map();
  private intervalId: any = null;
  private L: any = null;

  constructor(
    private employeeService: EmployeeService,
    private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {}

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    // Importar Leaflet dinámicamente (evita SSR errors)
    const leaflet = await import('leaflet');
    this.L = leaflet.default ?? leaflet;
    this.fixLeafletIcons();
    this.initMap();
    this.loadLocations();
    // Actualizar cada 30 segundos
    this.intervalId = setInterval(() => this.loadLocations(), 30000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.map) this.map.remove();
  }

  private fixLeafletIcons(): void {
    const L = this.L;
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }

  private initMap(): void {
    this.zone.runOutsideAngular(() => {
      this.map = this.L.map('technician-map', {
        center: [4.6097, -74.0817], // Colombia por defecto
        zoom: 6,
      });

      this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(this.map);
    });
  }

  loadLocations(): void {
    this.employeeService.getTechnicianLocations().subscribe({
      next: (res) => {
        this.zone.run(() => {
          this.technicians = res.data ?? [];
          this.lastUpdate  = new Date();
          this.isLoading   = false;
          this.errorMsg    = '';
          this.updateMarkers();
          if (this.technicians.length > 0 && this.markers.size > 0) {
            this.fitBounds();
          }
        });
      },
      error: () => {
        this.zone.run(() => {
          this.isLoading = false;
          this.errorMsg  = 'Error al cargar ubicaciones';
        });
      }
    });
  }

  private updateMarkers(): void {
    const seen = new Set<number>();

    this.technicians.forEach(tech => {
      if (!tech.latitude || !tech.longitude) return;
      seen.add(tech.id);

      const lat = parseFloat(tech.latitude);
      const lng = parseFloat(tech.longitude);
      const label = `${tech.first_name} ${tech.last_name}`;
      const updated = tech.last_location_update
        ? new Date(tech.last_location_update).toLocaleTimeString()
        : '—';
      const popup = `
        <div class="text-sm">
          <p class="font-semibold text-gray-800">📍 ${label}</p>
          <p class="text-gray-500 text-xs">${tech.job_title || 'Técnico'}</p>
          <p class="text-gray-400 text-xs mt-1">Última actualización: ${updated}</p>
        </div>`;

      if (this.markers.has(tech.id)) {
        this.markers.get(tech.id).setLatLng([lat, lng]).setPopupContent(popup);
      } else {
        const icon = this.L.divIcon({
          className: '',
          html: `<div class="tech-marker"><span>${(tech.first_name || 'T')[0].toUpperCase()}</span></div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });
        const marker = this.L.marker([lat, lng], { icon })
          .bindPopup(popup)
          .addTo(this.map);
        this.markers.set(tech.id, marker);
      }
    });

    // Eliminar marcadores de técnicos que ya no están activos
    this.markers.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    });
  }

  private fitBounds(): void {
    const latlngs = Array.from(this.markers.values()).map(m => m.getLatLng());
    if (latlngs.length > 0) {
      this.map.fitBounds(this.L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 14 });
    }
  }

  getMinutesAgo(dateStr: string): string {
    if (!dateStr) return 'Sin datos';
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1)  return 'Ahora';
    if (diff === 1) return 'Hace 1 min';
    return `Hace ${diff} min`;
  }

  centerOnTech(tech: any): void {
    if (!tech.latitude || !tech.longitude) return;
    this.map.setView([parseFloat(tech.latitude), parseFloat(tech.longitude)], 16);
    this.markers.get(tech.id)?.openPopup();
  }
}
