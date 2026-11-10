import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Clock, MessageCircle, MessageSquare, Share2 } from 'lucide-react';
import type { Outing, OutingPlan } from '@/core/model/types';
import { useTrainingFormat } from './format';
import { blankPlan, formatLeft, fromLocalInput, planMessage, planStatus, toLocalInput, type PlanLabels } from './outingPlan';
import { useTraining } from './store';

/** Textos del mensaje para la familia (en el idioma de la app). */
export function usePlanLabels(): PlanLabels {
  const { t } = useTranslation();
  return {
    title: t('outingPlan.msg.title'),
    leader: t('outingPlan.leader'),
    members: t('outingPlan.msg.members'),
    start: t('outingPlan.msg.start'),
    returnBy: t('outingPlan.msg.returnBy'),
    contact: t('outingPlan.msg.contact'),
    contingency: t('outingPlan.msg.contingency'),
    lastCheckIn: t('outingPlan.msg.lastCheckIn'),
    tail: t('outingPlan.msg.tail'),
  };
}

/**
 * Plan de la salida: a qué hora se vuelve, quién va, a quién avisar y qué hacer
 * si no se llega. Durante la salida se da "estoy bien"; pasada la hora límite,
 * la app avisa (barra de arriba y notificación con la app abierta).
 */
export function OutingPlanSection({ outing }: { outing: Outing }) {
  const { t } = useTranslation();
  const f = useTrainingFormat();
  const saveOuting = useTraining((s) => s.saveOuting);
  const labels = usePlanLabels();
  const plan = outing.plan ?? blankPlan();
  const [draft, setDraft] = useState<OutingPlan>(plan);
  const [now] = useState(() => new Date());
  const status = planStatus(outing.plan, now);
  const dirty = JSON.stringify(draft) !== JSON.stringify(plan);
  const message = planMessage({ ...outing, plan: draft }, labels, (iso) => f.dateTime(iso));

  const patch = (changes: Partial<OutingPlan>) => setDraft((d) => ({ ...d, ...changes }));
  const commit = (next: OutingPlan) => void saveOuting({ ...outing, plan: next });

  return (
    <section className="card stack" aria-labelledby="o-plan" data-testid="outing-plan">
      <h2 id="o-plan" className="section-title" style={{ margin: 0 }}>{t('outingPlan.title')}</h2>
      <p className="hint" style={{ margin: 0 }}>{t('outingPlan.hint')}</p>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="plan-start">{t('outingPlan.start')}</label>
          <input id="plan-start" className="input" type="datetime-local" value={toLocalInput(draft.startsAt)} onChange={(e) => patch({ startsAt: fromLocalInput(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="plan-return">{t('outingPlan.returnBy')}</label>
          <input id="plan-return" className="input" type="datetime-local" value={toLocalInput(draft.returnBy)} onChange={(e) => patch({ returnBy: fromLocalInput(e.target.value) })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="plan-leader">{t('outingPlan.leader')}</label>
        <input id="plan-leader" className="input" value={draft.leader} onChange={(e) => patch({ leader: e.target.value })} maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="plan-members">{t('outingPlan.members')}</label>
        <textarea id="plan-members" className="input" rows={3} value={draft.members} onChange={(e) => patch({ members: e.target.value })} placeholder={t('outingPlan.membersHint')} />
      </div>
      <div className="field">
        <label htmlFor="plan-contact">{t('outingPlan.contact')}</label>
        <input id="plan-contact" className="input" value={draft.contact} onChange={(e) => patch({ contact: e.target.value })} placeholder={t('outingPlan.contactHint')} maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor="plan-contingency">{t('outingPlan.contingency')}</label>
        <textarea id="plan-contingency" className="input" rows={3} value={draft.contingency} onChange={(e) => patch({ contingency: e.target.value })} placeholder={t('outingPlan.contingencyHint')} />
      </div>

      <div className="row-end wrap">
        <button className="btn btn-primary" type="button" disabled={!dirty} onClick={() => commit(draft)} data-testid="plan-save">
          {t('common.save')}
        </button>
      </div>

      {outing.plan?.returnBy && (
        <div className="stack" data-testid="plan-status" data-state={status.state}>
          <p style={{ margin: 0 }}>
            <Clock size={16} aria-hidden />{' '}
            {status.state === 'closed'
              ? t('outingPlan.status.closed')
              : status.state === 'planned'
                ? t('outingPlan.status.planned')
                : status.minutesLeft! >= 0
                  ? t('outingPlan.status.left', { time: formatLeft(status.minutesLeft!) })
                  : t('outingPlan.status.overdue', { time: formatLeft(status.minutesLeft!) })}
            {status.lastCheckIn && <span className="hint"> · {t('outingPlan.status.last', { time: f.dateTime(status.lastCheckIn) })}</span>}
          </p>
          {status.state !== 'closed' ? (
            <div className="row-end wrap">
              <button className="btn" type="button" onClick={() => commit({ ...plan, checkIns: [...plan.checkIns, { at: new Date().toISOString(), note: '' }] })} data-testid="plan-checkin">
                <CircleCheck size={18} aria-hidden /> {t('outingPlan.checkIn')}
              </button>
              {[30, 60].map((min) => (
                <button key={min} className="btn" type="button" onClick={() => commit({ ...plan, returnBy: new Date(Date.parse(plan.returnBy!) + min * 60_000).toISOString() })}>
                  {t('outingPlan.extend', { min })}
                </button>
              ))}
              <button className="btn btn-primary" type="button" onClick={() => commit({ ...plan, closedAt: new Date().toISOString() })} data-testid="plan-close">
                {t('outingPlan.close')}
              </button>
            </div>
          ) : (
            <div className="row-end wrap">
              <button className="btn" type="button" onClick={() => commit({ ...plan, closedAt: null })}>
                {t('outingPlan.reopen')}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="row-end wrap">
        <a className="btn" href={`sms:?&body=${encodeURIComponent(message)}`}>
          <MessageSquare size={18} aria-hidden /> {t('outingPlan.sendSms')}
        </a>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
          <MessageCircle size={18} aria-hidden /> {t('outingPlan.sendWhatsapp')}
        </a>
        {'share' in navigator && (
          <button className="btn" type="button" onClick={() => void navigator.share({ title: outing.name, text: message }).catch(() => undefined)}>
            <Share2 size={18} aria-hidden /> {t('outingPlan.share')}
          </button>
        )}
      </div>
    </section>
  );
}
