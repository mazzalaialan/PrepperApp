import { describe, expect, it } from 'vitest';
import { selectNotifiable, type NotifiableAlert } from './notifiable';

const alert = (over: Partial<NotifiableAlert>): NotifiableAlert => ({
  itemName: 'Atún',
  kind: 'expiry',
  dueDate: '2026-12-01',
  notifyFrom: '2026-11-01',
  ...over,
});

describe('selectNotifiable', () => {
  it('sin aviso previo, avisa todo lo que ya entró en ventana', () => {
    const alerts = [alert({}), alert({ notifyFrom: '2026-11-20' })];
    expect(selectNotifiable(alerts, '2026-11-10', null)).toHaveLength(1);
  });

  it('no repite lo ya avisado', () => {
    expect(selectNotifiable([alert({})], '2026-11-10', '2026-11-05')).toEqual([]);
  });

  it('avisa lo que entró en ventana después del último aviso', () => {
    const fresh = alert({ itemName: 'Agua', notifyFrom: '2026-11-08' });
    expect(selectNotifiable([alert({}), fresh], '2026-11-10', '2026-11-05')).toEqual([fresh]);
  });

  it('vuelve a avisar el día que vence', () => {
    const due = alert({ dueDate: '2026-12-01' });
    expect(selectNotifiable([due], '2026-12-01', '2026-11-30')).toEqual([due]);
  });
});
