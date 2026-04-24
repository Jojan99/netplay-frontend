import {
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  Inject
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

import { ConversationListComponent } from '../../components/conversation-list/conversation-list.component';
import { ChatWindowComponent } from '../../components/chat-window/chat-window.component';
import { TransferConversationModalComponent } from '../../components/transfer-conversation-modal/transfer-conversation-modal.component';
import { CrmDashboardComponent } from '../crm-dashboard/crm-dashboard.component';
import { CrmBroadcastModalComponent } from '../../components/crm-broadcast-modal/crm-broadcast-modal.component';
import { CrmNewConversationModalComponent } from '../../components/crm-new-conversation-modal/crm-new-conversation-modal.component';

import { CrmService } from '../../../services/crm.service';
import { EchoService } from '../../../services/echo.service';
import { ThemeService } from '../../../services/theme.service';

type InboxStatus = 'all' | 'new' | 'in_progress' | 'closed';
type MainView    = 'inbox' | 'dashboard';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [
    CommonModule,
    ConversationListComponent,
    ChatWindowComponent,
    TransferConversationModalComponent,
    CrmDashboardComponent,
    CrmBroadcastModalComponent,
    CrmNewConversationModalComponent
  ],
  templateUrl: './inbox.component.html',
  styleUrl: './inbox.component.scss'
})
export class InboxComponent implements OnInit, OnDestroy {

  inbox: any[] = [];

  activeConversationId: number | null = null;
  inboxStatus: InboxStatus = 'all';
  mainView: MainView = 'inbox';

  mobileView: 'list' | 'chat' = 'list';
  isMobile = false;

  showTransferModal       = false;
  showBroadcastModal      = false;
  showNewConversationModal = false;

  private unreadMap = new Map<number, number>();

  constructor(
    private crmService: CrmService,
    private echoService: EchoService,
    private zone: NgZone,
    public themeService: ThemeService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobile = window.innerWidth < 768;
      window.addEventListener('resize', () => { this.isMobile = window.innerWidth < 768; });

      const saved = sessionStorage.getItem('crm_inbox_status') as InboxStatus;
      if (saved) this.inboxStatus = saved;
    }

    this.loadInbox();
    this.listenInboxRealtime();
  }

  /* ── REALTIME ───────────────────────────────────────────────── */
  listenInboxRealtime(): void {
    this.echoService.inboxUpdated$.subscribe((payload: any) => {
      this.zone.run(() => {
        const conversationId = payload.conversationId;

        if (this.activeConversationId !== conversationId) {
          const current = this.unreadMap.get(conversationId) || 0;
          this.unreadMap.set(conversationId, current + 1);
        }

        const filters: any = {};
        if (this.inboxStatus !== 'all') filters.status = this.inboxStatus;

        this.crmService.getInbox(filters).subscribe(res => {
          const freshInbox = res.data ?? [];
          freshInbox.forEach((c: any) => { c.unread_count = this.unreadMap.get(c.id) || 0; });

          const updatedConv = freshInbox.find((c: any) => c.id === conversationId);
          if (!updatedConv) { this.inbox = freshInbox; return; }

          this.inbox = [updatedConv, ...freshInbox.filter((c: any) => c.id !== conversationId)];
        });
      });
    });
  }

  /* ── INBOX ──────────────────────────────────────────────────── */
  loadInbox(): void {
    const filters: any = {};
    if (this.inboxStatus !== 'all') filters.status = this.inboxStatus;

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
