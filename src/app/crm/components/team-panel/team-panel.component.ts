import { Component, OnInit, OnDestroy, NgZone, Inject, PLATFORM_ID, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService } from '../../../services/team.service';
import { EchoService } from '../../../services/echo.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

interface Member { id: number; name: string; profile?: string; unread: number; online?: boolean; }
interface TeamMsg { id: number; from_user_id: number; to_user_id: number | null; from_name: string; content: string; created_at: string; mine: boolean; }
type CallState = 'idle' | 'ringing-out' | 'ringing-in' | 'connecting' | 'active';

/**
 * Equipo: quién está en línea (canal de presencia por empresa), chat interno
 * (directo o general) y llamadas de voz entre agentes (WebRTC, señalización por el backend).
 */
@Component({
  selector: 'app-team-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './team-panel.component.html',
  styleUrl: './team-panel.component.scss',
  host: { class: 'np-console' },
})
export class TeamPanelComponent implements OnInit, OnDestroy {
  @ViewChild('thread') thread?: ElementRef<HTMLElement>;
  @ViewChild('remoteAudio') remoteAudio?: ElementRef<HTMLAudioElement>;

  open = false;
  me: Member | null = null;
  members: Member[] = [];
  generalUnread = 0;
  online = new Set<number>();
  active: 'general' | number | null = null;   // hilo abierto
  messages: TeamMsg[] = [];
  draft = '';
  loadingThread = false;
  presenceReady = false;

  // ── Llamada ──
  call: { state: CallState; peer: Member | null; id: string; since: number; muted: boolean; incomingOffer?: any } = { state: 'idle', peer: null, id: '', since: 0, muted: false };
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private ringTimer: any = null;
  private tickTimer: any = null;
  callSeconds = 0;
  private ringCtx: AudioContext | null = null; private ringOsc: any = null;

  private myId = 0; private companyId = 0;
  private channels: any[] = [];

  constructor(private team: TeamService, private echo: EchoService, private auth: AuthService, private zone: NgZone, private toast: ToastService, @Inject(PLATFORM_ID) private platformId: Object) {}

