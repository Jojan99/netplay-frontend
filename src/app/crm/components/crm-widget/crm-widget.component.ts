import { Component, OnInit, OnDestroy, NgZone, Inject, PLATFORM_ID, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { ConversationListComponent } from '../conversation-list/conversation-list.component';
import { ChatWindowComponent } from '../chat-window/chat-window.component';
import { CrmService } from '../../../services/crm.service';
import { EchoService } from '../../../services/echo.service';

type Provider = 'meta' | 'netplay';

/**
 * Bandeja flotante: el chat de WhatsApp disponible en todo el panel (fuera del CRM),
 * en una ventana que se puede mover, redimensionar y minimizar.
 */
@Component({
  selector: 'app-crm-widget',
  standalone: true,
  imports: [CommonModule, ConversationListComponent, ChatWindowComponent],
  templateUrl: './crm-widget.component.html',
  styleUrl: './crm-widget.component.scss',
  host: { class: 'np-console' },
})
export class CrmWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('panel') panel?: ElementRef<HTMLElement>;

  enabled = true;        // el usuario puede ocultarlo desde el botón
  visible = false;       // ruta actual fuera del CRM
  open = false;
  minimized = false;
  provider: Provider = 'netplay';
  inbox: any[] = [];
  activeConversationId: number | null = null;
  unread = 0;
  labels: any[] = [];
  private unreadMap = new Map<number, number>();
  private sub?: Subscription;
  private routeSub?: Subscription;
  private loaded = false;

  // posición y tamaño (persisten en el navegador)
  pos = { x: 0, y: 0 };
  size = { w: 420, h: 640 };
  private dragging = false; private dragOff = { x: 0, y: 0 };

  constructor(private crm: CrmService, private echo: EchoService, private zone: NgZone, private router: Router, @Inject(PLATFORM_ID) private platformId: Object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      this.enabled = localStorage.getItem('crm_widget') !== 'off';
      const saved = JSON.parse(localStorage.getItem('crm_widget_box') || 'null');
      if (saved) { this.pos = saved.pos; this.size = saved.size; }
      const p = sessionStorage.getItem('crm_inbox_provider'); if (p === 'meta' || p === 'netplay') this.provider = p;
    } catch {}
    if (!this.pos.x && !this.pos.y) { this.pos = { x: Math.max(8, window.innerWidth - this.size.w - 24), y: Math.max(8, window.innerHeight - this.size.h - 24) }; }
    this.updateVisibility(this.router.url);
    this.routeSub = this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => this.updateVisibility(e.urlAfterRedirects || e.url));
    this.sub = this.echo.inboxUpdated$.subscribe((payload: any) => this.zone.run(() => this.onRealtime(payload)));
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); this.routeSub?.unsubscribe(); }

  private updateVisibility(url: string): void {
    const wasVisible = this.visible;
    this.visible = !url.includes('/dashboard/crm') && url.startsWith('/dashboard');
    if (this.visible && !wasVisible && !this.loaded) { this.loaded = true; this.loadInbox(); this.crm.getLabels().subscribe({ next: r => this.labels = r.data ?? [], error: () => {} }); }
    if (!this.visible) this.activeConversationId = null;   // el CRM completo toma el relevo
  }

  loadInbox(): void {
    this.crm.getInbox({ provider: this.provider }).subscribe({
      next: res => { this.inbox = (res.data ?? []).map((c: any) => ({ ...c, unread_count: this.unreadMap.get(c.id) || 0 })); this.recount(); },
      error: err => { if (err?.status === 401 || err?.status === 403) this.enabled = false; }
    });
  }

  private onRealtime(payload: any): void {
    if (!this.visible) return;
    const fromCustomer = payload.sender !== 'agent';
    if (fromCustomer && payload.conversationId !== this.activeConversationId) {
      this.unreadMap.set(payload.conversationId, (this.unreadMap.get(payload.conversationId) || 0) + 1);
      this.playPop();
    }
    if ((payload.provider || this.provider) === this.provider) this.loadInbox(); else this.recount();
  }

  private recount(): void { this.unread = [...this.unreadMap.values()].reduce((a, b) => a + b, 0); }

  private audioCtx: AudioContext | null = null;
  private playPop(): void {
    try {
      if (localStorage.getItem('crm_sound') === '0') return;
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext; if (!Ctx) return;
      this.audioCtx ??= new Ctx(); const ctx = this.audioCtx!; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const t = ctx.currentTime + 0.01;
      for (const [f, at, d] of [[880, t, 0.16], [1174.7, t + 0.13, 0.22]] as [number, number, number][]) {
        const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.3, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
        o.connect(g).connect(ctx.destination); o.start(at); o.stop(at + d + 0.02);
      }
    } catch {}
  }

  /* ── acciones ──────────────────────────────────────────────── */
  toggle(): void { this.open = !this.open; this.minimized = false; if (this.open && !this.inbox.length) this.loadInbox(); }
  hide(): void { this.enabled = false; this.open = false; try { localStorage.setItem('crm_widget', 'off'); } catch {} }
  setProvider(p: Provider): void { if (this.provider === p) return; this.provider = p; this.activeConversationId = null; this.loadInbox(); }
  openChat(id: number): void {
    this.activeConversationId = id; this.unreadMap.set(id, 0);
    this.inbox = this.inbox.map(c => c.id === id ? { ...c, unread_count: 0 } : c); this.recount();
  }
  back(): void { this.activeConversationId = null; }
  goFull(): void { this.open = false; this.router.navigate(['/dashboard/crm/inbox']); }
  markUnread(id: number): void { this.unreadMap.set(id, Math.max(1, this.unreadMap.get(id) || 0)); if (this.activeConversationId === id) this.activeConversationId = null; this.inbox = this.inbox.map(c => c.id === id ? { ...c, unread_count: this.unreadMap.get(id) } : c); this.recount(); }

  /* ── mover / redimensionar ─────────────────────────────────── */
  get isMobile(): boolean { return isPlatformBrowser(this.platformId) && window.innerWidth < 768; }
  startDrag(ev: MouseEvent): void {
    if (this.isMobile || (ev.target as HTMLElement).closest('button')) return;
    this.dragging = true; this.dragOff = { x: ev.clientX - this.pos.x, y: ev.clientY - this.pos.y }; ev.preventDefault();
  }
  @HostListener('document:mousemove', ['$event']) onMove(ev: MouseEvent): void {
    if (!this.dragging) return;
    const w = this.size.w, h = this.minimized ? 48 : this.size.h;
    this.pos = { x: Math.min(Math.max(0, ev.clientX - this.dragOff.x), window.innerWidth - Math.min(w, 120)), y: Math.min(Math.max(0, ev.clientY - this.dragOff.y), window.innerHeight - 48) };
  }
  @HostListener('document:mouseup') onUp(): void { if (this.dragging) { this.dragging = false; this.persistBox(); } }
  onResized(): void {
    const el = this.panel?.nativeElement; if (!el || this.minimized) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w !== this.size.w || h !== this.size.h) { this.size = { w, h }; this.persistBox(); }
  }
  private persistBox(): void { try { localStorage.setItem('crm_widget_box', JSON.stringify({ pos: this.pos, size: this.size })); } catch {} }
}
