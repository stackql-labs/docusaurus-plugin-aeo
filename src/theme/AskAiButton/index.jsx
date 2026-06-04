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
import icons from './icons.js';
import styles from './styles.module.css';

const PROVIDER_LABELS = {
  claude: 'Ask Claude',
  chatgpt: 'Ask ChatGPT',
  perplexity: 'Ask Perplexity',
};

const PROVIDER_URLS = {
  claude: 'https://claude.ai/new?q=',
  chatgpt: 'https://chatgpt.com/?q=',
  perplexity: 'https://www.perplexity.ai/search?q=',
};

const DEFAULT_PROMPT_TEMPLATE =
  'Read {pageUrl}.md and help me understand it. Summarize the key points, then ask me one clarifying question to dig deeper.';

export default function AskAiButton() {
  const { siteConfig } = useDocusaurusContext();
  const data = usePluginData('@stackql/docusaurus-plugin-aeo') || {};
  const cfg = data.askAi || {};
  const location = useLocation();

  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  if (cfg.enabled === false) return null;

  const baseUrl = (siteConfig.url || '').replace(/\/$/, '');
  const pageUrl = `${baseUrl}${location.pathname.replace(/\/$/, '') || ''}`;
  const promptTemplate = cfg.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
  const prompt = promptTemplate.replace('{pageUrl}', pageUrl);
  const encoded = encodeURIComponent(prompt);

  const order =
    Array.isArray(cfg.providerOrder) && cfg.providerOrder.length > 0
      ? cfg.providerOrder
      : ['claude', 'chatgpt', 'perplexity'];

  const handleOpen = (e) => setAnchorEl(e.currentTarget);
  const handleClose = () => setAnchorEl(null);

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
            backgroundColor: 'rgba(0, 65, 101, 0.04)',
          },
        }}
      >
        Ask AI about this page
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
          const label = PROVIDER_LABELS[key];
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
