import { DialogService } from '../../../services/dialog.service';
import { ToastService } from '../../../services/toast.service';
import {
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  Inject, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PLATFORM_ID } from '@angular/core';

import { ConversationListComponent } from '../../components/conversation-list/conversation-list.component';
import { ChatWindowComponent } from '../../components/chat-window/chat-window.component';
import { TransferConversationModalComponent } from '../../components/transfer-conversation-modal/transfer-conversation-modal.component';
import { CrmDashboardComponent } from '../crm-dashboard/crm-dashboard.component';
import { CrmBroadcastModalComponent } from '../../components/crm-broadcast-modal/crm-broadcast-modal.component';
import { CrmNewConversationModalComponent } from '../../components/crm-new-conversation-modal/crm-new-conversation-modal.component';

import { CrmService } from '../../../services/crm.service';
import { EchoService } from '../../../services/echo.service';

type InboxStatus = 'all' | 'new' | 'in_progress' | 'closed';
type MainView    = 'inbox' | 'dashboard';
type InboxProvider = 'meta' | 'netplay';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ConversationListComponent,
    ChatWindowComponent,
    TransferConversationModalComponent,
    CrmDashboardComponent,
    CrmBroadcastModalComponent,
    CrmNewConversationModalComponent
  ],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.scss',
  host: { class: 'np-console' },
})
export class InboxComponent implements OnInit, OnDestroy {
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  inbox: any[] = [];

  activeConversationId: number | null = null;
  inboxStatus: InboxStatus = 'all';
  inboxProvider: InboxProvider = 'meta';
  mainView: MainView = 'inbox';

  mobileView: 'list' | 'chat' = 'list';
  isMobile = false;

  showTransferModal       = false;
  showBroadcastModal      = false;
  showNewConversationModal = false;

  private unreadMap = new Map<number, number>();

  /* ── Mensajes nuevos en la otra bandeja (Meta ↔ WhatsApp Web) ── */
  providerUnread: Record<string, number> = { meta: 0, netplay: 0 };

  /* ── Escribirle a un contacto compartido en el chat ──────────── */
  async startChatWith(c: { phone: string; name: string }) {
    const phone = (c.phone || '').replace(/[^\d+]/g, '');
    if (!phone) return;
    const existing = this.inbox.find(x => (x.customer?.phone || '').replace(/\D/g, '').endsWith(phone.replace(/\D/g, '').slice(-10)));
    if (existing) { this.openChat(existing.id); return; }
    if (!await this.dialog.confirm(`¿Iniciar un chat nuevo con ${c.name || phone} (${phone})?`)) return;
    this.crmService.createConversation(phone, c.name || phone, this.inboxProvider).subscribe({
      next: res => { const id = res?.conversation_id ?? res?.data?.id; if (id) { this.loadInbox(); this.openChat(id); } },
      error: err => this.toast.error(err?.error?.message || err?.error?.error || 'No se pudo crear la conversación.')
    });
  }

  /* ── Etiquetas (para filtrar la lista) ───────────────────────── */
  labels: any[] = [];
  loadLabels(): void { this.crmService.getLabels().subscribe({ next: r => this.labels = r.data ?? [], error: () => {} }); }

  /* ── Configuración del CRM ───────────────────────────────────── */
  settings: any = null;
  settingsForm: any = null;
  showSettings = false;
  savingSettings = false;
  settingsError = '';
  readonly days = [{ n: 1, l: 'L' }, { n: 2, l: 'M' }, { n: 3, l: 'X' }, { n: 4, l: 'J' }, { n: 5, l: 'V' }, { n: 6, l: 'S' }, { n: 7, l: 'D' }];
  loadSettings(): void { this.crmService.getSettings().subscribe({ next: r => this.settings = r.data ?? null, error: () => {} }); }
  openSettings(): void {
    this.settingsError = '';
    this.crmService.getSettings().subscribe({
      next: r => { this.settings = r.data; this.settingsForm = { ...r.data, business_days: [...(r.data.business_days || [])] }; this.showSettings = true; },
      error: () => this.toast.error('No se pudo cargar la configuración.')
    });
  }
  toggleDay(n: number): void {
    const i = this.settingsForm.business_days.indexOf(n);
    i === -1 ? this.settingsForm.business_days.push(n) : this.settingsForm.business_days.splice(i, 1);
  }
  saveSettings(): void {
    if (this.savingSettings) return;
    this.savingSettings = true; this.settingsError = '';
    const f = this.settingsForm;
    this.crmService.saveSettings({
      auto_assign: !!f.auto_assign, off_hours_enabled: !!f.off_hours_enabled, business_days: f.business_days,
      open_time: f.open_time, close_time: f.close_time, off_hours_message: f.off_hours_message || null,
      welcome_message: f.welcome_message || null, wait_alert_minutes: Number(f.wait_alert_minutes) || 15,
    }).subscribe({
      next: r => { this.settings = r.data; this.savingSettings = false; this.showSettings = false; },
      error: err => { this.savingSettings = false; this.settingsError = err?.error?.message || 'No se pudo guardar.'; }
    });
  }

