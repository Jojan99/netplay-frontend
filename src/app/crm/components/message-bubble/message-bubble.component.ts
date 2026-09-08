import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Output,
  EventEmitter,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export interface ChatMessage {
  id: number;
  from: 'customer' | 'agent' | 'system';
  content: string | null;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'reaction' | 'poll' | 'event';
  media_url?: string | null;
  mime_type?: string | null;
  at: string;
  pending?: boolean;
  failed?: boolean;
  status?: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | null;
  quoted?: { id: number; sender_type: string; content: string | null; message_type: string; media_url?: string | null } | null;
  reactions?: { emoji: string; from: string }[];
  poll_votes?: { voter_key: string; voter_type: string; voter_name?: string | null; options: string[] }[] | null;
  is_forwarded?: boolean;
  agent_signature?: string | null;
  is_note?: boolean;
  _renderKey?: number;
}

@Component({
  selector: 'app-message-bubble',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './message-bubble.component.html',
  styleUrl: './message-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessageBubbleComponent implements OnChanges {

  @Input() message!: ChatMessage;

  @Output() openPreview  = new EventEmitter<{ url: string; type: 'pdf' | 'office' | 'image' }>();
  @Output() forwardMsg   = new EventEmitter<ChatMessage>();
  @Output() saveSticker  = new EventEmitter<string>();
  @Output() retry        = new EventEmitter<ChatMessage>();
  @Output() replyTo      = new EventEmitter<ChatMessage>();
  @Output() jumpTo       = new EventEmitter<number>();

  /** Clase de las palomitas según el ack: reloj (pendiente), 1 gris, 2 grises, 2 azules. */
  get tickClass(): string {
    if (this.message?.pending || this.message?.status === 'pending') return 'is-pending';
    const st = this.message?.status;
    if (st === 'read') return 'is-read';
    if (st === 'delivered') return 'is-delivered';
    return 'is-sent';
  }
  quotedLabel(q: NonNullable<ChatMessage['quoted']>): string {
    if (q.content) return q.content;
    switch (q.message_type) { case 'image': return '📷 Foto'; case 'video': return '🎥 Video'; case 'audio': return '🎤 Nota de voz'; case 'document': return '📄 Documento'; case 'sticker': return 'Sticker'; case 'location': return '📍 Ubicación'; default: return 'Mensaje'; }
  }
  reply(): void { this.replyTo.emit(this.message); this.showContextMenu = false; }
  /** Doble clic sobre la burbuja = responder (como WhatsApp Web). No aplica sobre controles ni selección de texto. */
  onDblClick(ev: MouseEvent): void {
    const t = ev.target as HTMLElement;
    if (this.isNote || this.message.pending || t.closest('button, a, input, audio, video')) return;
    window.getSelection()?.removeAllRanges();
    this.reply();
  }
  @Input() highlight = '';

  showContextMenu = false;

  /* ── Reproductor de audio propio (estilo WhatsApp) ────────── */
  audioPlaying  = false;
  audioDuration = 0;
  audioCurrent  = 0;
  audioSpeed: 1 | 1.5 | 2 = 1;
  get audioProgress(): number { return this.audioDuration ? Math.min(100, (this.audioCurrent / this.audioDuration) * 100) : 0; }
  get isOut(): boolean { return this.message?.from === 'agent' || this.message?.from === 'system'; }
  markDirty(): void { this.cdr.markForCheck(); }
  onAudioMeta(a: HTMLAudioElement): void { this.audioDuration = isFinite(a.duration) ? a.duration : 0; this.cdr.markForCheck(); }
  onAudioTime(a: HTMLAudioElement): void { this.audioCurrent = a.currentTime; if (!this.audioDuration && isFinite(a.duration)) this.audioDuration = a.duration; this.cdr.markForCheck(); }
  onAudioEnded(): void { this.audioPlaying = false; this.audioCurrent = 0; this.cdr.markForCheck(); }
  toggleAudio(a: HTMLAudioElement): void {
    if (a.paused) { document.querySelectorAll('audio').forEach(x => { if (x !== a) x.pause(); }); a.playbackRate = this.audioSpeed; a.play().catch(() => {}); }
    else a.pause();
  }
  seekAudio(a: HTMLAudioElement, ev: Event): void { const v = parseFloat((ev.target as HTMLInputElement).value); a.currentTime = v; this.audioCurrent = v; }
  cycleSpeed(a: HTMLAudioElement): void { this.audioSpeed = this.audioSpeed === 1 ? 1.5 : this.audioSpeed === 1.5 ? 2 : 1; a.playbackRate = this.audioSpeed; this.cdr.markForCheck(); }
  fmt(secs: number): string { if (!secs || !isFinite(secs)) return '0:00'; const m = Math.floor(secs / 60), r = Math.floor(secs % 60); return `${m}:${r < 10 ? '0' : ''}${r}`; }

  /** Safari/iOS no reproduce OGG/Opus: se pide la versión M4A que el backend genera y cachea. */
  private static canPlayOgg: boolean | null = null;
  get audioSrc(): string | null {
    const url = this.message?.media_url; if (!url) return null;
    if (url.startsWith('blob:') || !/\.(ogg|opus)(\?|$)/i.test(url)) return url;
    if (MessageBubbleComponent.canPlayOgg === null) {
      try { MessageBubbleComponent.canPlayOgg = !!document.createElement('audio').canPlayType('audio/ogg; codecs=opus'); } catch { MessageBubbleComponent.canPlayOgg = true; }
    }
    if (MessageBubbleComponent.canPlayOgg) return url;
    const base = url.match(/^https?:\/\/[^/]+/)?.[0] || '';
    return `${base}/api/management/crm/media/m4a?u=${encodeURIComponent(url)}`;
  }

  /* ── Documentos ──────────────────────────────────────────────── */
  get docName(): string {
    const c = (this.message?.content || '').trim();
    if (c && !c.startsWith('http')) return c;
    const path = (this.message?.media_url || '').split('?')[0];
    return decodeURIComponent(path.substring(path.lastIndexOf('/') + 1)) || 'Documento';
  }
  get ext(): string { const m = (this.message?.media_url || '').split('?')[0].match(/\.([a-z0-9]{2,5})$/i); return (m ? m[1] : 'FILE').toUpperCase(); }
  openLink(): void { if (this.message?.media_url) window.open(this.message.media_url, '_blank', 'noopener'); this.showContextMenu = false; }
  contextX = 0;
  contextY = 0;

  constructor(
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['message']) {
      this.cdr.markForCheck();
    }
  }

  /* ── Tipo de mensaje ─────────────────────────────────────────── */
  get isImage()    { return this.message?.message_type === 'image'; }
  get isVideo()    { return this.message?.message_type === 'video'; }
  get isAudio()    { return this.message?.message_type === 'audio'; }
  get isDocument() { return this.message?.message_type === 'document'; }
  get isSticker()  { return this.message?.message_type === 'sticker'; }
  get isLocation() { return this.message?.message_type === 'location'; }
  get isContact()  { return this.message?.message_type === 'contact'; }
  get isReaction() { return this.message?.message_type === 'reaction'; }
  get isNote()     { return this.message?.is_note; }

  /* ── Documentos ──────────────────────────────────────────────── */
  get isPdf(): boolean {
    if (!this.isDocument) return false;
    return this.message?.mime_type === 'application/pdf'
      || !!this.message?.media_url?.toLowerCase().endsWith('.pdf');
  }

  get isOffice(): boolean {
    if (!this.isDocument) return false;
    return !!this.message?.mime_type?.startsWith('application/vnd.openxmlformats')
      || this.message?.mime_type === 'application/msword'
      || !!this.message?.media_url?.toLowerCase().match(/\.(docx?|xlsx?|pptx?)$/);
  }

  get isArchive(): boolean {
    if (!this.isDocument) return false;
    return !!this.message?.mime_type?.match(/zip|rar|octet-stream/)
      || !!this.message?.media_url?.toLowerCase().match(/\.(zip|rar|7z|tar|gz|bin)$/);
  }

  /* ── URLs seguras ────────────────────────────────────────────── */
  get safePdfUrl(): SafeResourceUrl | null {
    if (!this.message?.media_url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.toEmbeddableUrl(this.message.media_url));
  }

  /** El backend de medios sirve por http; embeberlo en un iframe HTTPS lo bloquea (mixed content). */
  private toEmbeddableUrl(url: string): string {
    return url.startsWith('http://')
      ? 'https://docs.google.com/gview?embedded=true&url=' + encodeURIComponent(url)
      : url;
  }

  get safeOfficeUrl(): SafeResourceUrl | null {
    if (!this.message?.media_url) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(this.message.media_url)
    );
  }

  /* ── Localización ────────────────────────────────────────────── */
  @Output() startChat = new EventEmitter<{ phone: string; name: string }>();

  get locationCoords(): { lat: string; lng: string } | null {
    if (!this.isLocation || !this.message.content) return null;
    const m = this.message.content.match(/lat ([0-9.-]+), lng ([0-9.-]+)/);
    if (!m) return null;
    return { lat: m[1], lng: m[2] };
  }
  /** Nombre/dirección que acompaña a la ubicación (segunda línea del contenido). */
  get locationLabel(): string { return (this.message?.content || '').split('\n').slice(1).join(' · '); }
  get mapsUrl(): string {
    const c = this.locationCoords;
    if (!c) return '#';
    return `https://www.google.com/maps?q=${c.lat},${c.lng}`;
  }
  /** Mapa embebido de OpenStreetMap (no requiere clave de API). */
  private _mapUrl: SafeResourceUrl | null = null; private _mapKey = '';
  get mapEmbedUrl(): SafeResourceUrl | null {
    const c = this.locationCoords; if (!c) return null;
    const key = c.lat + ',' + c.lng;
    if (this._mapKey !== key) {
      const lat = parseFloat(c.lat), lng = parseFloat(c.lng), d = 0.004;
      const bbox = `${lng - d * 1.6},${lat - d},${lng + d * 1.6},${lat + d}`;
      this._mapUrl = this.sanitizer.bypassSecurityTrustResourceUrl(`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat},${lng}`);
      this._mapKey = key;
    }
    return this._mapUrl;
  }

  /* ── Contacto(s) ─────────────────────────────────────────────── */
  /** Formato guardado: "👤 Contacto: Nombre\n+57300…\nOtro nombre +57301…" → lista de contactos. */
  get contacts(): { name: string; phone: string | null }[] {
    const lines = (this.message?.content || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return [{ name: 'Contacto', phone: null }];
    const phoneRe = /\+?\d[\d\s-]{6,}\d/;
    const first = { name: lines[0].replace('👤 Contacto: ', '').trim() || 'Contacto', phone: null as string | null };
    const out = [first];
    for (const l of lines.slice(1)) {
      const m = l.match(phoneRe);
      const phone = m ? m[0].replace(/[\s-]/g, '') : null;
      const name = l.replace(phoneRe, '').trim();
      if (!name && phone && !first.phone) { first.phone = phone; continue; }   // segunda línea: teléfono del primero
      out.push({ name: name || phone || 'Contacto', phone });
    }
    return out;
  }
  get contactName(): string { return this.contacts[0]?.name || 'Contacto'; }
  get contactPhone(): string | null { return this.contacts[0]?.phone || null; }
  contactQuery(phone: string | null): string { return (phone || '').replace(/^\+?57/, ''); }

  /* ── Reacciones ──────────────────────────────────────────────── */
  @Output() react = new EventEmitter<{ message: ChatMessage; emoji: string }>();
  @Output() moreEmoji = new EventEmitter<ChatMessage>();
  readonly quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
  showReactBar = false;
  get myReaction(): string | null { return (this.message?.reactions || []).find(r => r.from !== 'customer')?.emoji || null; }
  get reactionSummary(): { emoji: string; count: number; mine: boolean }[] {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const r of this.message?.reactions || []) {
      const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      cur.count++; if (r.from !== 'customer') cur.mine = true; map.set(r.emoji, cur);
    }
    return [...map.values()];
  }
  openReactBar(ev: Event): void { ev.stopPropagation(); this.showContextMenu = false; this.showReactBar = true; this.cdr.markForCheck(); }
  sendReaction(emoji: string): void {
    const same = this.myReaction === emoji;
    this.react.emit({ message: this.message, emoji: same ? '' : emoji });
    this.showReactBar = false; this.showContextMenu = false; this.cdr.markForCheck();
  }

  /* ── Encuesta / evento ───────────────────────────────────────── */
  get pollQuestion(): string { return ((this.message?.content || '').split('\n')[0] || '').replace('📊 Encuesta: ', ''); }
  get pollMulti(): boolean { return /\(varias opciones\)\s*$/.test(this.message?.content || ''); }
  get pollOptions(): string[] { return (this.message?.content || '').split('\n').slice(1).filter(l => l.startsWith('• ')).map(l => l.replace(/^• /, '')).filter(Boolean); }
  @Input() canVote = false;   // sólo WhatsApp Web (Meta no soporta encuestas)
  @Output() vote = new EventEmitter<{ message: ChatMessage; options: string[] }>();
  get myVote(): string[] { return (this.message?.poll_votes || []).find(v => v.voter_type === 'agent')?.options || []; }
  pollVoters(opt: string): string[] {
    return (this.message?.poll_votes || []).filter(v => (v.options || []).includes(opt)).map(v => v.voter_type === 'agent' ? 'Vos' : (v.voter_name || v.voter_key.split('@')[0] || 'Cliente'));
  }
  pollCount(opt: string): number { return this.pollVoters(opt).length; }
  get pollTotal(): number { return (this.message?.poll_votes || []).filter(v => (v.options || []).length).length; }
  toggleVote(opt: string): void {
    if (!this.canVote || this.message.pending) return;
    const mine = this.myVote;
    let next: string[];
    if (this.pollMulti) next = mine.includes(opt) ? mine.filter(o => o !== opt) : [...mine, opt];
    else next = mine.includes(opt) ? [] : [opt];
    this.vote.emit({ message: this.message, options: next });
  }
  get eventTitle(): string { return ((this.message?.content || '').split('\n')[0] || '').replace('📅 Evento: ', ''); }
  get eventLines(): string[] { return (this.message?.content || '').split('\n').slice(1).filter(Boolean); }
  isLink(t: string): boolean { return /^🔗 https?:\/\//.test(t); }

  /* ── Acciones ────────────────────────────────────────────────── */
  openPdf()    { if (this.message?.media_url) this.openPreview.emit({ url: this.message.media_url, type: 'pdf' }); }
  openOffice() { if (this.message?.media_url) this.openPreview.emit({ url: this.message.media_url, type: 'office' }); }
  openImage()  { if (this.message?.media_url) this.openPreview.emit({ url: this.message.media_url, type: 'image' }); }

  toggleVideo(v: HTMLVideoElement)     { v.paused ? v.play() : v.pause(); }
  openFullscreen(v: HTMLVideoElement)  { document.querySelectorAll('video').forEach(x => { if (x !== v) x.pause(); }); v.requestFullscreen?.(); v.play(); }
  onVideoEnded(v: HTMLVideoElement)    { v.currentTime = 0; }
  onImageError(e: Event)               { (e.target as HTMLImageElement).style.display = 'none'; }

  /* ── Menú contextual (reenviar, copiar) ──────────────────────── */
  onRightClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    // Cerrar cualquier otro menú abierto antes de mostrar éste
    document.dispatchEvent(new CustomEvent('wa-ctx-open'));
    // Mantener el menú dentro de la ventana
    this.contextX = Math.min(event.clientX, window.innerWidth - 200);
    this.contextY = Math.min(event.clientY, window.innerHeight - 150);
    this.showContextMenu = true;
    this.cdr.markForCheck();
  }

  @HostListener('document:wa-ctx-open')
  @HostListener('document:keydown.escape')
  @HostListener('document:click')
  closeContextMenu(): void {
    if (this.showContextMenu || this.showReactBar) {
      this.showContextMenu = false;
      this.showReactBar = false;
      this.cdr.markForCheck();
    }
  }

  copyText(): void {
    if (this.message.content) {
      navigator.clipboard.writeText(this.message.content).catch(() => {});
    }
    this.showContextMenu = false;
  }

  forward(): void {
    this.forwardMsg.emit(this.message);
    this.showContextMenu = false;
  }
}
