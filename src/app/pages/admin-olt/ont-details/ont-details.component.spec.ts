import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OntDetailsComponent } from './ont-details.component';

describe('OntDetailsComponent', () => {
  let component: OntDetailsComponent;
  let fixture: ComponentFixture<OntDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OntDetailsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OntDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
