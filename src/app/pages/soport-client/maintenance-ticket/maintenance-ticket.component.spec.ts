import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaintenanceTicketComponent } from './maintenance-ticket.component';

describe('MaintenanceTicketComponent', () => {
  let component: MaintenanceTicketComponent;
  let fixture: ComponentFixture<MaintenanceTicketComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaintenanceTicketComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MaintenanceTicketComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
