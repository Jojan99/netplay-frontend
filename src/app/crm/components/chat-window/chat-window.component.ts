import {
  Component,
  EventEmitter,
  Output,
  Input,
  OnChanges,
  OnDestroy,
  NgZone,
  ViewChild,
  ElementRef,
  HostBinding
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { MessageBubbleComponent } from '../message-bubble/message-bubble.component';
import { PreviewModalComponent } from '../preview-modal/preview-modal.component';
import { CrmInfoPanelComponent } from '../crm-info-panel/crm-info-panel.component';

import { CrmService } from '../../../services/crm.service';
import { EchoService } from '../../../services/echo.service';
import { AudioFfmpegService } from '../../../core/audio-ffmpeg.service';
import { ChatMessage } from '../message-bubble/message-bubble.component';

export interface NewMessageEventPayload {
  message: {
    id: number;
    sender_type: 'customer' | 'agent' | 'system';
    content: string | null;
    message_type: string;
    media_url: string | null;
    mime_type?: string | null;
    agent_signature?: string | null;
    is_forwarded?: boolean;
    created_at: string;
    status?: string | null;
    quoted?: any;
  };
}

export interface QuickReply { id: number; shortcut: string; title?: string | null; content: string; }

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ChatHeaderComponent,
    MessageBubbleComponent,
    PreviewModalComponent,
    CrmInfoPanelComponent
  ],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.scss'
})
export class ChatWindowComponent implements OnChanges, OnDestroy {

  @Input() conversationId: number | null = null;
  /** Modo compacto (widget flotante): el panel de info se superpone en vez de abrir una columna. */
  @Input() @HostBinding('class.is-compact') compact = false;
  @Output() openTransfer        = new EventEmitter<void>();
  @Output() back                = new EventEmitter<void>();
  @Output() conversationClosed  = new EventEmitter<void>();
  @Output() openConversation    = new EventEmitter<number>();

  // ── Ficha del cliente (para el panel lateral y las variables de respuestas rápidas) ──
  customerSummary: any = null;
  summaryLoading = false;
  loadSummary(): void {
    if (!this.conversationId) return;
    this.summaryLoading = true;
    const id = this.conversationId;
    this.crmService.getCustomerSummary(id).subscribe({
      next: res => { if (this.conversationId === id) { this.customerSummary = res.data ?? null; this.summaryLoading = false; } },
      error: () => { this.summaryLoading = false; }
    });
  }

  readonly quickVars = ['nombre','primer_nombre','telefono','cedula','direccion','plan','precio_plan','ip','estado','saldo','facturas_pendientes','factura','vence','link_factura','fecha','hora'];
  readonly quickPlaceholder = 'Hola {primer_nombre}, tu factura {factura} por {saldo} vence el {vence}. Podés verla acá: {link_factura}';
  varToken(v: string): string { return '{' + v + '}'; }
  insertVar(v: string): void { this.quickForm.content = (this.quickForm.content || '') + this.varToken(v); }

  /** Variables disponibles en respuestas rápidas: {nombre}, {plan}, {saldo}, {factura}, {vence}, {link_factura}… */
  fillVariables(text: string): string {
    const sm = this.customerSummary || {};
    const first = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
    const money = (v: number) => '$' + Math.round(v || 0).toLocaleString('es-CO');
    const unpaid = sm.last_unpaid;
    const vars: Record<string, string> = {
      nombre:      sm.linked ? sm.name : (this.headerData?.customerName || ''),
      primer_nombre: first(sm.linked ? sm.name : (this.headerData?.customerName || '')),
      telefono:    this.headerData?.customerPhone || sm.phone || '',
      cedula:      sm.dni || '',
      direccion:   sm.address || '',
      plan:        sm.plan || '',
      precio_plan: sm.plan_price ? money(sm.plan_price) : '',
      ip:          sm.ip || '',
      estado:      sm.service_status || '',
      saldo:       sm.debt?.total ? money(sm.debt.total) : '$0',
      facturas_pendientes: String(sm.debt?.count ?? 0),
      factura:     unpaid?.number || '',
      vence:       unpaid?.due_date || sm.debt?.oldest_due || '',
      link_factura: unpaid?.link || '',
      fecha:       new Date().toLocaleDateString('es-CO'),
      hora:        new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
      empresa:     'Netplay',
    };
    return text.replace(/\{([a-z_]+)\}/gi, (m, k) => (vars[k.toLowerCase()] !== undefined ? vars[k.toLowerCase()] : m));
  }

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('docInput')  docInput!: ElementRef<HTMLInputElement>;
  @ViewChild('mediaInput') mediaInput!: ElementRef<HTMLInputElement>;
  @ViewChild('messageTextarea') messageTextarea?: ElementRef<HTMLTextAreaElement>;

  messages: ChatMessage[] = [];

  loading  = false;
  sending  = false;
  draftMessage = '';

  private mediaStream: MediaStream | null = null;

  // ── Adjuntos ──────────────────────────────────────────────────
  fileToSend:  File | null = null;
  filePreview: File | null = null;
  previewUrl:  string | null = null;
  previewType: 'video' | 'audio' | 'document' | 'pdf' | 'office' | 'image' | null = null;

  dragging         = false;
  showAttachMenu   = false;
  mediaCaption     = '';   // texto que acompaña a la foto/video (se ve debajo, como en WhatsApp)
  isProcessingAudio = false;

  // ── Audio ─────────────────────────────────────────────────────
  isRecording          = false;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: BlobPart[] = [];
  recordSeconds        = 0;
  private recordTimer: any = null;
  audioPreviewUrl: string | null = null;
  recordedAudioFile: File | null = null;
  private currentConversationId: number | null = null;
  private sendAfterStop = false;

