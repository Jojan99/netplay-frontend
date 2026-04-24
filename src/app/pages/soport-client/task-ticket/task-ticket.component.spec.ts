import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TaskTicketComponent } from './task-ticket.component';

describe('TaskTicketComponent', () => {
  let component: TaskTicketComponent;
  let fixture: ComponentFixture<TaskTicketComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskTicketComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TaskTicketComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
