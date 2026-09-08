import {
  Component, OnInit, OnDestroy, AfterViewInit,
  NgZone, PLATFORM_ID, Inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeeService } from '../../services/employee.service';
import { EchoService } from '../../services/echo.service';

type Freshness = 'live' | 'recent' | 'stale';

/**
 * Mapa de técnicos en tiempo real: cada técnico con el panel abierto envía su posición
 * (LocationTrackerService); acá se dibuja con un color por frescura, se sigue en vivo y se
 * actualiza por Pusher (`technician-tracking`) con un sondeo de respaldo cada 20 s.
 */
@Component({
  selector: 'app-technician-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './technician-map.component.html',
  styleUrl: './technician-map.component.scss',
  host: { class: 'np-console' },
})
export class TechnicianMapComponent implements OnInit, AfterViewInit, OnDestroy {

  technicians: any[] = [];
  lastUpdate: Date | null = null;
  isLoading = true;
  errorMsg = '';
  filter: 'all' | 'live' | 'stale' = 'all';
  search = '';
  followId: number | null = null;      // técnico seguido (el mapa lo centra en cada actualización)
  autoFit = true;                       // encuadrar a todos al recibir datos
  windowMinutes = 1440;                 // hasta 24 h de antigüedad; el color dice qué tan fresco es
  selected: any = null;
  mapStyle: 'streets' | 'satellite' = 'streets';

  private map: any = null;
  private markers: Map<number, any> = new Map();
  private trails: Map<number, any> = new Map();       // polilínea con las últimas posiciones de cada técnico
  private history: Map<number, [number, number][]> = new Map();
  private intervalId: any = null;
  private tick: any = null;
  private L: any = null;
  private tiles: any = null;
  private firstFit = true;

  constructor(
    private employeeService: EmployeeService,
    private echoService:     EchoService,
    private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object,
  ) {}

  ngOnInit(): void {}

  async ngAfterViewInit(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const leaflet = await import('leaflet');
    this.L = leaflet.default ?? leaflet;
    this.initMap();
    this.loadLocations();
    this.subscribeToRealtime();
    this.intervalId = setInterval(() => this.loadLocations(true), 20000);
    this.tick = setInterval(() => this.zone.run(() => { this.technicians = [...this.technicians]; }), 30000); // refresca "hace X min"
  }

  ngOnDestroy(): void {
    if (this.intervalId) clearInterval(this.intervalId);
    if (this.tick) clearInterval(this.tick);
    if (this.map) this.map.remove();
    this.echoService.leave('technician-tracking');
  }