  /* ── Helpers de presentación ────────────────────────────────── */
  showDaySeparator(i: number): boolean {
    if (i === 0) return true;
    const a = new Date(this.messages[i - 1]?.at).toDateString();
    const b = new Date(this.messages[i]?.at).toDateString();
    return a !== b;
  }
  dayLabel(iso: string): string {
    const d = new Date(iso); if (isNaN(d.getTime())) return '';
    const now = new Date(); const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Hoy';
    if (d.toDateString() === y.toDateString()) return 'Ayer';
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  fileSize(bytes: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
  fmtSecs(s: number): string { const m = Math.floor(s / 60), r = s % 60; return `${m}:${r < 10 ? '0' : ''}${r}`; }

  /** Descarta la grabación en curso sin dejar audio pendiente. */
  cancelRecording(): void {
    this.sendAfterStop = false;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = () => this.zone.run(() => { this.isProcessingAudio = false; this.cancelAudio(); });
      this.mediaRecorder.stop();
    } else { this.cancelAudio(); }
  }
  /** Detiene y envía de una, como el botón de enviar de WhatsApp. */
  stopAndSend(): void { this.sendAfterStop = true; this.stopRecording(); }

  // ── UI ─────────────────────────────────────────────────────────
  previewOpen    = false;
  showInfoPanel  = false;
  botPaused = false;

  // ── Header data ───────────────────────────────────────────────
  headerData: {
    customerName:  string;
    customerPhone: string;
    status: 'open' | 'in_progress' | 'closed';
    priority?: 'low' | 'normal' | 'high';
    online?: boolean;
    agentName?: string;
    provider?: string;
    metaWindowOpen?: boolean | null;
    metaWindowUntil?: string | null;
  } | null = null;
  /** Meta: fuera de la ventana de 24 h no se puede responder libremente. */
  get composerBlocked(): boolean { return !!this.headerData && this.headerData.provider === 'meta' && this.headerData.metaWindowOpen === false; }
  metaWindowLabel(): string {
    const u = this.headerData?.metaWindowUntil; if (!u) return '';
    const d = new Date(u); return isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // ── Ubicación (enviar) ────────────────────────────────────────
  @Output() startChat = new EventEmitter<{ phone: string; name: string }>();
  showLocationModal = false;
  locForm = { lat: '', lng: '', name: '', address: '', raw: '' };
  locError = ''; locLocating = false;
  openLocationModal(): void { this.showAttachMenu = false; this.locForm = { lat: '', lng: '', name: '', address: '', raw: '' }; this.locError = ''; this.showLocationModal = true; }
  /** Acepta "lat, lng" o un link de Google Maps (…@lat,lng… o ?q=lat,lng). */
  parseLocationInput(): void {
    const raw = this.locForm.raw.trim(); if (!raw) return;
    const m = raw.match(/(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/) || raw.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) { this.locForm.lat = m[1]; this.locForm.lng = m[2]; this.locError = ''; }
    else this.locError = 'No encontré coordenadas. Pegá "lat, lng" o un link de Google Maps.';
  }
  useMyLocation(): void {
    if (!navigator.geolocation) { this.locError = 'Este navegador no permite obtener la ubicación.'; return; }
    this.locLocating = true;
    navigator.geolocation.getCurrentPosition(
      pos => this.zone.run(() => { this.locForm.lat = pos.coords.latitude.toFixed(6); this.locForm.lng = pos.coords.longitude.toFixed(6); this.locLocating = false; this.locError = ''; }),
      () => this.zone.run(() => { this.locLocating = false; this.locError = 'No se pudo obtener la ubicación del dispositivo.'; }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
  sendLocation(): void {
    const lat = parseFloat(this.locForm.lat), lng = parseFloat(this.locForm.lng);
    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { this.locError = 'Coordenadas inválidas.'; return; }
    if (!this.conversationId || this.sending) return;
    this.showLocationModal = false;
    this.sending = true;
    const tempId = Date.now();
    const where = [this.locForm.name.trim(), this.locForm.address.trim()].filter(Boolean).join(' · ');
    this.messages.push({ id: tempId, from: 'agent', content: `📍 Ubicación: lat ${lat}, lng ${lng}` + (where ? '\n' + where : ''), message_type: 'location', media_url: null, at: new Date().toISOString(), pending: true });
    this.scrollToBottom();
    this.crmService.sendMessage(this.conversationId, { message: '', type: 'location', latitude: lat, longitude: lng, name: this.locForm.name.trim() || null, address: this.locForm.address.trim() || null } as any)
      .subscribe({ next: () => this.sending = false, error: () => { this.sending = false; this.markFailed(tempId); } });
  }

  // ── Emojis (compositor y reacciones) ─────────────────────────
  showEmojiPicker = false;
  emojiTab = 0;
  emojiTarget: ChatMessage | null = null;   // si está definido, el emoji elegido es una reacción
  readonly emojiGroups: { name: string; list: string[] }[] = [
    { name: 'Caritas', list: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','🥰','😘','😋','😜','🤪','🤔','🤗','🤭','🤫','😐','😑','😶','🙄','😏','😒','😔','😴','🤤','😷','🤒','🤕','🥳','😎','🤓','😕','😟','🙁','😮','😯','😲','😳','🥺','😢','😭','😤','😠','😡','🤯','😱','😨','😰','😥','😓','🤝','👏'] },
    { name: 'Gestos', list: ['👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🙏','💪','🫶','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','❣️','💕','💞','💖','✨','🔥','⭐','🌟','💯','✅','❌','⚠️','❗','❓','💬','👀','🙌','🫡'] },
    { name: 'Objetos', list: ['📱','💻','🖥️','📡','🛰️','🔌','🔋','💡','🔧','🔨','🛠️','⚙️','📶','🌐','📍','🏠','🏢','🚗','🛵','🚚','📦','📄','📋','📎','✏️','📅','⏰','⏳','💳','💵','💰','🧾','🎫','🔑','🔒','🔓','📞','☎️','📧','🔔','🔕','🎉','🎁','☕','🍕','⚽','🏆'] },
    { name: 'Símbolos', list: ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','▶️','⏸️','⏹️','🔁','➡️','⬅️','⬆️','⬇️','↩️','↪️','🆗','🆕','🆓','🆘','🅿️','ℹ️','♻️','✔️','☑️','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟥','🟩','🟦','🔺','🔻','🔸','🔹','💤','🚫','🕐','🕓','🕘'] },
  ];
  toggleEmojiPicker(ev?: Event): void { ev?.stopPropagation(); this.emojiTarget = null; this.showEmojiPicker = !this.showEmojiPicker; this.showAttachMenu = false; this.showQuickPanel = false; }
  openEmojiForReaction(msg: ChatMessage): void { this.emojiTarget = msg; this.showEmojiPicker = true; }
  pickEmoji(e: string): void {
    if (this.emojiTarget) { this.reactTo({ message: this.emojiTarget, emoji: e }); this.emojiTarget = null; this.showEmojiPicker = false; return; }
    const ta = this.messageTextarea?.nativeElement;
    if (!ta) { this.draftMessage += e; return; }
    const start = ta.selectionStart ?? this.draftMessage.length, end = ta.selectionEnd ?? start;
    this.draftMessage = this.draftMessage.slice(0, start) + e + this.draftMessage.slice(end);
    setTimeout(() => { ta.focus(); const p = start + e.length; ta.setSelectionRange(p, p); this.autoResize(ta); }, 0);
  }

  /** Reacción del agente (emoji vacío = quitar). Se aplica al instante y se confirma por Echo. */
  reactTo(ev: { message: ChatMessage; emoji: string }): void {
    if (!this.conversationId || ev.message.pending) return;
    this.applyReaction(ev.message.id, ev.emoji, 'agent');
    this.crmService.sendMessage(this.conversationId, { message: ev.emoji, type: 'reaction', target_message_id: ev.message.id } as any)
      .subscribe({ error: () => alert('No se pudo enviar la reacción.') });
  }
  private applyReaction(targetId: number, emoji: string, from: string): void {
    const idx = this.messages.findIndex(m => m.id === targetId);
    if (idx === -1) return;
    const copy = [...this.messages];
    const list = (copy[idx].reactions || []).filter(r => r.from !== from);
    if (emoji) list.push({ emoji, from });
    copy[idx] = { ...copy[idx], reactions: list, _renderKey: Date.now() };
    this.messages = copy;
  }

  /** Foco directo en el cuadro de texto al abrir un chat (sólo escritorio, en móvil abriría el teclado). */
  private focusComposer(delay = 120): void {
    if (typeof window === 'undefined' || window.innerWidth < 768) return;
    setTimeout(() => { const ta = this.messageTextarea?.nativeElement; if (ta && document.activeElement !== ta) ta.focus(); }, delay);
  }

  // ── Stickers ─────────────────────────────────────────────────
  showStickerPicker = false;
  stickers: any[]   = [];

  // ── Búsqueda en la conversación ───────────────────────────────
  searchOpen = false;
  searchTerm = '';
  searchHits: number[] = [];
  searchPos = 0;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  toggleSearch(): void {
    this.searchOpen = !this.searchOpen;
    if (this.searchOpen) setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
    else { this.searchTerm = ''; this.searchHits = []; }
  }
  runSearch(): void {
    const t = this.searchTerm.trim().toLowerCase();
    this.searchHits = t ? this.messages.filter(m => (m.content || '').toLowerCase().includes(t)).map(m => m.id) : [];
    this.searchPos = this.searchHits.length ? this.searchHits.length - 1 : 0; // el más reciente primero
    this.jumpToHit();
  }
  searchStep(delta: number): void {
    if (!this.searchHits.length) return;
    this.searchPos = (this.searchPos + delta + this.searchHits.length) % this.searchHits.length;
    this.jumpToHit();
  }
  isHit(id: number): boolean { return this.searchHits.includes(id); }
  isCurrentHit(id: number): boolean { return this.searchHits[this.searchPos] === id; }
  private jumpToHit(): void {
    const id = this.searchHits[this.searchPos];
    if (id == null) return;
    setTimeout(() => document.getElementById('msg-' + id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 0);
  }
  onSearchKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') { ev.preventDefault(); ev.shiftKey ? this.searchStep(1) : this.searchStep(-1); }
    if (ev.key === 'Escape') { ev.preventDefault(); this.toggleSearch(); }
  }

  // ── Reintento de envíos fallidos ──────────────────────────────
  private pendingPayloads = new Map<number, { kind: 'text' | 'media' | 'audio' | 'sticker'; text?: string; file?: File; type?: string; sticker?: any; quotedId?: number; caption?: string }>();

  private markFailed(tempId: number): void {
    const idx = this.messages.findIndex(x => x.pending && x.id === tempId);
    if (idx === -1) return;
    const copy = [...this.messages];
    copy[idx] = { ...copy[idx], failed: true, _renderKey: Date.now() };
    this.messages = copy;
  }

  retrySend(msg: ChatMessage): void {
    const payload = this.pendingPayloads.get(msg.id);
    this.dropPending(msg.id);
    this.pendingPayloads.delete(msg.id);
    if (!payload) return;
    switch (payload.kind) {
      case 'text':    if (payload.quotedId) this.replyTarget = this.messages.find(x => x.id === payload.quotedId) || null; this.sendMessage(payload.text || ''); break;
      case 'media':   this.fileToSend = payload.file!; this.mediaCaption = payload.caption || ''; this.sendMedia(); break;
      case 'audio':   this.recordedAudioFile = payload.file!; this.sendRecordedAudio(); break;
      case 'sticker': this.sendSticker(payload.sticker); break;
    }
  }

  /** Reduce fotos grandes en el navegador (máx. 1600px, JPEG 85%) para subir rápido. */
  private async compressImage(file: File): Promise<File> {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600 * 1024) return file;
    try {
      const bitmap = await createImageBitmap(file);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
      const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
      const blob: Blob | null = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (!blob || blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' });
    } catch { return file; }
  }

  // ── Respuestas rápidas ("/atajo") ─────────────────────────────
  quickReplies: QuickReply[] = [];
  private quickLoaded = false;
  showQuickPanel   = false;
  quickPanelQuery  = '';
  showSlashPicker  = false;
  slashMatches: QuickReply[] = [];
  slashIndex       = 0;
  showQuickManager = false;
  quickSaving      = false;
  quickError       = '';
  quickForm: { id: number | null; shortcut: string; title: string; content: string } = { id: null, shortcut: '', title: '', content: '' };

  // ── Reenviar ──────────────────────────────────────────────────
  forwardingMessage: ChatMessage | null = null;
  allConversations: any[] = [];
  forwardTargets: number[] = [];

  constructor(
    private crmService: CrmService,
    private echoService: EchoService,
    private zone: NgZone,
    private audioFfmpeg: AudioFfmpegService
  ) {}

  trackByMessage(_: number, msg: any) { return msg._renderKey ?? msg.id; }

  /* ── CAMBIO DE CONVERSACIÓN ─────────────────────────────────── */
  ngOnChanges(): void {
    if (!this.conversationId) return;

    if (this.currentConversationId) {
      this.echoService.leave(`conversation.${this.currentConversationId}`);
    }

    this.currentConversationId = this.conversationId;
    this.showInfoPanel = false;
    this.replyTarget = null;
    this.loadMessages(this.conversationId);
    this.loadStickers();
    this.customerSummary = null;
    this.loadSummary();
    if (!this.quickLoaded) { this.quickLoaded = true; this.loadQuickReplies(); }

    const echo = this.echoService.instance;
    if (!echo) return;

    echo
      .private(`conversation.${this.conversationId}`)
      .listen('.message.new', (e: NewMessageEventPayload) => {
        this.zone.run(() => { this.upsertIncoming(e.message); this.scrollToBottom(); });
      })
      .listen('.message.status', (e: { messageId: number; status: string }) => {
        this.zone.run(() => this.applyStatus(e.messageId, e.status));
      })
      .listen('.poll.vote', (e: { messageId: number; votes: any[] }) => {
        this.zone.run(() => this.applyPollVotes(e.messageId, e.votes || []));
      });
  }

  // ── Encuestas ────────────────────────────────────────────────
  get canVote(): boolean { return (this.headerData?.provider || 'netplay') !== 'meta'; }
  private applyPollVotes(messageId: number, votes: any[]): void {
    const idx = this.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const copy = [...this.messages];
    copy[idx] = { ...copy[idx], poll_votes: votes, _renderKey: Date.now() };
    this.messages = copy;
  }
  votePoll(ev: { message: ChatMessage; options: string[] }): void {
    if (!this.conversationId) return;
    // Aplicar al instante; el evento en tiempo real confirma con los votos reales
    const cur = (ev.message.poll_votes || []).filter(v => v.voter_type !== 'agent');
    this.applyPollVotes(ev.message.id, ev.options.length ? [...cur, { voter_key: 'agent', voter_type: 'agent', voter_name: null, options: ev.options }] : cur);
    this.crmService.sendMessage(this.conversationId, { message: '', type: 'poll_vote', target_message_id: ev.message.id, options: ev.options } as any)
      .subscribe({
        next: (r: any) => { if (r?.status === 'error') { alert(r.message || 'No se pudo votar.'); this.applyPollVotes(ev.message.id, ev.message.poll_votes || []); } },
        error: () => { alert('No se pudo enviar el voto.'); this.applyPollVotes(ev.message.id, ev.message.poll_votes || []); }
      });
  }
  showPollModal = false;
  pollForm = { question: '', options: ['', ''], multi: false };
  openPollModal(): void { this.showAttachMenu = false; this.pollForm = { question: '', options: ['', ''], multi: false }; this.showPollModal = true; }
  addPollOption(): void { if (this.pollForm.options.length < 12) this.pollForm.options.push(''); }
  removePollOption(i: number): void { if (this.pollForm.options.length > 2) this.pollForm.options.splice(i, 1); }
  trackIdx(i: number): number { return i; }
  get pollFormValid(): boolean {
    const opts = this.pollForm.options.map(o => o.trim()).filter(Boolean);
    return !!this.pollForm.question.trim() && opts.length >= 2 && new Set(opts).size === opts.length;
  }
  sendPoll(): void {
    if (!this.pollFormValid || !this.conversationId || this.sending) return;
    const question = this.pollForm.question.trim();
    const options = this.pollForm.options.map(o => o.trim()).filter(Boolean);
    this.showPollModal = false; this.sending = true;
    const tempId = Date.now();
    this.messages.push({ id: tempId, from: 'agent', content: `📊 Encuesta: ${question}\n` + options.map(o => '• ' + o).join('\n') + (this.pollForm.multi ? '\n(varias opciones)' : ''), message_type: 'poll', media_url: null, poll_votes: [], at: new Date().toISOString(), pending: true });
    this.scrollToBottom();
    this.crmService.sendMessage(this.conversationId, { message: question, type: 'poll', question, options, selectable: this.pollForm.multi ? options.length : 1 } as any)
      .subscribe({
        next: (r: any) => { this.sending = false; if (r?.status === 'error') { this.dropPending(tempId); alert(r.message || 'No se pudo enviar la encuesta.'); } },
        error: () => { this.sending = false; this.markFailed(tempId); }
      });
  }

  /** Ack de WhatsApp: nunca retrocede (leído > entregado > enviado). */
  private applyStatus(messageId: number, status: string): void {
    const rank: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3, failed: 9 };
    const idx = this.messages.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const cur = this.messages[idx].status || 'sent';
    if ((rank[cur] ?? 0) >= (rank[status] ?? 0) && status !== 'failed') return;
    const copy = [...this.messages];
    copy[idx] = { ...copy[idx], status: status as any, failed: status === 'failed', _renderKey: Date.now() };
    this.messages = copy;
  }

  // ── Responder citando ─────────────────────────────────────────
  replyTarget: ChatMessage | null = null;
  setReply(m: ChatMessage): void {
    this.replyTarget = m;
    setTimeout(() => this.messageTextarea?.nativeElement.focus(), 0);
  }
  cancelReply(): void { this.replyTarget = null; }
  replyPreview(m: ChatMessage): string {
    if (m.content) return m.content;
    switch (m.message_type) { case 'image': return '📷 Foto'; case 'video': return '🎥 Video'; case 'audio': return '🎤 Nota de voz'; case 'document': return '📄 Documento'; case 'sticker': return 'Sticker'; case 'location': return '📍 Ubicación'; default: return 'Mensaje'; }
  }
  jumpToMessage(id: number): void {
    const el = document.getElementById('msg-' + id);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1600);
  }

  /**
   * Los medios del servicio de WhatsApp Web se guardaron un tiempo con URL http:// sobre la IP del servidor;
   * el panel corre en https y el navegador los bloquea (contenido mixto). nginx los sirve por /storage/wa-media.
   */
  static secureMediaUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.replace(/^http:\/\/181\.48\.150\.43:3001\/uploads\//, 'https://netplay.com.co/storage/wa-media/uploads/');
  }
  private secure(url: string | null | undefined): string | null { return ChatWindowComponent.secureMediaUrl(url); }
  /** Stickers que quedaron guardados como texto con la URL del webp (antes del arreglo) se muestran como sticker. */
  private normalizeLegacy(msg: ChatMessage): ChatMessage {
    if (msg.message_type === 'text' && /^https?:\/\/\S+\/stickers\/\S+\.webp$/i.test((msg.content || '').trim())) {
      return { ...msg, message_type: 'sticker', media_url: this.secure(msg.content!.trim()), content: null };
    }
    return msg;
  }

  /** Convierte el payload del backend (evento o respuesta HTTP) en un mensaje del chat. */
  private toChatMessage(m: any, prev?: ChatMessage): ChatMessage {
    return {
      id:              m.id,
      from:            m.sender_type ?? prev?.from ?? 'agent',
      content:         m.content ?? null,
      message_type:    (m.message_type ?? prev?.message_type ?? (m.media_url ? 'image' : 'text')) as any,
      media_url:       this.secure(m.media_url) ?? prev?.media_url ?? null,
      mime_type:       m.mime_type ?? prev?.mime_type ?? null,
      at:              m.created_at ?? prev?.at ?? new Date().toISOString(),
      agent_signature: m.agent_signature ?? null,
      is_forwarded:    !!m.is_forwarded,
      is_note:         !!m.is_note,
      status:          m.status ?? 'sent',
      quoted:          m.quoted ?? prev?.quoted ?? null,
      reactions:       m.reactions ?? prev?.reactions ?? [],
      poll_votes:      m.poll_votes ?? prev?.poll_votes ?? (m.message_type === 'poll' ? [] : null),
      pending:         false,
      _renderKey:      Date.now()
    };
  }

  /**
   * Inserta o reemplaza un mensaje. Si ya existe con ese id (llegó por HTTP y por Echo) no se duplica;
   * si hay un optimista pendiente del mismo tipo (o mismo texto) lo reemplaza en su lugar.
   */
  private upsertIncoming(m: any, tempId?: number): void {
    if (!m || m.id == null) return;
    if (m.message_type === 'reaction') {
      if (m.quoted_message_id) this.applyReaction(m.quoted_message_id, (m.content || '').trim(), m.sender_type === 'customer' ? 'customer' : 'agent');
      return;
    }
    if (m.sender_type === 'customer' && this.headerData?.provider === 'meta') {
      this.headerData.metaWindowOpen = true;
      this.headerData.metaWindowUntil = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    }
    const byId = this.messages.findIndex(x => x.id === m.id && !x.pending);
    if (byId !== -1) {
      // Ya está: sólo descartar el optimista que quedó colgado (si lo hay)
      if (tempId != null) this.messages = this.messages.filter(x => !(x.pending && x.id === tempId));
      return;
    }
    const isAgent = m.sender_type === 'agent' || m.sender_type === 'system' || tempId != null;
    let pendingIndex = -1;
    if (isAgent) {
      if (tempId != null) pendingIndex = this.messages.findIndex(x => x.pending && x.id === tempId);
      if (pendingIndex === -1) {
        const type = m.message_type ?? 'text';
        pendingIndex = this.messages.findIndex(x => x.pending && x.from === 'agent' && x.message_type === type
          && (type !== 'text' || x.content === m.content));
      }
    }
    const updated = [...this.messages];
    if (pendingIndex !== -1) {
      const prev = updated[pendingIndex];
      this.pendingPayloads.delete(prev.id);
      if (prev.media_url?.startsWith('blob:') && m.media_url) URL.revokeObjectURL(prev.media_url);
      updated[pendingIndex] = this.normalizeLegacy(this.toChatMessage(m, prev));
    } else {
      updated.push(this.normalizeLegacy(this.toChatMessage(m)));
    }
    this.messages = updated;
  }

  /** Quita un optimista que falló al enviarse. */
  private dropPending(tempId: number): void {
    const prev = this.messages.find(x => x.pending && x.id === tempId);
    if (prev?.media_url?.startsWith('blob:')) URL.revokeObjectURL(prev.media_url);
    this.messages = this.messages.filter(x => !(x.pending && x.id === tempId));
  }

  /* ── PREVIEW ────────────────────────────────────────────────── */
  openPreview(e: { url: string; type: 'image' | 'pdf' | 'office' }): void {
    this.previewUrl  = e.url;
    this.previewType = e.type;
    this.previewOpen = true;
  }

  closePreview(): void {
    this.previewOpen = false;
    this.previewUrl  = null;
    this.previewType = null;
  }

  /* ── SCROLL ─────────────────────────────────────────────────── */
  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 0);
  }

  /* ── CLEANUP ────────────────────────────────────────────────── */
  ngOnDestroy(): void {
    if (this.currentConversationId) {
      this.echoService.leave(`conversation.${this.currentConversationId}`);
    }
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    this.revokePreviewUrl();
  }

  private revokePreviewUrl(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
  }

  normalizeStatus(status: string): 'open' | 'in_progress' | 'closed' {
    return status === 'new' ? 'open' : status as any;
  }

  /* ── CARGA MENSAJES ─────────────────────────────────────────── */
  loadMessages(conversationId: number): void {
    this.loading = true;
    this.crmService.getMessages(conversationId).subscribe({
      next: res => {
        const payload = res.data;
        this.messages = (payload?.data ?? []).map((m: any) => ({
          id:             m.id,
          from:           m.sender_type,
          content:        m.content,
          message_type:   m.message_type ?? 'text',
          media_url:      this.secure(m.media_url),
          mime_type:      m.mime_type,
          at:             m.created_at,
          agent_signature: m.agent_signature ?? null,
          is_forwarded:   !!m.is_forwarded,
          is_note:        !!m.is_note,
          status:         m.status ?? 'sent',
          quoted:         m.quoted ?? null,
          reactions:      m.reactions ?? [],
          poll_votes:     m.poll_votes ?? null,
        })).map((x: ChatMessage) => this.normalizeLegacy(x));

        this.headerData = {
          customerName:  payload?.conversation?.customer_name || 'Cliente',
          customerPhone: payload?.conversation?.phone || '',
          status:        this.normalizeStatus(payload?.conversation?.status),
          priority:      payload?.conversation?.priority || 'normal',
          online:        true,
          agentName:     payload?.conversation?.agent_name ?? null,
          provider:      payload?.conversation?.provider ?? 'netplay',
          metaWindowOpen:  payload?.conversation?.meta_window_open ?? null,
          metaWindowUntil: payload?.conversation?.meta_window_until ?? null,
        };
        this.botPaused = !!payload?.conversation?.bot_paused;

        this.loading = false;
        this.searchOpen = false; this.searchTerm = ''; this.searchHits = [];
        this.scrollToBottom();
        this.focusComposer();
      },
      error: () => this.loading = false
    });
  }

  toggleBotPause(): void {
    if (!this.conversationId) return;
    this.crmService.setBotPaused(this.conversationId, !this.botPaused).subscribe({ next: res => this.botPaused = !!res.paused });
  }

  /* ── ATTACH MENU ────────────────────────────────────────────── */
  toggleAttachMenu(): void { this.showAttachMenu = !this.showAttachMenu; }
  closeAttachMenu(): void  { this.showAttachMenu = false; }

  openPicker(type: 'document' | 'media'): void {
    this.showAttachMenu = false;
    if (type === 'document') this.docInput.nativeElement.click();
    if (type === 'media')    this.mediaInput.nativeElement.click();
  }

  /* ── DRAG & DROP ────────────────────────────────────────────── */
  onDragOver(event: DragEvent): void  { event.preventDefault(); this.dragging = true; }
  onDragLeave(event: DragEvent): void { event.preventDefault(); this.dragging = false; }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    if (!event.dataTransfer?.files.length) return;
    this.setFile(event.dataTransfer.files[0]);
  }

  /* ── FILE INPUT ─────────────────────────────────────────────── */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    this.setFile(input.files[0]);
    input.value = '';
  }

  setFile(file: File): void {
    this.fileToSend  = file;
    this.filePreview = file;
    this.revokePreviewUrl();
    this.previewType = this.detectMediaType(file);
    this.previewUrl  = URL.createObjectURL(file);
  }

  clearFile(): void {
    this.mediaCaption = '';
    this.fileToSend  = null;
    this.filePreview = null;
    this.previewType = null;
    this.revokePreviewUrl();
    this.previewUrl  = null;
  }

  detectMediaType(file: File): 'image' | 'video' | 'audio' | 'document' {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    if (file.type.startsWith('audio/')) return 'audio';
    return 'document';
  }

  /* ── ENVÍO ──────────────────────────────────────────────────── */
  sendMessage(value: string): void {
    if (this.fileToSend) { this.sendMedia(); return; }

    const text = (value ?? '').trim();
    if (!text || this.sending || !this.conversationId) return;

    this.sending = true;
    this.draftMessage = '';

    const tempId = Date.now();
    const quoted = this.replyTarget;
    this.replyTarget = null;
    this.pendingPayloads.set(tempId, { kind: 'text', text, quotedId: quoted?.id });
    this.messages.push({
      id: tempId, from: 'agent', content: text,
      message_type: 'text', media_url: null,
      quoted: quoted ? { id: quoted.id, sender_type: quoted.from, content: quoted.content, message_type: quoted.message_type, media_url: quoted.media_url } : null,
      at: new Date().toISOString(), pending: true
    });
    this.scrollToBottom();

    this.focusComposer(0);
    this.crmService.sendMessage(this.conversationId, { message: text, type: 'text', quoted_message_id: quoted?.id })
      .subscribe({
        next:  () => { this.sending = false; this.focusComposer(0); }, // el mensaje real llega por Echo y reemplaza al optimista
        error: () => { this.sending = false; this.markFailed(tempId); }
      });
  }

  async sendMedia(): Promise<void> {
    if (!this.fileToSend || !this.conversationId || this.sending) return;

    const type = this.detectMediaType(this.fileToSend);
    const file = type === 'image' ? await this.compressImage(this.fileToSend) : this.fileToSend;

    const caption = (type === 'image' || type === 'video') ? this.mediaCaption.trim() : '';
    const tempId = Date.now();
    this.pendingPayloads.set(tempId, { kind: 'media', file, type, caption });
    this.messages.push({
      id: tempId, from: 'agent', content: type === 'document' ? file.name : (caption || null),
      message_type: type, media_url: type === 'document' ? null : URL.createObjectURL(file),
      mime_type: file.type || null,
      at: new Date().toISOString(), pending: true
    });
    this.scrollToBottom();
    this.sending = true;
    this.clearFile();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    if (caption) formData.append('caption', caption);
    this.mediaCaption = '';

    this.crmService.sendMedia(this.conversationId, formData)
      .subscribe({
        next:  (res: any) => { this.sending = false; this.pendingPayloads.delete(tempId); this.upsertIncoming(res?.data, tempId); this.scrollToBottom(); this.focusComposer(0); },
        error: () => { this.sending = false; this.markFailed(tempId); }
      });
  }

  /* ── STICKERS ───────────────────────────────────────────────── */
  loadStickers(): void {
    this.crmService.getStickers().subscribe({ next: res => this.stickers = res.data ?? [] });
  }

  toggleStickerPicker(): void {
    this.showStickerPicker = !this.showStickerPicker;
    this.showAttachMenu    = false;
  }

  sendSticker(sticker: any): void {
    if (!this.conversationId || this.sending) return;

    this.showStickerPicker = false;
    this.sending = true;

    const tempId = Date.now();
    this.pendingPayloads.set(tempId, { kind: 'sticker', sticker });
    this.messages.push({
      id: tempId, from: 'agent', content: null,
      message_type: 'sticker', media_url: sticker.media_url,
      at: new Date().toISOString(), pending: true
    });
    this.scrollToBottom();

    // Enviar como imagen al backend (WhatsApp acepta stickers como imagen webp)
    const formData = new FormData();
    formData.append('sticker_url', sticker.media_url);
    formData.append('type', 'sticker');

    this.crmService.sendMessage(this.conversationId, {
      message: sticker.media_url,
      type: 'sticker'
    }).subscribe({
      next:  () => this.sending = false,
      error: () => { this.sending = false; this.markFailed(tempId); }
    });
  }

  saveStickerFromMessage(mediaUrl: string): void {
    if (!mediaUrl) return;
    this.crmService.saveSticker(mediaUrl, 'Sticker guardado').subscribe({
      next: res => {
        this.stickers.push(res.data);
        alert('✅ Sticker guardado en tu colección');
      }
    });
  }

  /* ── REENVIAR ───────────────────────────────────────────────── */
  onForwardMessage(msg: ChatMessage): void {
    this.forwardingMessage = msg;
    this.forwardTargets    = [];
    // Cargar conversaciones disponibles
    this.crmService.getInbox({ status: 'in_progress' }).subscribe({
      next: res => this.allConversations = (res.data ?? []).filter((c: any) => c.id !== this.conversationId)
    });
  }

  toggleForwardTarget(id: number): void {
    const idx = this.forwardTargets.indexOf(id);
    if (idx === -1) this.forwardTargets.push(id);
    else this.forwardTargets.splice(idx, 1);
  }

  submitForward(): void {
    if (!this.forwardingMessage || !this.forwardTargets.length) return;

    this.crmService.forwardMessage(this.forwardingMessage.id, this.forwardTargets)
      .subscribe(() => {
        this.forwardingMessage = null;
        this.forwardTargets    = [];
      });
  }

  /* ── AUDIO ──────────────────────────────────────────────────── */
  async startRecording(): Promise<void> {
    if (this.isRecording || this.sending) return;
    this.clearFile();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const stream = this.mediaStream;
      this.audioChunks = [];

      const formats = [
        { mime: 'audio/ogg; codecs=opus', ext: 'ogg' },
        { mime: 'audio/ogg', ext: 'ogg' },
        { mime: 'audio/webm; codecs=opus', ext: 'webm' },
        { mime: 'audio/webm', ext: 'webm' },
        { mime: 'audio/mp4', ext: 'm4a' },
      ];

      const supported = formats.filter(f => MediaRecorder.isTypeSupported(f.mime));
      let selectedFormat = supported[0] ?? { mime: '', ext: 'webm' };

      this.mediaRecorder = selectedFormat.mime
        ? new MediaRecorder(stream, { mimeType: selectedFormat.mime, audioBitsPerSecond: 128000 })
        : new MediaRecorder(stream);

      selectedFormat = {
        mime: this.mediaRecorder.mimeType || 'audio/webm',
        ext:  this.mediaRecorder.mimeType?.includes('ogg') ? 'ogg' : 'webm'
      };

      this.mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        this.zone.run(() => {
          clearInterval(this.recordTimer);
          const blob = new Blob(this.audioChunks, { type: selectedFormat.mime });
          this.recordedAudioFile = new File([blob], `voice_${Date.now()}.${selectedFormat.ext}`, { type: selectedFormat.mime });
          this.audioPreviewUrl   = URL.createObjectURL(blob);
          this.isRecording       = false;
          this.isProcessingAudio = false;
          this.mediaStream?.getTracks().forEach(t => t.stop());
          this.mediaStream = null;
          if (this.sendAfterStop) { this.sendAfterStop = false; this.sendRecordedAudio(); }
        });
      };

      this.mediaRecorder.start();
      this.isRecording    = true;
      this.recordSeconds  = 0;
      this.recordTimer    = setInterval(() => {
        this.zone.run(() => {
          this.recordSeconds++;
          if (this.recordSeconds >= 300) this.stopRecording();
        });
      }, 1000);

    } catch (error: any) {
      this.zone.run(() => {
        alert(error.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado.'
          : 'No se pudo acceder al micrófono.');
        this.mediaStream?.getTracks().forEach(t => t.stop());
        this.mediaStream = null;
      });
    }
  }

  stopRecording(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;
    this.isProcessingAudio = true;
    this.mediaRecorder.stop();
  }

  async sendRecordedAudio(): Promise<void> {
    if (!this.conversationId || !this.recordedAudioFile || this.sending) return;

    const file = this.recordedAudioFile;
    this.sending = true;

    // El compositor vuelve a su estado normal de inmediato; la nota queda como burbuja pendiente.
    const localUrl = URL.createObjectURL(file);
    this.cancelAudio();

    const tempId = Date.now();
    this.pendingPayloads.set(tempId, { kind: 'audio', file });
    this.messages.push({
      id: tempId, from: 'agent', content: null,
      message_type: 'audio', media_url: localUrl, mime_type: file.type || null,
      at: new Date().toISOString(), pending: true
    });
    this.scrollToBottom();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', 'audio');

    this.crmService.sendMedia(this.conversationId, formData).subscribe({
      next:  (res: any) => { this.sending = false; this.pendingPayloads.delete(tempId); this.upsertIncoming(res?.data, tempId); this.scrollToBottom(); },
      error: () => { this.sending = false; this.markFailed(tempId); }
    });
  }

  cancelAudio(): void {
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    this.zone.run(() => this.resetAudioState());
  }

  private resetAudioState(): void {
    if (this.audioPreviewUrl) URL.revokeObjectURL(this.audioPreviewUrl);
    this.audioPreviewUrl   = null;
    this.recordedAudioFile = null;
    this.audioChunks       = [];
    this.recordSeconds     = 0;
    this.isRecording       = false;
  }

  /* ── AUTO RESIZE TEXTAREA ───────────────────────────────────── */
  autoResize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  handleKeydown(event: KeyboardEvent): void {
    if (this.showSlashPicker) {
      if (event.key === 'ArrowDown') { event.preventDefault(); this.slashIndex = (this.slashIndex + 1) % Math.max(1, this.slashMatches.length); return; }
      if (event.key === 'ArrowUp')   { event.preventDefault(); this.slashIndex = (this.slashIndex - 1 + Math.max(1, this.slashMatches.length)) % Math.max(1, this.slashMatches.length); return; }
      if (event.key === 'Escape')    { event.preventDefault(); this.showSlashPicker = false; return; }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        const r = this.slashMatches[this.slashIndex];
        if (r) { event.preventDefault(); this.applyQuickReply(r); return; }
        if (event.key === 'Tab') return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage(this.draftMessage);
    }
  }

  /* ── RESPUESTAS RÁPIDAS ─────────────────────────────────────── */
  loadQuickReplies(): void {
    this.crmService.getQuickReplies().subscribe({ next: res => this.quickReplies = res.data ?? [], error: () => {} });
  }

  filterQuick(q: string): QuickReply[] {
    const term = (q || '').trim().toLowerCase().replace(/^\//, '');
    if (!term) return this.quickReplies;
    return this.quickReplies.filter(r => r.shortcut.includes(term) || (r.title || '').toLowerCase().includes(term) || r.content.toLowerCase().includes(term));
  }

  /** Muestra el selector cuando el borrador empieza con "/" (como en WhatsApp Business). */
  onDraftInput(): void {
    const m = this.draftMessage.match(/^\/(\S*)$/);
    if (!m) { this.showSlashPicker = false; return; }
    const term = m[1].toLowerCase();
    const starts = this.quickReplies.filter(r => r.shortcut.startsWith(term));
    const rest   = this.quickReplies.filter(r => !r.shortcut.startsWith(term) && (r.shortcut.includes(term) || (r.title || '').toLowerCase().includes(term)));
    this.slashMatches = [...starts, ...rest].slice(0, 8);
    this.slashIndex = 0;
    this.showSlashPicker = true;
  }

  toggleQuickPanel(): void {
    this.showQuickPanel = !this.showQuickPanel;
    this.showAttachMenu = false; this.showStickerPicker = false;
    if (this.showQuickPanel) this.quickPanelQuery = '';
  }

  applyQuickReply(r: QuickReply): void {
    this.draftMessage = this.fillVariables(r.content);
    this.showSlashPicker = false;
    this.showQuickPanel = false;
    setTimeout(() => {
      const ta = this.messageTextarea?.nativeElement;
      if (!ta) return;
      this.autoResize(ta);
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 0);
  }

  openQuickManager(): void {
    this.showQuickPanel = false; this.showSlashPicker = false;
    this.resetQuickForm();
    this.showQuickManager = true;
  }

  resetQuickForm(): void { this.quickForm = { id: null, shortcut: '', title: '', content: '' }; this.quickError = ''; }

  editQuickReply(r: QuickReply): void {
    this.quickForm = { id: r.id, shortcut: r.shortcut, title: r.title || '', content: r.content };
    this.quickError = '';
  }

  saveQuickReply(): void {
    const shortcut = this.quickForm.shortcut.trim().toLowerCase().replace(/^\//, '');
    if (!/^[a-z0-9_-]+$/.test(shortcut)) { this.quickError = 'El atajo sólo admite letras, números, guion y guion bajo.'; return; }
    if (!this.quickForm.content.trim()) { this.quickError = 'Escribí el mensaje.'; return; }
    this.quickSaving = true; this.quickError = '';
    this.crmService.saveQuickReply({ id: this.quickForm.id, shortcut, title: this.quickForm.title.trim() || null, content: this.quickForm.content.trim() }).subscribe({
      next: res => {
        const saved: QuickReply = res.data;
        const idx = this.quickReplies.findIndex(x => x.id === saved.id);
        if (idx === -1) this.quickReplies = [...this.quickReplies, saved].sort((a, b) => a.shortcut.localeCompare(b.shortcut));
        else { const copy = [...this.quickReplies]; copy[idx] = saved; this.quickReplies = copy; }
        this.quickSaving = false;
        this.resetQuickForm();
      },
      error: err => { this.quickSaving = false; this.quickError = err?.error?.error || err?.error?.message || 'No se pudo guardar la respuesta.'; }
    });
  }

  deleteQuickReply(r: QuickReply): void {
    if (!confirm(`¿Eliminar la respuesta /${r.shortcut}?`)) return;
    this.crmService.deleteQuickReply(r.id).subscribe({
      next: () => { this.quickReplies = this.quickReplies.filter(x => x.id !== r.id); if (this.quickForm.id === r.id) this.resetQuickForm(); },
      error: () => alert('No se pudo eliminar la respuesta.')
    });
  }

  /* ── CERRAR CONVERSACIÓN ────────────────────────────────────── */
  finishConversation(): void {
    if (!this.conversationId) return;
    if (!confirm('¿Finalizar conversación?')) return;

    this.crmService.closeConversation(this.conversationId).subscribe(() => {
      this.messages = [];
      this.conversationClosed.emit();
    });
  }

  /* ── INFO PANEL ─────────────────────────────────────────────── */
  toggleInfoPanel(): void { this.showInfoPanel = !this.showInfoPanel; }

  onPriorityChanged(p: 'low' | 'normal' | 'high'): void {
    if (this.headerData) this.headerData.priority = p;
  }
}
