import { Routes } from '@angular/router';
import { InboxComponent } from './pages/inbox/inbox.component';

export const CRM_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'inbox',
    pathMatch: 'full'
  },
  {
    path: 'inbox',
    component: InboxComponent
  },
  {
    path: 'inbox/:conversationId',
    component: InboxComponent
  }
];