  /* ── Mapa ────────────────────────────────────────────────────── */
  private initMap(): void {
    this.zone.runOutsideAngular(() => {
      this.map = this.L.map('technician-map', { center: [4.6097, -74.0817], zoom: 6, zoomControl: true });
      this.applyTiles();
      this.L.control.scale({ imperial: false }).addTo(this.map);
      this.map.on('dragstart', () => this.zone.run(() => { this.autoFit = false; }));
    });
  }
  private applyTiles(): void {
    if (this.tiles) this.tiles.remove();
    this.tiles = this.mapStyle === 'satellite'
      ? this.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri, Maxar, Earthstar Geographics', maxZoom: 19 })
      : this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 });
    this.tiles.addTo(this.map);
  }
  toggleStyle(): void { this.mapStyle = this.mapStyle === 'streets' ? 'satellite' : 'streets'; this.applyTiles(); }

  /* ── Datos ───────────────────────────────────────────────────── */
  loadLocations(silent = false): void {
    if (!silent) this.isLoading = true;
    this.employeeService.getTechnicianLocations(this.windowMinutes).subscribe({
      next: (res) => this.zone.run(() => {
        this.technicians = res.data ?? [];
        this.lastUpdate  = new Date();
        this.isLoading   = false;
        this.errorMsg    = '';
        this.updateMarkers();
        if (this.firstFit && this.markers.size) { this.fitBounds(); this.firstFit = false; }
        else if (this.autoFit && this.markers.size) this.fitBounds();
      }),
      error: () => this.zone.run(() => { this.isLoading = false; this.errorMsg = 'No se pudieron cargar las ubicaciones.'; })
    });
  }

  private subscribeToRealtime(): void {
    const echo = this.echoService.instance;
    if (!echo) { setTimeout(() => this.subscribeToRealtime(), 800); return; }
    echo.channel('technician-tracking').listen('.technician.location.updated', (data: any) => {
      this.zone.run(() => { this.lastUpdate = new Date(); this.updateSingleTechnician(data); });
    });
  }

  private updateSingleTechnician(data: any): void {
    const id = Number(data.employee_id);
    const existing = this.technicians.find(t => t.id === id);
    if (existing) {
      existing.latitude = data.latitude; existing.longitude = data.longitude; existing.last_location_update = data.updated_at || new Date().toISOString();
    } else {
      this.technicians = [...this.technicians, { id, first_name: data.first_name, last_name: data.last_name, job_title: data.job_title, latitude: data.latitude, longitude: data.longitude, last_location_update: data.updated_at || new Date().toISOString() }];
    }
    this.technicians = [...this.technicians];
    this.updateMarkers();
    if (this.followId === id) this.map.panTo([parseFloat(data.latitude), parseFloat(data.longitude)], { animate: true });
    if (this.selected?.id === id) this.selected = this.technicians.find(t => t.id === id);
  }

  /* ── Marcadores ──────────────────────────────────────────────── */
  freshness(t: any): Freshness {
    const min = this.minutesAgo(t.last_location_update);
    return min == null ? 'stale' : min <= 5 ? 'live' : min <= 30 ? 'recent' : 'stale';
  }
  minutesAgo(dateStr: string): number | null {
    if (!dateStr) return null;
    const ms = Date.now() - new Date(dateStr).getTime();
    return ms < 0 ? 0 : Math.floor(ms / 60000);
  }
  getMinutesAgo(dateStr: string): string {
    const m = this.minutesAgo(dateStr);
    if (m == null) return 'Sin datos';
    if (m < 1) return 'Ahora';
    if (m < 60) return `Hace ${m} min`;
    if (m < 1440) return `Hace ${Math.floor(m / 60)} h`;
    return `Hace ${Math.floor(m / 1440)} d`;
  }
  private markerHtml(t: any): string {
    const f = this.freshness(t);
    const ini = `${(t.first_name || 'T')[0]}${(t.last_name || '')[0] || ''}`.toUpperCase();
    return `<div class="tech-marker is-${f}${this.followId === t.id ? ' is-follow' : ''}"><span>${ini}</span><i></i></div>`;
  }
  private popupHtml(t: any): string {
    const upd = t.last_location_update ? new Date(t.last_location_update).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
    const f = this.freshness(t);
    const label = f === 'live' ? 'En vivo' : f === 'recent' ? 'Reciente' : 'Sin señal';
    return `<div class="tech-pop"><b>${t.first_name} ${t.last_name}</b><small>${t.job_title || 'Técnico'}</small><span class="tech-pop-st is-${f}">${label} · ${upd}</span><a href="https://www.google.com/maps?q=${t.latitude},${t.longitude}" target="_blank" rel="noopener">Abrir en Google Maps</a></div>`;
  }

  private updateMarkers(): void {
    const seen = new Set<number>();
    for (const t of this.technicians) {
      if (!t.latitude || !t.longitude) continue;
      const lat = parseFloat(t.latitude), lng = parseFloat(t.longitude);
      if (isNaN(lat) || isNaN(lng)) continue;
      seen.add(t.id);
      const icon = this.L.divIcon({ className: '', html: this.markerHtml(t), iconSize: [38, 38], iconAnchor: [19, 19], popupAnchor: [0, -18] });
      if (this.markers.has(t.id)) {
        this.markers.get(t.id).setLatLng([lat, lng]).setIcon(icon).setPopupContent(this.popupHtml(t));
      } else {
        const marker = this.L.marker([lat, lng], { icon, riseOnHover: true }).bindPopup(this.popupHtml(t)).addTo(this.map);
        marker.on('click', () => this.zone.run(() => this.select(t, false)));
        this.markers.set(t.id, marker);
      }
      // rastro de las últimas 30 posiciones
      const h = this.history.get(t.id) || [];
      const last = h[h.length - 1];
      if (!last || last[0] !== lat || last[1] !== lng) { h.push([lat, lng]); if (h.length > 30) h.shift(); this.history.set(t.id, h); }
      if (h.length > 1) {
        if (this.trails.has(t.id)) this.trails.get(t.id).setLatLngs(h);
        else this.trails.set(t.id, this.L.polyline(h, { color: '#0ea5e9', weight: 3, opacity: .55, dashArray: '4 6' }).addTo(this.map));
      }
    }
    this.markers.forEach((marker, id) => { if (!seen.has(id)) { marker.remove(); this.markers.delete(id); this.trails.get(id)?.remove(); this.trails.delete(id); } });
  }

  private fitBounds(): void {
    const latlngs = Array.from(this.markers.values()).map(m => m.getLatLng());
    if (latlngs.length) this.map.fitBounds(this.L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 15 });
  }
  fitAll(): void { this.autoFit = true; this.followId = null; this.updateMarkers(); this.fitBounds(); }

  /* ── Lista / selección ───────────────────────────────────────── */
  get liveCount(): number { return this.technicians.filter(t => this.freshness(t) === 'live').length; }
  get recentCount(): number { return this.technicians.filter(t => this.freshness(t) === 'recent').length; }
  get filtered(): any[] {
    const q = this.search.trim().toLowerCase();
    return this.technicians
      .filter(t => this.filter === 'all' || (this.filter === 'live' ? this.freshness(t) !== 'stale' : this.freshness(t) === 'stale'))
      .filter(t => !q || `${t.first_name} ${t.last_name} ${t.job_title || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (this.minutesAgo(a.last_location_update) ?? 1e9) - (this.minutesAgo(b.last_location_update) ?? 1e9));
  }
  select(t: any, center = true): void {
    this.selected = t;
    if (center && t.latitude && t.longitude) { this.autoFit = false; this.map.setView([parseFloat(t.latitude), parseFloat(t.longitude)], Math.max(this.map.getZoom(), 16), { animate: true }); }
    this.markers.get(t.id)?.openPopup();
  }
  centerOnTech(t: any): void { this.select(t, true); }
  toggleFollow(t: any): void {
    this.followId = this.followId === t.id ? null : t.id;
    if (this.followId) { this.autoFit = false; this.select(t, true); }
    this.updateMarkers();
  }
  mapsUrl(t: any): string { return `https://www.google.com/maps?q=${t.latitude},${t.longitude}`; }
  trackTech(_: number, t: any): number { return t.id; }
}
