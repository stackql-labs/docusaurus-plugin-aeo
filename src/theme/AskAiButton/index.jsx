import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { usePluginData } from '@docusaurus/useGlobalData';
import icons from './icons.js';
import styles from './styles.module.css';

const PROVIDER_LABELS = {
  claude: 'Ask Claude',
  chatgpt: 'Ask ChatGPT',
  perplexity: 'Ask Perplexity',
  gemini: 'Ask Gemini',
};

const PROVIDER_URLS = {
  claude: 'https://claude.ai/new?q=',
  chatgpt: 'https://chatgpt.com/?q=',
  perplexity: 'https://www.perplexity.ai/search?q=',
  gemini: 'https://gemini.google.com/app?q=',
};

function buildPrompt(template, pageUrl) {
  return template.replace('{pageUrl}', pageUrl);
}

export default function AskAiButton(props) {
  const { siteConfig } = useDocusaurusContext();
  const data = usePluginData('@stackql/docusaurus-plugin-aeo') || {};
  const cfg = data.askAi || {};
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onEsc(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onDocClick);
      document.addEventListener('keydown', onEsc);
    }
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  if (cfg.enabled === false) return null;

  const baseUrl = (siteConfig.url || '').replace(/\/$/, '');
  const pageUrl = `${baseUrl}${location.pathname.replace(/\/$/, '') || ''}`;
  const promptTemplate =
    cfg.promptTemplate ||
    'Read {pageUrl}.md and help me with the following question about it: ';
  const targetUrl = cfg.companionsEnabled === false
    ? pageUrl
    : pageUrl; // template controls .md suffix; pageUrl is the HTML route
  const prompt = buildPrompt(promptTemplate, targetUrl);
  const encoded = encodeURIComponent(prompt);

  const order =
    Array.isArray(cfg.providerOrder) && cfg.providerOrder.length > 0
      ? cfg.providerOrder
      : ['claude', 'chatgpt', 'perplexity', 'gemini'];

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <span>Ask AI about this page</span>
        <span className={styles.caret}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className={styles.menu} role="menu">
          {order.map((key) => {
            const Icon = icons[key];
            const label = PROVIDER_LABELS[key] || key;
            const base = PROVIDER_URLS[key];
            if (!base || !Icon) return null;
            const href = `${base}${encoded}`;
            return (
              <li key={key} className={styles.item} role="none">
                <a
                  role="menuitem"
                  className={styles.itemLink}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <span className={styles.icon}>
                    <Icon />
                  </span>
                  <span>{label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
