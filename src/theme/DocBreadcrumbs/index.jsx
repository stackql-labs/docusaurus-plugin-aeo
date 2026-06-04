import React from 'react';
// See note in the AskAiButton swizzle: @theme-init resolves to the
// initial component from the theme chain (theme-classic), avoiding the
// recursion that @theme-original produces when a plugin (not a theme)
// is the only contributor in the wrapper layer.
import DocBreadcrumbs from '@theme-init/DocBreadcrumbs';
import AskAiButton from '@theme/AskAiButton';
import styles from './styles.module.css';

export default function DocBreadcrumbsWrapper(props) {
  return (
    <div className={styles.row}>
      <DocBreadcrumbs {...props} />
      <AskAiButton />
    </div>
  );
}
