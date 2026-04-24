import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const roleGuard: CanActivateFn = (route) => {
  const required = route.data['module'] as string | undefined;
  if (!required) return true;

  const allowed = inject(AuthService).getAllowedModules();
  if (allowed.includes(required)) return true;

  return inject(Router).createUrlTree(['/dashboard/home']);
};
