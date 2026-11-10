import React, { useState } from 'react';
import Button from '@mui/material/Button';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useLocation } from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { usePluginData } from '@docusaurus/useGlobalData';
import { translate } from '@docusaurus/Translate';
import icons from './icons.js';
import styles from './styles.module.css';
// CommonJS, shared with the Node-side features so the button and the
// emitted file can never disagree about where the companion lives.
import companionPathModule from '../../companionPath.js';
import askAiPromptModule from '../../askAiPrompt.js';

const { companionUrl, pageUrl: pageUrlFor, normalizeRoute } = companionPathModule;
const { fillPrompt } = askAiPromptModule;

// Visible strings go through translate() so a localized site can override
// them in i18n/<locale>/code.json (`docusaurus write-translations` extracts
// them from this theme component).
function providerLabels() {
  return {
    claude: translate({
      id: 'aeo.askAi.provider.claude',
      message: 'Ask Claude',
      description: 'Ask AI menu entry',
    }),
    chatgpt: translate({
      id: 'aeo.askAi.provider.chatgpt',
      message: 'Ask ChatGPT',
      description: 'Ask AI menu entry',
    }),
    perplexity: translate({
      id: 'aeo.askAi.provider.perplexity',
      message: 'Ask Perplexity',
      description: 'Ask AI menu entry',
    }),
  };
}

const PROVIDER_URLS = {
  claude: 'https://claude.ai/new?q=',
  chatgpt: 'https://chatgpt.com/?q=',
  perplexity: 'https://www.perplexity.ai/search?q=',
};

const DEFAULT_PROMPT_TEMPLATE =
  'Read {companionUrl} and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.';


export default function AskAiButton() {
  const { siteConfig } = useDocusaurusContext();
  const data = usePluginData('@stackql/docusaurus-plugin-aeo') || {};
  const cfg = data.askAi || {};
  const location = useLocation();

  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  if (cfg.enabled === false) return null;

  const siteUrl = (siteConfig.url || '').replace(/\/+$/, '');
  const route = normalizeRoute(location.pathname);
  // siteConfig.baseUrl is the locale's base (/de/) in a localized build, so
  // the localized home page resolves like the site root.
  const pageUrl = pageUrlFor(siteUrl, route, siteConfig.baseUrl);

  // Only pages with a companion get the button: a generated category index
  // or a React page has no .md file, so a prompt pointing at one would
  // send the reader to a 404. `companionRoutes` arrives from
  // allContentLoaded; if an older core did not merge it, fall back to
  // showing the button everywhere as before. With companions disabled the
  // prompt uses the page itself.
  const companionsEnabled = cfg.companionsEnabled !== false;
  const routes = data.companionRoutes;
  if (companionsEnabled && Array.isArray(routes)) {
    const known = routes.some((r) => normalizeRoute(r) === route);
    if (!known) return null;
  }
  const mdUrl = companionsEnabled
    ? companionUrl(siteUrl, route, siteConfig.trailingSlash, siteConfig.baseUrl)
    : pageUrl;

  const promptTemplate = cfg.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
  const prompt = fillPrompt(promptTemplate, { pageUrl, companionUrl: mdUrl });
  const encoded = encodeURIComponent(prompt);

  const order =
    Array.isArray(cfg.providerOrder) && cfg.providerOrder.length > 0
      ? cfg.providerOrder
      : ['claude', 'chatgpt', 'perplexity'];

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const labels = providerLabels();

  return (
    <div className={styles.dropdownWrapper}>
      <Button
        variant="outlined"
        size="small"
        endIcon={<KeyboardArrowDownIcon />}
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        sx={{
          textTransform: 'none',
          fontFamily: 'var(--ifm-font-family-base)',
          fontWeight: 600,
          fontSize: '0.75rem',
          borderColor: 'var(--ifm-color-primary)',
          color: 'var(--ifm-color-primary)',
          '&:hover': {
            borderColor: 'var(--ifm-color-primary)',
            // a 4% tint of the site's own primary colour
            backgroundColor: 'color-mix(in srgb, var(--ifm-color-primary) 4%, transparent)',
          },
        }}
      >
        {translate({
          id: 'aeo.askAi.button',
          message: 'Ask AI about this page',
          description: 'Label of the Ask AI dropdown button',
        })}
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{
          '& .MuiPaper-root': {
            fontFamily: 'var(--ifm-font-family-base)',
            minWidth: 200,
          },
        }}
      >
        {order.map((key) => {
          const Icon = icons[key];
          const label = labels[key];
          const base = PROVIDER_URLS[key];
          if (!base || !Icon) return null;
          const href = `${base}${encoded}`;
          return (
            <MenuItem
              key={key}
              component="a"
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleClose}
            >
              <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
                <Icon />
              </ListItemIcon>
              <ListItemText
                primaryTypographyProps={{
                  fontSize: '0.85rem',
                  fontFamily: 'var(--ifm-font-family-base)',
                }}
              >
                {label}
              </ListItemText>
            </MenuItem>
          );
        })}
      </Menu>
    </div>
  );
}
