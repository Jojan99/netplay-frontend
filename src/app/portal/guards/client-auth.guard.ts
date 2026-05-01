import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ClientAuthService } from '../services/client-auth.service';

export const clientAuthGuard: CanActivateFn = () => {
  const auth   = inject(ClientAuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;
  return router.createUrlTree(['/portal/login']);
};