  /* ── Sonido de notificación (sintetizado, sin archivos) ──────── */
  soundEnabled = true;
  private audioCtx: AudioContext | null = null;

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    try { localStorage.setItem('crm_sound', this.soundEnabled ? '1' : '0'); } catch {}
    if (this.soundEnabled) { this.playNotification(); this.askNotificationPermission(); }
  }

  /* ── Notificaciones del navegador (pestaña en segundo plano) ─── */
  private askNotificationPermission(): void {
    if (!isPlatformBrowser(this.platformId) || !('Notification' in window)) return;
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }

  private notifyBrowser(conv: any): void {
    if (!this.soundEnabled || !isPlatformBrowser(this.platformId) || !('Notification' in window)) return;
    if (Notification.permission !== 'granted' || document.visibilityState === 'visible') return;
    try {
      const name = conv?.customer?.name || conv?.customer_name || conv?.customer?.phone || 'Cliente';
      const body = this.previewText(conv).slice(0, 120);
      const n = new Notification(`WhatsApp · ${name}`, { body, tag: `crm-${conv?.id}`, icon: '/favicon.ico', silent: true });
      n.onclick = () => { window.focus(); this.zone.run(() => this.openChat(conv.id)); n.close(); };
    } catch {}
  }

  /** Dos notas cortas tipo "pop" de WhatsApp Web. */
  private playNotification(): void {
    if (!this.soundEnabled || !isPlatformBrowser(this.platformId)) return;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx ??= new Ctx();
      const ctx = this.audioCtx!;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const play = (freq: number, at: number, dur: number) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.35, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at); osc.stop(at + dur + 0.02);
      };
      const t = ctx.currentTime + 0.01;
      play(880, t, 0.16);
      play(1174.7, t + 0.13, 0.22);
    } catch {}
  }

  constructor(
    private crmService: CrmService,
    private echoService: EchoService,
    private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobile = window.innerWidth < 768;
      window.addEventListener('resize', () => { this.isMobile = window.innerWidth < 768; });

      const saved = sessionStorage.getItem('crm_inbox_status') as InboxStatus;
      if (saved) this.inboxStatus = saved;
      try { this.soundEnabled = localStorage.getItem('crm_sound') !== '0'; } catch {}
      const savedProvider = sessionStorage.getItem('crm_inbox_provider') as InboxProvider;
      if (savedProvider === 'meta' || savedProvider === 'netplay') this.inboxProvider = savedProvider;
    }

    this.loadInbox();
    this.loadLabels();
    this.loadSettings();
    this.listenInboxRealtime();
    // El permiso se pide tras el primer clic del agente (el navegador lo exige)
    if (isPlatformBrowser(this.platformId)) document.addEventListener('click', () => this.askNotificationPermission(), { once: true });
  }

  /* ── REALTIME ───────────────────────────────────────────────── */
  listenInboxRealtime(): void {
    this.echoService.inboxUpdated$.subscribe((payload: any) => {
      this.zone.run(() => {
        const conversationId = payload.conversationId;
        const fromCustomer = payload.sender !== 'agent';
        const provider: string = payload.provider || this.inboxProvider;

        // No leídos: se cuentan por conversación, sin importar en qué bandeja esté el agente
        if (fromCustomer && this.activeConversationId !== conversationId) {
          this.unreadMap.set(conversationId, (this.unreadMap.get(conversationId) || 0) + 1);
        }

        const filters: any = { provider };
        if (provider === this.inboxProvider && this.inboxStatus !== 'all') filters.status = this.inboxStatus;

        this.crmService.getInbox(filters).subscribe(res => {
          const freshInbox = res.data ?? [];
          freshInbox.forEach((c: any) => { c.unread_count = this.unreadMap.get(c.id) || 0; });
          const updatedConv = freshInbox.find((c: any) => c.id === conversationId);

          if (provider !== this.inboxProvider) {
            // Llegó a la otra bandeja: contador en el chip + lista para previsualizar al pasar el mouse
            if (fromCustomer && updatedConv) {
              this.rememberArrival(provider, updatedConv);
              this.playNotification();
              this.showToast(updatedConv, provider);
              this.notifyBrowser(updatedConv);
            }
            return;
          }

          if (!updatedConv) { this.inbox = freshInbox; return; }
          this.inbox = [updatedConv, ...freshInbox.filter((c: any) => c.id !== conversationId)];

          // Sonido y aviso sólo cuando hay un mensaje real del cliente en un chat que no está abierto
          if (fromCustomer && this.activeConversationId !== conversationId) {
            this.playNotification();
            this.showToast(updatedConv, provider);
            this.notifyBrowser(updatedConv);
          }
        });
      });
    });
  }

  /* ── Llegadas en la otra bandeja (previsualización al pasar el mouse) ── */
  providerRecent: Record<string, any[]> = { meta: [], netplay: [] };
  hoverProvider: string | null = null;
  private rememberArrival(provider: string, conv: any): void {
    const list = (this.providerRecent[provider] || []).filter(c => c.id !== conv.id);
    this.providerRecent = { ...this.providerRecent, [provider]: [conv, ...list].slice(0, 8) };
    this.providerUnread = { ...this.providerUnread, [provider]: this.providerRecent[provider].length };
  }
  openFromPreview(provider: 'meta' | 'netplay', id: number): void {
    this.hoverProvider = null;
    if (this.inboxProvider !== provider) this.setProvider(provider);
    this.openChat(id);
  }
  previewText(c: any): string {
    const lm = c?.last_message; if (!lm) return '';
    const t: Record<string, string> = { image: '📷 Foto', audio: '🎤 Nota de voz', video: '🎥 Video', document: '📄 Documento', sticker: 'Sticker', location: '📍 Ubicación', contact: '👤 Contacto', poll: '📊 Encuesta', event: '📅 Evento' };
    return t[lm.type] || lm.content || 'Mensaje';
  }
  timeAgo(iso: string): string {
    const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`;
  }

  /* ── Avisos en pantalla ─────────────────────────────────────── */
  toasts: { id: number; conv: any; provider: string }[] = [];
  private showToast(conv: any, provider: string): void {
    const id = Date.now() + Math.random();
    this.toasts = [...this.toasts.filter(t => t.conv.id !== conv.id), { id, conv, provider }].slice(-4);
    setTimeout(() => this.zone.run(() => this.toasts = this.toasts.filter(t => t.id !== id)), 7000);
  }
  dismissToast(id: number): void { this.toasts = this.toasts.filter(t => t.id !== id); }
  openToast(t: { conv: any; provider: string }): void { this.dismissToast((t as any).id); this.openFromPreview(t.provider as any, t.conv.id); }

  /* ── INBOX ──────────────────────────────────────────────────── */
  loadInbox(): void {
    const filters: any = {};
    if (this.inboxStatus !== 'all') filters.status = this.inboxStatus;
    filters.provider = this.inboxProvider;

    this.crmService.getInbox(filters).subscribe(res => {
      const freshInbox = res.data ?? [];
      freshInbox.forEach((c: any) => { c.unread_count = this.unreadMap.get(c.id) || 0; });
      this.inbox = freshInbox;
    });
  }

  /* ── TABS ───────────────────────────────────────────────────── */
  setStatus(status: InboxStatus): void {
    if (this.inboxStatus === status) return;
    this.inboxStatus = status;
    sessionStorage.setItem('crm_inbox_status', status);
    this.activeConversationId = null;
    this.mobileView = 'list';
    this.loadInbox();
  }

  setProvider(provider: InboxProvider): void {
    if (this.inboxProvider === provider) return;
    this.inboxProvider = provider;
    this.providerUnread = { ...this.providerUnread, [provider]: 0 };
    this.providerRecent = { ...this.providerRecent, [provider]: [] };
    this.activeConversationId = null;
    this.mobileView = 'list';
    if (isPlatformBrowser(this.platformId)) sessionStorage.setItem('crm_inbox_provider', provider);
    this.loadInbox();
  }

  setView(view: MainView): void {
    this.mainView = view;
    if (view === 'inbox') this.activeConversationId = null;
  }

  /* ── CHAT ───────────────────────────────────────────────────── */
  openChat(conversationId: number): void {
    this.activeConversationId = conversationId;
    this.mainView = 'inbox';
    this.unreadMap.set(conversationId, 0);

    const conv = this.inbox.find(c => c.id === conversationId);
    if (conv) { conv.unread_count = 0; this.inbox = [...this.inbox]; }

    if (this.isMobile) this.mobileView = 'chat';
  }

  backToList(): void { this.mobileView = 'list'; }

  markUnread(conversationId: number): void {
    this.unreadMap.set(conversationId, Math.max(1, this.unreadMap.get(conversationId) || 0));
    if (this.activeConversationId === conversationId) { this.activeConversationId = null; this.mobileView = 'list'; }
    this.inbox = this.inbox.map(c => c.id === conversationId ? { ...c, unread_count: this.unreadMap.get(conversationId) } : c);
  }

  onConversationClosed(): void {
    this.activeConversationId = null;
    this.loadInbox();
    if (this.isMobile) this.mobileView = 'list';
  }

  onConversationCreated(conversationId: number): void {
    this.loadInbox();
    this.openChat(conversationId);
  }

  /* ── TRANSFER ───────────────────────────────────────────────── */
  openTransfer(): void { this.showTransferModal = true; }

  onTransferClosed(success: boolean): void {
    this.showTransferModal = false;
    if (success) {
      this.activeConversationId = null;
      this.mobileView = 'list';
      this.loadInbox();
    }
  }

  /* ── CLEANUP ────────────────────────────────────────────────── */
  ngOnDestroy(): void {
    const echo = this.echoService.instance;
    if (echo) echo.leave('crm.inbox');
  }
}
