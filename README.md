# @njdamstra/v-animate

Vue 3 animation composable with plugin-based architecture.

## Installation

```bash
npm install @njdamstra/v-animate
# or
pnpm add @njdamstra/v-animate
```

## Usage

```typescript
import { useAnimation } from '@njdamstra/v-animate'

const { play, pause, stop, isPlaying } = useAnimation(elementRef, {
  animation: {
    preset: 'fadeIn',
    duration: 300
  },
  autoplay: { trigger: 'visible' }
})
```

## Features

- 11 animation plugins (8 core, 3 lazy-loaded)
- 16 built-in presets
- Environment-aware (respects prefers-reduced-motion)
- SSR-safe
- Full TypeScript support
- Tree-shakeable

## Plugins

### Core (always loaded)
- **webAnimationPlugin** - Web Animations API integration
- **responsivePlugin** - Responsive breakpoint handling
- **cssAnimationPlugin** - CSS animation support
- **staggerPlugin** - Staggered animations for lists
- **cssVarsPlugin** - CSS custom properties animation
- **autoplayPlugin** - Visibility-triggered animations
- **scrollPlugin** - Scroll-linked animations
- **timelinePlugin** - Multi-phase timelines

### Lazy-loaded
- **motionPathPlugin** - SVG motion paths
- **gridPlugin** - Grid layout animations
- **relationshipsPlugin** - Connected element animations

## Presets

```typescript
import { animationPresets } from '@njdamstra/v-animate'

// Available presets:
// fadeIn, fadeOut, slideUp, slideDown, slideLeft, slideRight,
// scaleUp, scaleDown, popIn, popOut, bounceIn, shake,
// pulse, spin, flip, swing
```

## License

MIT
