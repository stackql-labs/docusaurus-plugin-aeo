// Hand-rolled minimal SVGs for the four supported AI providers. Glyphs only;
// outer wrapper supplies size and color. Using `currentColor` so the icon
// inherits theme colors via CSS.

const React = require('react');

function svg(children, viewBox = '0 0 24 24') {
  return React.createElement(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '1em',
      height: '1em',
      viewBox,
      fill: 'currentColor',
      'aria-hidden': 'true',
    },
    children,
  );
}

const ClaudeIcon = () =>
  svg(
    React.createElement('path', {
      d: 'M5.5 17.5 9.6 6.6h2.6l4.1 10.9h-2.4l-.9-2.5h-3.9l-.9 2.5H5.5Zm4.6-4.5h2.8l-1.4-4-1.4 4Zm6.4 4.5V6.6h2.2v10.9h-2.2Z',
    }),
  );

const ChatGptIcon = () =>
  svg(
    React.createElement('path', {
      d: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm4.6 12.4-3.9 2.3a1.5 1.5 0 0 1-1.4 0L7.4 14.4a1.5 1.5 0 0 1-.7-1.3V8.6a1.5 1.5 0 0 1 .7-1.3l3.9-2.3a1.5 1.5 0 0 1 1.4 0l3.9 2.3a1.5 1.5 0 0 1 .7 1.3v4.5a1.5 1.5 0 0 1-.7 1.3ZM12 8.5l-3.2 1.8v3.4L12 15.5l3.2-1.8v-3.4Z',
    }),
  );

const PerplexityIcon = () =>
  svg(
    React.createElement('path', {
      d: 'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.7 3.7L12 11.7 5.3 8 12 4.3ZM5 9.7l6 3.3v6.6l-6-3.3V9.7Zm14 0v6.6l-6 3.3V13l6-3.3Z',
    }),
  );

const GeminiIcon = () =>
  svg(
    React.createElement('path', {
      d: 'M12 2 9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2Z',
    }),
  );

module.exports = {
  claude: ClaudeIcon,
  chatgpt: ChatGptIcon,
  perplexity: PerplexityIcon,
  gemini: GeminiIcon,
};
