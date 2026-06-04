// Provider brand icons. Hand-rolled inline SVGs lifted from
// publicly-available marks (simple-icons paths under CC0-1.0 for
// Claude and Perplexity; the @lobehub/icons OpenAI Mono path for
// ChatGPT). Brand color is hardcoded on each path so MUI's
// ListItemIcon color override doesn't tint them.
//
// We hand-roll rather than depend on @lobehub/icons because lobehub
// pinned react@^19 from 5.x onward, breaking React 18 consumers.
// simple-icons works on any Node + React but no longer ships an
// OpenAI mark following a 2024 trademark request, so a unified
// "single library" path is no longer available - hand-rolled is the
// only zero-conflict option.
//
// Bundle cost: ~3KB across the three SVG components combined.

import Claude from './brand-icons/Claude.jsx';
import ChatGpt from './brand-icons/ChatGpt.jsx';
import Perplexity from './brand-icons/Perplexity.jsx';

const icons = {
  claude: Claude,
  chatgpt: ChatGpt,
  perplexity: Perplexity,
};

export default icons;
