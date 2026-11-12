import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { OfficialWeatherNotice } from '@/ui/OfficialWeatherNotice';
import { Bug, Check, Coffee, Copy, Code, ExternalLink, Lightbulb, Mail, MessageSquare, HandCoins, Scale } from 'lucide-react';
import { CAFECITO_URL, MERCADOPAGO_URL, YOUTUBE_URL, deviceInfo, feedbackText, githubIssueUrl, mailtoUrl, REPO_URL, type FeedbackKind } from '@/core/about';
import { YoutubeIcon } from '@/ui/YoutubeIcon';
import { PortableUpdateCheck } from './SettingsPage';

const KINDS: { kind: FeedbackKind; icon: typeof Bug }[] = [
  { kind: 'bug', icon: Bug },
  { kind: 'idea', icon: Lightbulb },
  { kind: 'message', icon: MessageSquare },
];

/** Acerca de: versión, reportar problemas, sugerir mejoras, contacto y cafecito. */
export function AboutPage() {
  const { t, i18n } = useTranslation();
  // Desde otra pantalla se puede abrir con el reporte ya escrito (p. ej. una repetidora que no funciona).
  const [params] = useSearchParams();
  const preKind = params.get('tipo');
  const [kind, setKind] = useState<FeedbackKind>(preKind === 'idea' || preKind === 'message' ? preKind : 'bug');
  const [message, setMessage] = useState(params.get('texto') ?? '');
  useEffect(() => {
    if (!params.get('texto')) return;
    const box = document.getElementById('feedback-message') as HTMLTextAreaElement | null;
    box?.scrollIntoView({ block: 'center' });
    box?.focus();
    box?.setSelectionRange(box.value.length, box.value.length);
  }, [params]);
  const [includeInfo, setIncludeInfo] = useState(true);
  const [copied, setCopied] = useState(false);

  const info = includeInfo ? deviceInfo(__APP_VERSION__, i18n.language) : null;
  const kindLabel = t(`about.kind.${kind}`);
  const body = feedbackText(kindLabel, message, info);
  const title = `${kindLabel}: ${message.trim().split('\n')[0]!.slice(0, 80)}`;
  const mail = mailtoUrl(`VikArg — ${kindLabel}`, body);
  const empty = !message.trim();

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('about.copy'), body);
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1 className="page-title" style={{ flex: 1 }}>{t('about.title')}</h1>
      </div>

      <section className="card stack" aria-labelledby="about-app">
        <h2 id="about-app" className="section-title" style={{ margin: 0 }}>{t('app.name')}</h2>
        <p style={{ margin: 0 }} data-testid="about-version">
          {t('settings.version', { version: __APP_VERSION__ })}
        </p>
        <PortableUpdateCheck />
        <p className="hint" style={{ margin: 0 }}>{t('about.description')}</p>
        <div className="stack" style={{ gap: 4 }} data-testid="about-privacy">
          <h3 style={{ fontSize: '1rem', margin: 0 }}>{t('about.privacy.title')}</h3>
          <ul className="about-privacy hint">
            {(['device', 'server', 'services', 'choice'] as const).map((k) => (
              <li key={k}>{t(`about.privacy.${k}`)}</li>
            ))}
            <li>
              <Link to="/settings">{t('about.privacy.delete')}</Link>
            </li>
          </ul>
        </div>
        <OfficialWeatherNotice />
        <p className="hint" style={{ margin: 0, fontStyle: 'italic' }}>{t('app.motto')}</p>
        <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer">
          <Code size={18} /> {t('about.source')}
        </a>
        <Link className="btn" to="/about/licenses" data-testid="about-licenses">
          <Scale size={18} aria-hidden /> {t('licenses.title')}
        </Link>
      </section>

      <section className="card stack" aria-labelledby="about-feedback">
        <h2 id="about-feedback" className="section-title" style={{ margin: 0 }}>{t('about.feedbackTitle')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('about.feedbackHint')}</p>
        <div className="chips" role="group" aria-label={t('about.kindLabel')}>
          {KINDS.map(({ kind: k, icon: Icon }) => (
            <button key={k} type="button" className="chip guide-env" aria-pressed={kind === k} onClick={() => setKind(k)}>
              <Icon size={16} aria-hidden /> {t(`about.kind.${k}`)}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="feedback-message">{t('about.message')}</label>
          <textarea
            id="feedback-message"
            className="input textarea"
            rows={6}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t(`about.placeholder.${kind}`)}
          />
        </div>
        <label className="check">
          <input type="checkbox" checked={includeInfo} onChange={(e) => setIncludeInfo(e.target.checked)} />
          {t('about.includeInfo')}
        </label>
        {info && <pre className="about-info" data-testid="about-info">{info}</pre>}
        <div className="row-end wrap">
          <button className="btn" type="button" onClick={() => void copy()} disabled={empty}>
            {copied ? <Check size={18} /> : <Copy size={18} />} {copied ? t('about.copied') : t('about.copy')}
          </button>
          {mail && (
            <a className={`btn${empty ? ' disabled' : ''}`} href={empty ? undefined : mail} aria-disabled={empty}>
              <Mail size={18} /> {t('about.sendMail')}
            </a>
          )}
          <a
            className={`btn btn-primary${empty ? ' disabled' : ''}`}
            href={empty ? undefined : githubIssueUrl(kind, title, body)}
            target="_blank"
            rel="noreferrer"
            aria-disabled={empty}
            data-testid="about-github"
          >
            <ExternalLink size={18} /> {t('about.sendGithub')}
          </a>
        </div>
        <p className="hint" style={{ margin: 0 }}>{mail ? t('about.githubHint') : t('about.noMailYet')}</p>
      </section>

      <section className="card stack" aria-labelledby="about-youtube">
        <h2 id="about-youtube" className="section-title" style={{ margin: 0 }}>{t('about.youtubeTitle')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('about.youtubeText')}</p>
        <a className="btn" href={YOUTUBE_URL} target="_blank" rel="noreferrer" data-testid="about-youtube">
          <YoutubeIcon size={20} /> {t('about.youtube')}
        </a>
      </section>

      <section className="card stack about-coffee" aria-labelledby="about-coffee">
        <h2 id="about-coffee" className="section-title" style={{ margin: 0 }}>{t('about.coffeeTitle')}</h2>
        <p className="hint" style={{ margin: 0 }}>{t('about.coffeeText')}</p>
        <a className="btn btn-primary" href={CAFECITO_URL} target="_blank" rel="noreferrer" data-testid="about-cafecito">
          <Coffee size={18} /> {t('about.coffee')}
        </a>
        <a className="btn" href={MERCADOPAGO_URL} target="_blank" rel="noreferrer" data-testid="about-mercadopago">
          <HandCoins size={18} /> {t('about.mercadopago')}
        </a>
      </section>
    </div>
  );
}
