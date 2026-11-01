import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ban, LocateFixed, RotateCcw } from 'lucide-react';
import { useSettings } from '@/core/settings/settings';
import { PhoneActions } from '@/modules/emergency/parts';
import { resolveNext, TOPIC_BY_ID } from './content';
import { EnvSwitch, useLang } from './parts';
import { CALLS } from './types';

/** Un tema de la guía, paso a paso: cada respuesta lleva al paso siguiente (y "volver" deshace). */
export function GuideTopicPage() {
  const { topicId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const lang = useLang();
  const env = useSettings((s) => s.settings.firstAidEnv);
  const topic = topicId ? TOPIC_BY_ID.get(topicId) : undefined;
  const nodeId = params.get('paso') ?? topic?.start ?? '';
  const node = topic?.nodes[nodeId];

  if (!topic || !node) {
    return (
      <p className="empty">
        {t('guides.notFound')} <Link to="/first-aid/guides">{t('common.back')}</Link>
      </p>
    );
  }

  const go = (next: string) => {
    const target = resolveNext(topic.id, next);
    const startOfTopic = TOPIC_BY_ID.get(target.topic)?.start;
    navigate(`/first-aid/guides/${target.topic}${target.node === startOfTopic ? '' : `?paso=${target.node}`}`);
  };
  const steps = node.steps.filter((s) => !s.env || s.env === env);

  return (
    <div className="stack guide">
      <div className="page-head">
        <button className="icon-btn" type="button" onClick={() => navigate(-1)} aria-label={t('common.back')}>
          <ArrowLeft size={22} />
        </button>
        <h1 className="page-title" style={{ flex: 1 }}>{topic.title[lang]}</h1>
      </div>

      <EnvSwitch />

      <section className="card stack" aria-labelledby="guide-node-title" data-testid="guide-node">
        <h2 id="guide-node-title" className="section-title" style={{ margin: 0 }}>
          {node.title[lang]}
        </h2>
        <ol className="guide-steps">
          {steps.map((s, i) => (
            <li key={i} className={s.dont ? 'guide-dont' : undefined} data-env={s.env}>
              {s.dont && <Ban size={16} aria-label={t('guides.dont')} />} {s.text[lang]}
            </li>
          ))}
        </ol>

        {node.calls && (
          <div className="guide-calls" data-testid="guide-calls">
            {node.calls.map((k) => (
              <span key={k} className="guide-call">
                <span className="hint">{t(`guides.call.${k}`)}</span>
                <PhoneActions phone={CALLS[k]} />
              </span>
            ))}
            {env === 'wild' && (
              <Link className="btn" to="/first-aid/location">
                <LocateFixed size={18} /> {t('guides.myLocation')}
              </Link>
            )}
          </div>
        )}

        {node.question && <p className="guide-question">{node.question[lang]}</p>}
        {node.options && (
          <div className="guide-options" data-testid="guide-options">
            {node.options.map((o) => (
              <button key={o.next + o.label.es} className="btn guide-option" type="button" onClick={() => go(o.next)}>
                {o.label[lang]}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="row-end wrap">
        <Link className="btn" to="/first-aid/guides/assess">
          <RotateCcw size={18} /> {t('guides.restart')}
        </Link>
        <Link className="btn" to="/first-aid/guides">
          {t('guides.all')}
        </Link>
      </div>
      <p className="hint">{t('guides.disclaimer')}</p>
    </div>
  );
}
