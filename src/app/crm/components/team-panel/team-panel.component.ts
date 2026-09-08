import { Component, OnInit, OnDestroy, NgZone, Inject, PLATFORM_ID, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamService } from '../../../services/team.service';
import { EchoService } from '../../../services/echo.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

interface Member { id: number; name: string; profile?: string; unread: number; }
interface TeamMsg { id: number; from_user_id: number; to_user_id: number | null; from_name: string; content: string; created_at: string; mine: boolean; attachment_url?: string | null; attachment_type?: string | null; attachment_name?: string | null; attachment_size?: number | null; }
type PeerState = 'ringing' | 'connecting' | 'active' | 'left';
interface Peer { member: Member; pc: RTCPeerConnection | null; state: PeerState; pendingIce: RTCIceCandidateInit[]; audio?: HTMLAudioElement; timer?: any; }
type CallState = 'idle' | 'ringing-in' | 'in-call';

/**
 * Equipo: presencia por empresa, chat interno (texto + adjuntos) y llamadas de voz
 * entre agentes (WebRTC en malla: cada participante se conecta con cada otro; la
 * señalización viaja por el backend y los medios por STUN/TURN).
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
  @ViewChild('audioHost') audioHost?: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  open = false;
  me: Member | null = null;
  members: Member[] = [];
  generalUnread = 0;
  online = new Set<number>();
  active: 'general' | number | null = null;
  messages: TeamMsg[] = [];
  draft = '';
  loadingThread = false;
  presenceReady = false;
  sendingFile = false;

  // ── Grabación de audio ──
  recording = false; recSeconds = 0; private recorder: MediaRecorder | null = null; private recChunks: BlobPart[] = []; private recTimer: any = null; private recStream: MediaStream | null = null;

  // ── Llamada ──
  call: { state: CallState; id: string; group: boolean; host: number; since: number; muted: boolean; incomingFrom: Member | null; incomingParticipants: number[] } =
    { state: 'idle', id: '', group: false, host: 0, since: 0, muted: false, incomingFrom: null, incomingParticipants: [] };
  peers = new Map<number, Peer>();
  private localStream: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
  private ringTimer: any = null; private tickTimer: any = null;
  callSeconds = 0;
  private ringCtx: AudioContext | null = null; private ringOsc: any = null;
  showGroupPicker = false; groupPick = new Set<number>();

  private myId = 0; private companyId = 0;

  constructor(private team: TeamService, private echo: EchoService, private auth: AuthService, private zone: NgZone, private toast: ToastService, @Inject(PLATFORM_ID) private platformId: Object) {}

  /* ── Derivados ───────────────────────────────────────────────── */
  get totalUnread(): number { return this.members.reduce((a, m) => a + (m.unread || 0), 0) + this.generalUnread; }
  get onlineCount(): number { return this.members.filter(m => this.online.has(m.id)).length; }
  get activeMember(): Member | null { return typeof this.active === 'number' ? this.members.find(m => m.id === this.active) || null : null; }
  get sortedMembers(): Member[] { return [...this.members].sort((a, b) => Number(this.online.has(b.id)) - Number(this.online.has(a.id)) || (b.unread - a.unread) || a.name.localeCompare(b.name)); }
  get peerList(): Peer[] { return [...this.peers.values()].filter(p => p.state !== 'left'); }
  get activePeers(): Peer[] { return this.peerList.filter(p => p.state === 'active'); }
  get callTitle(): string {
    if (this.call.state === 'ringing-in') return this.call.incomingFrom?.name || 'Llamada';
    const names = this.peerList.map(p => p.member.name.split(' ')[0]);
    return names.length <= 2 ? names.join(' y ') : `${names.slice(0, 2).join(', ')} y ${names.length - 2} más`;
  }
  get callStatus(): string {
    if (this.call.state === 'ringing-in') return this.call.group ? 'Llamada grupal entrante…' : 'Llamada entrante…';
    if (this.activePeers.length) return `${this.fmtSecs(this.callSeconds)}${this.call.muted ? ' · silenciado' : ''}`;
    if (this.peerList.some(p => p.state === 'connecting')) return 'Conectando el audio…';
    return 'Llamando…';
  }
  get inviteCandidates(): Member[] { return this.members.filter(m => this.online.has(m.id) && !this.peers.has(m.id)); }
  memberName(id: number): string { return id === this.myId ? 'Vos' : (this.members.find(m => m.id === id)?.name || 'Agente'); }
  initials(n: string): string { return (n || '?').split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
  fmtTime(iso: string): string { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }); }
  fmtSecs(s: number): string { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  fmtSize(b?: number | null): string { if (!b) return ''; return b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`; }
  trackPeer(_: number, p: Peer): number { return p.member.id; }

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.myId = this.auth.getUser()?.userId || 0;
    this.companyId = this.auth.getCompanyId();
    if (!this.myId || !this.companyId) return;
    this.loadMembers();
    this.team.ice().subscribe({ next: r => { if (Array.isArray(r.data) && r.data.length) this.iceServers = r.data; }, error: () => {} });
    this.connect();
  }
  ngOnDestroy(): void { this.endCall(true); this.echo.leave(`company.${this.companyId}`); this.echo.leave(`user.${this.myId}`); }

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
      .leaving((u: any) => this.zone.run(() => { const s = new Set(this.online); s.delete(Number(u.id)); this.online = s; const p = this.peers.get(Number(u.id)); if (p && p.state !== 'left') this.dropPeer(Number(u.id), 'se desconectó'); }))
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
      this.toast.info(`${m.from_name}: ${m.attachment_type ? '📎 ' + (m.attachment_name || 'adjunto') : String(m.content).slice(0, 80)}`);
    }
  }

  /* ── Hilos ───────────────────────────────────────────────────── */
  toggle(): void { this.open = !this.open; if (this.open && this.active !== null) this.markRead(); }
  openThread(which: 'general' | number): void {
    this.active = which; this.messages = []; this.loadingThread = true;
    this.team.messages(which).subscribe({ next: r => { this.messages = r.data || []; this.loadingThread = false; this.scrollThread(); this.markRead(); }, error: () => this.loadingThread = false });
  }
  private markRead(): void {
    if (this.active === 'general') { this.generalUnread = 0; this.team.read('general').subscribe({ error: () => {} }); }
    else if (typeof this.active === 'number') { const id = this.active; this.members = this.members.map(x => x.id === id ? { ...x, unread: 0 } : x); this.team.read(id).subscribe({ error: () => {} }); }
  }
  backToList(): void { this.active = null; this.messages = []; this.cancelRecording(); }
  send(): void {
    const text = this.draft.trim(); if (!text || this.active === null) return;
    this.draft = '';
    this.team.send(this.active === 'general' ? null : this.active, text).subscribe({
      next: r => this.pushMine(r.data), error: () => this.toast.error('No se pudo enviar el mensaje.')
    });
  }
  private pushMine(m: any): void { if (m && !this.messages.some(x => x.id === m.id)) { this.messages = [...this.messages, { ...m, mine: true }]; this.scrollThread(); } }
  onKey(ev: KeyboardEvent): void { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); this.send(); } }
  private scrollThread(): void { setTimeout(() => { const el = this.thread?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 0); }
  showDay(i: number): boolean { if (i === 0) return true; return new Date(this.messages[i - 1].created_at).toDateString() !== new Date(this.messages[i].created_at).toDateString(); }
  dayLabel(iso: string): string { const d = new Date(iso), now = new Date(); if (d.toDateString() === now.toDateString()) return 'Hoy'; const y = new Date(now); y.setDate(now.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'Ayer'; return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }); }

  /* ── Adjuntos ────────────────────────────────────────────────── */
  pickFile(): void { this.fileInput?.nativeElement.click(); }
  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement; const f = input.files?.[0]; input.value = '';
    if (f) this.sendFile(f);
  }
  private sendFile(file: File, caption = ''): void {
    if (this.active === null || this.sendingFile) return;
    if (file.size > 25 * 1024 * 1024) { this.toast.warning('El archivo supera los 25 MB.'); return; }
    this.sendingFile = true;
    this.team.sendFile(this.active === 'general' ? null : this.active, file, caption).subscribe({
      next: r => { this.sendingFile = false; this.pushMine(r.data); },
      error: () => { this.sendingFile = false; this.toast.error('No se pudo enviar el archivo.'); }
    });
  }
  async startRecording(): Promise<void> {
    if (this.recording) return;
    try { this.recStream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { this.toast.error('No se pudo acceder al micrófono.'); return; }
    const mime = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    this.recChunks = [];
    this.recorder = mime ? new MediaRecorder(this.recStream, { mimeType: mime }) : new MediaRecorder(this.recStream);
    this.recorder.ondataavailable = e => { if (e.data.size) this.recChunks.push(e.data); };
    this.recorder.onstop = () => this.zone.run(() => {
      const type = this.recorder?.mimeType || mime || 'audio/webm';
      const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
      const blob = new Blob(this.recChunks, { type });
      this.recStream?.getTracks().forEach(t => t.stop()); this.recStream = null;
      clearInterval(this.recTimer); const secs = this.recSeconds; this.recording = false; this.recSeconds = 0;
      if (this.recCancelled || secs < 1 || !blob.size) { this.recCancelled = false; return; }
      this.sendFile(new File([blob], `nota_de_voz_${Date.now()}.${ext}`, { type }));
    });
    this.recorder.start(); this.recording = true; this.recSeconds = 0;
    this.recTimer = setInterval(() => this.zone.run(() => { this.recSeconds++; if (this.recSeconds >= 300) this.stopRecording(); }), 1000);
  }
  private recCancelled = false;
  stopRecording(): void { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); }
  cancelRecording(): void { if (!this.recording) return; this.recCancelled = true; this.stopRecording(); }

  /* ── Llamadas (malla WebRTC) ──────────────────────────────────── */
  private async getMic(): Promise<boolean> {
    if (this.localStream) return true;
    try { this.localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }); return true; }
    catch { this.toast.error('No se pudo acceder al micrófono.'); return false; }
  }
  private participantIds(): number[] { return [this.myId, ...this.peerList.map(p => p.member.id)]; }
  private signal(to: number, type: string, payload: any = null): void {
    this.team.signal(to, type, payload, this.call.id, { participants: this.participantIds(), group: this.call.group }).subscribe({ error: () => {} });
  }
  private ensurePeer(m: Member, state: PeerState): Peer {
    let p = this.peers.get(m.id);
    if (!p) { p = { member: m, pc: null, state, pendingIce: [] }; this.peers.set(m.id, p); this.peers = new Map(this.peers); }
    else if (p.state === 'left') { p.state = state; }
    return p;
  }
  private newPc(peerId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.localStream?.getTracks().forEach(t => pc.addTrack(t, this.localStream!));
    pc.onicecandidate = e => { if (e.candidate) this.signal(peerId, 'ice', e.candidate.toJSON()); };
    pc.ontrack = e => {
      const p = this.peers.get(peerId); if (!p) return;
      if (!p.audio) { p.audio = document.createElement('audio'); p.audio.autoplay = true; (p.audio as any).playsInline = true; this.audioHost?.nativeElement.appendChild(p.audio); }
      p.audio.srcObject = e.streams[0]; p.audio.play().catch(() => {});
    };
    const onState = () => this.zone.run(() => {
      const st: string = pc.connectionState || pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') this.peerActive(peerId);
      if (st === 'failed') this.dropPeer(peerId, 'no se pudo conectar el audio');
      if (st === 'disconnected') setTimeout(() => { const cur: string = pc.connectionState || pc.iceConnectionState; if (cur === 'disconnected') this.dropPeer(peerId, 'se perdió la conexión'); }, 6000);
    });
    pc.onconnectionstatechange = onState; pc.oniceconnectionstatechange = onState;
    return pc;
  }
  private setPeerConnecting(p: Peer): void {
    p.state = 'connecting'; this.peers = new Map(this.peers);
    clearTimeout(p.timer);
    p.timer = setTimeout(() => this.zone.run(() => { if (p.state === 'connecting') this.dropPeer(p.member.id, 'no respondió la conexión de audio'); }), 30000);
  }
  private peerActive(id: number): void {
    const p = this.peers.get(id); if (!p || p.state === 'active') return;
    clearTimeout(p.timer); p.state = 'active'; this.peers = new Map(this.peers);
    this.stopRing();
    if (!this.call.since) { this.call = { ...this.call, since: Date.now() }; clearInterval(this.tickTimer); this.tickTimer = setInterval(() => this.zone.run(() => this.callSeconds = Math.floor((Date.now() - this.call.since) / 1000)), 1000); }
  }
  private dropPeer(id: number, reason?: string, notify = false): void {
    const p = this.peers.get(id); if (!p || p.state === 'left') return;
    clearTimeout(p.timer); p.pc?.close(); p.pc = null; p.audio?.remove(); p.state = 'left'; this.peers = new Map(this.peers);
    if (notify) this.signal(id, 'hangup');
    if (reason) this.toast.info(`${p.member.name}: ${reason}.`);
    if (this.peerList.length === 0) this.endCall(false, this.call.since ? 'Llamada finalizada.' : undefined);
  }

  /** Llamar a una persona. */
  async callMember(m: Member): Promise<void> {
    if (this.call.state === 'in-call') { this.invite(m); return; }
    if (this.call.state !== 'idle') return;
    if (!this.online.has(m.id)) { this.toast.warning(`${m.name} no está en línea.`); return; }
    if (!(await this.getMic())) return;
    this.call = { state: 'in-call', id: `${this.myId}-${Date.now()}`, group: false, host: this.myId, since: 0, muted: false, incomingFrom: null, incomingParticipants: [] };
    this.ringPeer(m);
    this.startRing(true);
  }
  /** Llamada grupal: elegir varias personas en línea. */
  openGroupPicker(): void { this.groupPick = new Set(); this.showGroupPicker = true; }
  togglePick(id: number): void { const s = new Set(this.groupPick); s.has(id) ? s.delete(id) : s.add(id); this.groupPick = s; }
  async startGroupCall(): Promise<void> {
    const ids = [...this.groupPick]; if (!ids.length) return;
    this.showGroupPicker = false;
    if (this.call.state === 'in-call') { ids.forEach(id => { const m = this.members.find(x => x.id === id); if (m) this.invite(m); }); return; }
    if (!(await this.getMic())) return;
    this.call = { state: 'in-call', id: `${this.myId}-${Date.now()}`, group: true, host: this.myId, since: 0, muted: false, incomingFrom: null, incomingParticipants: [] };
    ids.forEach(id => { const m = this.members.find(x => x.id === id); if (m) this.ringPeer(m); });
    this.startRing(true);
  }
  private ringPeer(m: Member): void {
    this.ensurePeer(m, 'ringing');
    this.signal(m.id, 'ring');
    const p = this.peers.get(m.id)!;
    p.timer = setTimeout(() => this.zone.run(() => { if (p.state === 'ringing') this.dropPeer(m.id, 'no contestó', true); }), 40000);
  }
  invite(m: Member): void {
    if (this.call.state !== 'in-call' || this.peers.get(m.id)?.state && this.peers.get(m.id)!.state !== 'left') return;
    if (!this.online.has(m.id)) { this.toast.warning(`${m.name} no está en línea.`); return; }
    this.call = { ...this.call, group: true };
    this.ringPeer(m);
  }

  private async onSignal(s: any): Promise<void> {
    const fromId = Number(s.from?.id); const fromName = s.from?.name || 'Agente';
    const from: Member = this.members.find(m => m.id === fromId) || { id: fromId, name: fromName, unread: 0 };
    switch (s.type) {
      case 'ring': {
        if (this.call.state === 'in-call' && s.call_id === this.call.id) return;   // eco de mi propia llamada
        if (this.call.state !== 'idle') { this.team.signal(fromId, 'busy', null, s.call_id).subscribe({ error: () => {} }); return; }
        const participants = (s.participants || []).map(Number).filter((id: number) => id !== this.myId);
        this.call = { state: 'ringing-in', id: s.call_id, group: !!s.group || participants.length > 1, host: fromId, since: 0, muted: false, incomingFrom: from, incomingParticipants: participants };
        this.startRing(false);
        clearTimeout(this.ringTimer); this.ringTimer = setTimeout(() => this.zone.run(() => { if (this.call.state === 'ringing-in') this.endCall(false); }), 45000);
        break;
      }
      case 'accept': {
        // Aceptaron mi llamada: yo inicio la oferta y aviso al resto para que también se conecten con el nuevo participante
        if (this.call.state !== 'in-call' || s.call_id !== this.call.id) return;
        const p = this.ensurePeer(from, 'connecting'); this.setPeerConnecting(p);
        this.stopRing();
        this.peerList.filter(x => x.member.id !== fromId && x.state !== 'ringing').forEach(x => this.signal(x.member.id, 'join', { userId: fromId, name: from.name }));
        await this.makeOffer(p);
        break;
      }
      case 'join': {
        // Un participante nuevo entró a la llamada grupal: me conecto con él (yo ofrezco)
        if (this.call.state !== 'in-call' || s.call_id !== this.call.id) return;
        const nm: Member = this.members.find(m => m.id === Number(s.payload?.userId)) || { id: Number(s.payload?.userId), name: s.payload?.name || 'Agente', unread: 0 };
        if (!nm.id || nm.id === this.myId) return;
        const p = this.ensurePeer(nm, 'connecting'); this.setPeerConnecting(p); this.call = { ...this.call, group: true };
        await this.makeOffer(p);
        break;
      }
      case 'offer': {
        if (this.call.state !== 'in-call' || s.call_id !== this.call.id) return;
        const p = this.ensurePeer(from, 'connecting'); if (p.state !== 'active') this.setPeerConnecting(p);
        if (!p.pc) p.pc = this.newPc(fromId);
        await p.pc.setRemoteDescription(new RTCSessionDescription(s.payload));
        for (const c of p.pendingIce) await p.pc.addIceCandidate(c).catch(() => {}); p.pendingIce = [];
        const answer = await p.pc.createAnswer(); await p.pc.setLocalDescription(answer);
        this.signal(fromId, 'answer', { sdp: answer.sdp, type: answer.type });
        break;
      }
      case 'answer': {
        const p = this.peers.get(fromId); if (!p?.pc || s.call_id !== this.call.id) return;
        await p.pc.setRemoteDescription(new RTCSessionDescription(s.payload));
        for (const c of p.pendingIce) await p.pc.addIceCandidate(c).catch(() => {}); p.pendingIce = [];
        break;
      }
      case 'ice': {
        if (s.call_id !== this.call.id) return;
        const p = this.ensurePeer(from, 'connecting');
        if (p.pc?.remoteDescription) await p.pc.addIceCandidate(s.payload).catch(() => {}); else p.pendingIce.push(s.payload);
        break;
      }
      case 'reject': if (s.call_id === this.call.id) this.dropPeer(fromId, 'rechazó la llamada'); break;
      case 'busy':   if (s.call_id === this.call.id) this.dropPeer(fromId, 'está en otra llamada'); break;
      case 'hangup':
        if (s.call_id !== this.call.id) return;
        if (this.call.state === 'ringing-in') { this.endCall(false); this.toast.info(`${from.name} colgó.`); }
        else this.dropPeer(fromId, this.call.group ? 'salió de la llamada' : undefined);
        break;
    }
  }
  private async makeOffer(p: Peer): Promise<void> {
    if (!p.pc) p.pc = this.newPc(p.member.id);
    const offer = await p.pc.createOffer(); await p.pc.setLocalDescription(offer);
    this.signal(p.member.id, 'offer', { sdp: offer.sdp, type: offer.type });
  }

  async accept(): Promise<void> {
    if (this.call.state !== 'ringing-in' || !this.call.incomingFrom) return;
    if (!(await this.getMic())) { this.reject(); return; }
    this.stopRing(); clearTimeout(this.ringTimer);
    const host = this.call.incomingFrom;
    this.call = { ...this.call, state: 'in-call', muted: false };
    const p = this.ensurePeer(host, 'connecting'); this.setPeerConnecting(p);
    // Los demás participantes (si es grupal) me ofrecerán cuando el anfitrión les avise "join"
    this.call.incomingParticipants.filter(id => id !== host.id).forEach(id => { const m = this.members.find(x => x.id === id); if (m) { const q = this.ensurePeer(m, 'connecting'); this.setPeerConnecting(q); } });
    this.team.signal(host.id, 'accept', null, this.call.id).subscribe({ error: () => this.endCall(false, 'No se pudo aceptar la llamada.') });
  }
  reject(): void { if (this.call.incomingFrom) this.team.signal(this.call.incomingFrom.id, 'reject', null, this.call.id).subscribe({ error: () => {} }); this.endCall(false); }
  hangup(): void { this.endCall(true, this.call.since ? 'Llamada finalizada.' : undefined); }
  private endCall(notify: boolean, msg?: string): void {
    if (notify) this.peerList.forEach(p => this.signal(p.member.id, 'hangup'));
    this.stopRing(); clearTimeout(this.ringTimer); clearInterval(this.tickTimer);
    this.peers.forEach(p => { clearTimeout(p.timer); p.pc?.close(); p.audio?.remove(); });
    this.peers = new Map();
    this.localStream?.getTracks().forEach(t => t.stop()); this.localStream = null;
    this.call = { state: 'idle', id: '', group: false, host: 0, since: 0, muted: false, incomingFrom: null, incomingParticipants: [] }; this.callSeconds = 0;
    this.showGroupPicker = false;
    if (msg) this.toast.info(msg);
  }
  toggleMute(): void { this.call = { ...this.call, muted: !this.call.muted }; this.localStream?.getAudioTracks().forEach(t => t.enabled = !this.call.muted); }

  /* ── Sonidos ─────────────────────────────────────────────────── */
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

  @HostListener('window:beforeunload') onUnload(): void { if (this.call.state !== 'idle') this.endCall(true); }
}
