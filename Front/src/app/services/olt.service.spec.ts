import { TestBed } from '@angular/core/testing';

import { OltService } from './olt.service';

describe('OltService', () => {
  let service: OltService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OltService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
