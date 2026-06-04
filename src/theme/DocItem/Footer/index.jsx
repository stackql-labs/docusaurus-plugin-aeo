import React from 'react';
import Footer from '@theme-original/DocItem/Footer';
import AskAiButton from '@theme/AskAiButton';

export default function FooterWrapper(props) {
  return (
    <>
      <AskAiButton />
      <Footer {...props} />
    </>
  );
}