  get totalUnread(): number { return this.members.reduce((a, m) => a + (m.unread || 0), 0) + this.generalUnread; }
  get onlineCount(): number { return this.members.filter(m => this.online.has(m.id)).length; }
  get activeMember(): Member | null { return typeof this.active === 'number' ? this.members.find(m => m.id === this.active) || null : null; }
  get sortedMembers(): Member[] { return [...this.members].sort((a, b) => Number(this.online.has(b.id)) - Number(this.online.has(a.id)) || (b.unread - a.unread) || a.name.localeCompare(b.name)); }
  initials(n: string): string { return (n || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
  fmtTime(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); }
  fmtSecs(s: number): string { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.myId = this.auth.getUser()?.userId || 0;
    this.companyId = this.auth.getCompanyId();
    if (!this.myId || !this.companyId) return;
    this.loadMembers();
    this.connect();
  }

  ngOnDestroy(): void { this.hangup(false); this.echo.leave(`company.${this.companyId}`); this.echo.leave(`user.${this.myId}`); }

  loadMembers(): void {
    this.team.members().subscribe({ next: r => { this.me = r.data?.me || null; this.members = r.data?.members || []; this.generalUnread = r.data?.general_unread || 0; }, error: () => {} });
  }

  /* ── Tiempo real ─────────────────────────────────────────────── */
  private connect(attempt = 0): void {
    const echo = this.echo.instance;
    if (!echo) { if (attempt < 20) setTimeout(() => this.connect(attempt + 1), 500); return; }
    echo.join(`company.${this.companyId}`)
      .here((users: any[]) => this.zone.run(() => { this.online = new Set(users.map(u => Number(u.id))); this.presenceReady = true; }))
      .joining((u: any) => this.zone.run(() => { this.online = new Set([...this.online, Number(u.id)]); }))
      .leaving((u: any) => this.zone.run(() => { const s = new Set(this.online); s.delete(Number(u.id)); this.online = s; }))
      .listen('.team.message', (e: any) => this.zone.run(() => this.onMessage(e.message)));
    echo.private(`user.${this.myId}`)
      .listen('.team.message', (e: any) => this.zone.run(() => this.onMessage(e.message)))
      .listen('.team.call', (e: any) => this.zone.run(() => this.onSignal(e)));
  }

  private onMessage(m: any): void {
    if (!m) return;
    const isGeneral = m.to_user_id == null;
    const other = m.from_user_id === this.myId ? m.to_user_id : m.from_user_id;
    const inThread = isGeneral ? this.active === 'general' : this.active === other;
    if (inThread) {
      if (!this.messages.some(x => x.id === m.id)) this.messages = [...this.messages, { ...m, mine: m.from_user_id === this.myId }];
      this.scrollThread();
      if (this.open && m.from_user_id !== this.myId) this.team.read(isGeneral ? 'general' : other).subscribe({ error: () => {} });
    } else if (m.from_user_id !== this.myId) {
      if (isGeneral) this.generalUnread++;
      else this.members = this.members.map(x => x.id === m.from_user_id ? { ...x, unread: (x.unread || 0) + 1 } : x);
      this.pop(660);
      this.toast.info(`${m.from_name}: ${String(m.content).slice(0, 80)}`);
    }
  }

  /* ── Hilos ───────────────────────────────────────────────────── */
  toggle(): void { this.open = !this.open; if (this.open && this.active) this.markRead(); }
  openThread(which: 'general' | number): void {
    this.active = which; this.messages = []; this.loadingThread = true;
    this.team.messages(which).subscribe({ next: r => { this.messages = r.data || []; this.loadingThread = false; this.scrollThread(); this.markRead(); }, error: () => this.loadingThread = false });
  }
  private markRead(): void {
    if (this.active === 'general') { this.generalUnread = 0; this.team.read('general').subscribe({ error: () => {} }); }
    else if (typeof this.active === 'number') { const id = this.active; this.members = this.members.map(x => x.id === id ? { ...x, unread: 0 } : x); this.team.read(id).subscribe({ error: () => {} }); }
  }
  backToList(): void { this.active = null; this.messages = []; }
  send(): void {
    const text = this.draft.trim(); if (!text || this.active === null) return;
    this.draft = '';
    this.team.send(this.active === 'general' ? null : this.active, text).subscribe({
      next: r => { const m = r.data; if (m && !this.messages.some(x => x.id === m.id)) { this.messages = [...this.messages, { ...m, mine: true }]; this.scrollThread(); } },
      error: () => this.toast.error('No se pudo enviar el mensaje.')
    });
  }
  onKey(ev: KeyboardEvent): void { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); this.send(); } }
  private scrollThread(): void { setTimeout(() => { const el = this.thread?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 0); }
  showDay(i: number): boolean { if (i === 0) return true; return new Date(this.messages[i - 1].created_at).toDateString() !== new Date(this.messages[i].created_at).toDateString(); }
  dayLabel(iso: string): string { const d = new Date(iso), now = new Date(); if (d.toDateString() === now.toDateString()) return 'Hoy'; const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Ayer'; return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }); }

  /* ── Llamadas (WebRTC de audio) ──────────────────────────────── */
  private async getMic(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  }
  private newPeer(peerId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] });
    pc.onicecandidate = e => { if (e.candidate) this.team.signal(peerId, 'ice', e.candidate.toJSON(), this.call.id).subscribe({ error: () => {} }); };
    pc.ontrack = e => { const a = this.remoteAudio?.nativeElement; if (a) { a.srcObject = e.streams[0]; a.play().catch(() => {}); } };
    pc.onconnectionstatechange = () => this.zone.run(() => {
      if (pc.connectionState === 'connected') this.setActive();
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') { this.toast.warning('Se perdió la conexión de la llamada.'); this.hangup(false); }
    });
    return pc;
  }
  private setActive(): void {
    if (this.call.state === 'active') return;
    this.call = { ...this.call, state: 'active', since: Date.now() }; this.stopRing();
    this.callSeconds = 0; clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => this.zone.run(() => this.callSeconds = Math.floor((Date.now() - this.call.since) / 1000)), 1000);
  }

  async callMember(m: Member): Promise<void> {
    if (this.call.state !== 'idle') return;
    if (!this.online.has(m.id)) { this.toast.warning(`${m.name} no está en línea.`); return; }
    try { this.localStream = await this.getMic(); } catch { this.toast.error('No se pudo acceder al micrófono.'); return; }
    this.call = { state: 'ringing-out', peer: m, id: `${this.myId}-${Date.now()}`, since: 0, muted: false };
    this.team.signal(m.id, 'ring', null, this.call.id).subscribe({ error: () => { this.toast.error('No se pudo iniciar la llamada.'); this.hangup(false); } });
    this.startRing(true);
    this.ringTimer = setTimeout(() => { if (this.call.state === 'ringing-out') { this.toast.info(`${m.name} no contestó.`); this.hangup(true); } }, 40000);
  }

  private async onSignal(s: any): Promise<void> {
    const from: Member = { id: Number(s.from?.id), name: s.from?.name || 'Agente', unread: 0 };
    switch (s.type) {
      case 'ring':
        if (this.call.state !== 'idle') { this.team.signal(from.id, 'busy', null, s.call_id).subscribe({ error: () => {} }); return; }
        this.call = { state: 'ringing-in', peer: from, id: s.call_id, since: 0, muted: false };
        this.startRing(false);
        this.ringTimer = setTimeout(() => { if (this.call.state === 'ringing-in') this.hangup(false); }, 45000);
        break;
      case 'accept': {
        if (this.call.state !== 'ringing-out' || s.call_id !== this.call.id) return;
        this.stopRing(); this.call = { ...this.call, state: 'connecting' };
        this.pc = this.newPeer(from.id);
        this.localStream?.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));
        const offer = await this.pc.createOffer(); await this.pc.setLocalDescription(offer);
        this.team.signal(from.id, 'offer', { sdp: offer.sdp, type: offer.type }, this.call.id).subscribe({ error: () => this.hangup(false) });
        break;
      }
      case 'offer': {
        if (this.call.state !== 'connecting' || s.call_id !== this.call.id) return;
        await this.pc!.setRemoteDescription(new RTCSessionDescription(s.payload));
        for (const c of this.pendingIce) await this.pc!.addIceCandidate(c).catch(() => {}); this.pendingIce = [];
        const answer = await this.pc!.createAnswer(); await this.pc!.setLocalDescription(answer);
        this.team.signal(from.id, 'answer', { sdp: answer.sdp, type: answer.type }, this.call.id).subscribe({ error: () => this.hangup(false) });
        break;
      }
      case 'answer':
        if (!this.pc || s.call_id !== this.call.id) return;
        await this.pc.setRemoteDescription(new RTCSessionDescription(s.payload));
        for (const c of this.pendingIce) await this.pc.addIceCandidate(c).catch(() => {}); this.pendingIce = [];
        break;
      case 'ice':
        if (s.call_id !== this.call.id) return;
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(s.payload).catch(() => {}); else this.pendingIce.push(s.payload);
        break;
      case 'reject': if (s.call_id === this.call.id) { this.toast.info(`${from.name} rechazó la llamada.`); this.hangup(false); } break;
      case 'busy':   if (s.call_id === this.call.id) { this.toast.info(`${from.name} está en otra llamada.`); this.hangup(false); } break;
      case 'hangup': if (s.call_id === this.call.id) { if (this.call.state === 'active') this.toast.info('Llamada finalizada.'); this.hangup(false); } break;
    }
  }

  async accept(): Promise<void> {
    const peer = this.call.peer;
    if (this.call.state !== 'ringing-in' || !peer) return;
    try { this.localStream = await this.getMic(); } catch { this.toast.error('No se pudo acceder al micrófono.'); this.reject(); return; }
    this.stopRing(); clearTimeout(this.ringTimer);
    this.call = { ...this.call, state: 'connecting' };
    this.pc = this.newPeer(peer.id);
    this.localStream.getTracks().forEach(t => this.pc!.addTrack(t, this.localStream!));
    this.team.signal(peer.id, 'accept', null, this.call.id).subscribe({ error: () => this.hangup(false) });
  }
  reject(): void { if (this.call.peer) this.team.signal(this.call.peer.id, 'reject', null, this.call.id).subscribe({ error: () => {} }); this.hangup(false); }
  hangup(notify = true): void {
    if (notify && this.call.peer && this.call.state !== 'idle') this.team.signal(this.call.peer.id, 'hangup', null, this.call.id).subscribe({ error: () => {} });
    this.stopRing(); clearTimeout(this.ringTimer); clearInterval(this.tickTimer);
    this.pc?.close(); this.pc = null; this.pendingIce = [];
    this.localStream?.getTracks().forEach(t => t.stop()); this.localStream = null;
    const a = this.remoteAudio?.nativeElement; if (a) a.srcObject = null;
    this.call = { state: 'idle', peer: null, id: '', since: 0, muted: false }; this.callSeconds = 0;
  }
  toggleMute(): void { this.call = { ...this.call, muted: !this.call.muted }; this.localStream?.getAudioTracks().forEach(t => t.enabled = !this.call.muted); }

  /* ── Sonidos (sintetizados) ──────────────────────────────────── */
  private pop(freq: number): void {
    try { const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext; if (!Ctx) return; this.ringCtx ??= new Ctx(); const ctx = this.ringCtx!; if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = freq; const t = ctx.currentTime; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25); o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3); } catch {}
  }
  private startRing(outgoing: boolean): void {
    this.stopRing();
    const beat = () => { this.pop(outgoing ? 440 : 880); setTimeout(() => this.pop(outgoing ? 440 : 660), 350); };
    beat(); this.ringOsc = setInterval(beat, outgoing ? 3000 : 2000);
  }
  private stopRing(): void { if (this.ringOsc) { clearInterval(this.ringOsc); this.ringOsc = null; } }

  @HostListener('window:beforeunload') onUnload(): void { if (this.call.state !== 'idle') this.hangup(true); }
}
