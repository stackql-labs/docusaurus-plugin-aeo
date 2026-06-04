import React from 'react';
import Title from '@theme-init/BlogPostItem/Header/Title';
import AskAiButton from '@theme/AskAiButton';
import styles from './styles.module.css';

// Mirror the docs breadcrumb-row placement: render a flex row above the
// post title with the Ask AI button right-aligned. Blog posts have no
// breadcrumbs, so the title block is the closest visual analog to the
// docs "above the H1, top of content" position.
export default function TitleWrapper(props) {
  return (
    <>
      <div className={styles.row}>
        <AskAiButton />
      </div>
      <Title {...props} />
    </>
  );
}
