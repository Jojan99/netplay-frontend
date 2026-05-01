import { Injectable, OnDestroy } from '@angular/core';
import { EmployeeService } from './employee.service';

@Injectable({ providedIn: 'root' })
export class LocationTrackerService implements OnDestroy {

  private intervalId: any = null;
  private isTracking = false;

  constructor(private employeeService: EmployeeService) {}

  startTrackingIfTechnician(): void {
    const role = (localStorage.getItem('user_role') || '').toUpperCase();
    const isTechnician = role.includes('TECNICO') || role.includes('TÉCNICO') ||
                         role.includes('INSTALADOR') || role.includes('SOPORTE');

    if (!isTechnician || this.isTracking || !navigator.geolocation) return;

    this.isTracking = true;
    this.sendLocation();
    this.intervalId = setInterval(() => this.sendLocation(), 15000);
  }

  stopTracking(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isTracking = false;
  }

  private sendLocation(): void {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.employeeService.updateMyLocation(
          pos.coords.latitude,
          pos.coords.longitude
        ).subscribe({ error: () => {} });
      },
      () => {}
    );
  }

  ngOnDestroy(): void {
    this.stopTracking();
  }
}
