# FounderLaunch_OS Motion System

**Document:** `animations.md`  
**Version:** 1.0  
**Status:** Core motion specification  
**Design language:** LaunchChrome™  
**Theme:** Dark-only  
**Dependencies:** `design.md`, `colors.md`, `components.md`

---

## 1. Purpose

This file defines how FounderLaunch_OS moves.

Motion is a core part of the brand—not decoration added after the interface is built.

Every animation should reinforce one of these ideas:

- ignition
- momentum
- deployment
- control
- progress
- reward
- system response
- premium polish

FounderLaunch_OS motion must feel:

- fast
- tactile
- cinematic
- mechanical
- responsive
- energetic
- intentional

It must never feel:

- slow
- floaty
- childish
- random
- excessive
- distracting
- disconnected from user actions

---

## 2. Core Motion Principle

FounderLaunch_OS does not simply reveal interface elements.

It:

- deploys panels
- charges progress
- locks controls into place
- ignites actions
- sweeps light across chrome
- docks notifications
- powers systems up and down
- rewards meaningful progress

The guiding rule is:

> Every motion must explain state, cause, progress, or reward.

---

## 3. Motion Hierarchy

Motion intensity must match component importance.

### Level 1 — Functional Motion

Use for:

- hover states
- focus changes
- button presses
- tab changes
- input feedback
- utility menus

Characteristics:

- fast
- subtle
- low travel distance
- no dramatic glow burst
- no large scaling

---

### Level 2 — Structural Motion

Use for:

- panels
- drawers
- cards
- dropdowns
- dashboard modules
- navigation changes

Characteristics:

- directional
- slightly mechanical
- moderate depth shift
- short chrome or neon response
- clear start and end state

---

### Level 3 — Signature Motion

Use for:

- hero entry
- launch actions
- milestone completion
- achievement unlock
- major modal
- Founder Mode activation
- Mission Complete states

Characteristics:

- cinematic
- multi-stage
- carefully timed
- branded with chrome, pink, lime, or gold
- used sparingly

Only one Level 3 event should dominate at a time.

---

## 4. Motion Timing Scale

Use these timing tokens.

```css
:root {
  --fl-motion-instant: 80ms;
  --fl-motion-fast: 120ms;
  --fl-motion-standard: 180ms;
  --fl-motion-medium: 260ms;
  --fl-motion-slow: 360ms;
  --fl-motion-cinematic: 700ms;
  --fl-motion-celebration: 1200ms;
}
```

### Recommended usage

- press response: `80ms–120ms`
- hover response: `120ms–180ms`
- tab or filter change: `160ms–220ms`
- card reveal: `220ms–300ms`
- drawer or modal deployment: `260ms–360ms`
- progress charge: `500ms–900ms`
- milestone sequence: `700ms–1400ms`

Routine interactions must never feel delayed.

---

## 5. Easing System

FounderLaunch_OS motion should feel sharp and controlled.

### Standard Enter

```css
cubic-bezier(0.16, 1, 0.3, 1)
```

Use for:

- panels
- cards
- modals
- dropdowns
- navigation reveals

---

### Standard Exit

```css
cubic-bezier(0.7, 0, 0.84, 0)
```

Use for:

- dismissals
- closing panels
- toast exits
- collapsed states

---

### Mechanical Snap

```css
cubic-bezier(0.2, 0.8, 0.2, 1)
```

Use for:

- button release
- control toggles
- active-state locking
- tab rails

---

### Ignition

```css
cubic-bezier(0.1, 0.9, 0.2, 1)
```

Use for:

- launch actions
- progress charge
- CTA activation
- gauge fills

---

### Do not use

- slow elastic motion
- cartoon bounce
- excessive spring overshoot
- continuous wobble
- default browser easing for signature moments

---

## 6. Spatial Motion Rules

Motion should follow interface structure.

### Entering content

Preferred directions:

- from below for major content
- from right for secondary panels
- from left for navigation
- from center for logo and modal activation
- from top-right for system notifications

### Exiting content

Reverse the entry direction unless doing so harms flow.

### Travel limits

- utility controls: `2px–6px`
- cards and small panels: `8px–16px`
- drawers and side panels: based on full panel width
- hero elements: `16px–40px`
- achievement effects: may exceed these limits briefly

Avoid large unnecessary travel.

---

## 7. Hover Motion

Hover should create anticipation.

Approved effects:

- lift `2px–4px`
- slight scale `1.01–1.03`
- sharpen chrome border
- intensify one neon edge
- shift arrow or chevron `2px–4px`
- reveal a reflective sweep
- illuminate a corner bracket
- increase shadow depth

Do not:

- rotate cards randomly
- scale above `1.05`
- trigger particles on every hover
- use long hover animations
- animate all child elements simultaneously

---

## 8. Press Motion

Press states must feel physical.

Approved sequence:

1. component compresses `1px–2px`
2. glow reduces
3. inner shadow deepens
4. action confirms
5. component snaps back

Recommended duration:

- down: `80ms`
- release: `100ms–140ms`

Primary CTAs may trigger a brief neon pulse after release.

---

## 9. Chrome Sweep

Chrome Sweep is a signature LaunchChrome™ effect.

### Visual behavior

A narrow bright reflection moves across:

- button
- heading
- frame
- badge
- premium card

### Rules

- direction: upper-left to lower-right
- duration: `500ms–900ms`
- frequency: on hover, activation, or infrequent ambient use
- opacity: controlled
- width: narrow
- never obscure text

### Ambient use

If used automatically:

- no more often than every `6–12 seconds`
- only on one major component at a time
- disabled under reduced motion

---

## 10. Neon Edge Activation

Use when a component becomes active.

Sequence:

1. edge begins dim
2. glow rapidly travels along the border
3. selected edge brightens
4. final glow settles to a stable level

Use for:

- navigation
- tabs
- active cards
- focused fields
- selected filters
- toggles

Duration:

`180ms–320ms`

---

## 11. Panel Deployment

Panels should deploy like interface hardware.

Sequence:

1. outer frame appears
2. panel moves into position
3. chrome edge catches light
4. content fades or resolves
5. neon accent locks into place

Recommended transform:

```css
transform:
  translateY(12px)
  scale(0.985);
```

Final state:

```css
transform:
  translateY(0)
  scale(1);
```

Do not make every panel deploy sequentially on every page visit.

---

## 12. Navigation Motion

### Desktop rail

- active indicator travels vertically
- selected item brightens
- icon receives short glow
- label shifts slightly
- final state locks into a rail

### Top navigation

- underline or chrome rail activates
- no large movement
- CTA may use a chrome sweep on hover

### Mobile navigation

- active state should snap clearly
- reduce glow radius
- avoid complex particle effects

---

## 13. Modal Deployment

Modal motion should feel like docking.

Sequence:

1. backdrop darkens
2. frame scales from `0.97`
3. modal moves upward `8px–16px`
4. chrome border sharpens
5. content becomes fully visible
6. one accent edge activates

Duration:

`260ms–360ms`

Exit should be faster:

`180ms–240ms`

Do not use slow fade-only modal motion.

---

## 14. Drawer Motion

Side drawers should slide with mechanical precision.

Rules:

- no bounce
- track with pointer gesture when applicable
- shadow deepens as drawer moves
- background content dims slightly
- chrome leading edge remains visible

Duration:

`240ms–340ms`

---

## 15. Toast Docking

Toasts should feel like system transmissions.

Sequence:

1. enter from top-right or bottom-right
2. chrome edge flashes briefly
3. toast settles
4. status light stabilizes
5. exit in reverse direction

Duration:

- enter: `200ms–280ms`
- exit: `160ms–220ms`

Only critical alerts may use a stronger pulse.

---

## 16. Dropdown and Popover Motion

Use:

- slight downward or upward reveal
- small scale from `0.98`
- opacity change
- quick border illumination

Duration:

`140ms–220ms`

Avoid:

- spinning
- large sliding movement
- dramatic glow
- delayed item appearance

---

## 17. Tab Transition

Tabs should switch modes quickly.

Preferred behavior:

- active rail slides
- outgoing content fades and shifts `4px–8px`
- incoming content resolves immediately after
- label color updates with rail

Duration:

`160ms–220ms`

Do not animate full-screen content heavily for a simple tab change.

---

## 18. Input Focus Motion

On focus:

1. chrome border brightens
2. one neon edge activates
3. label gains contrast
4. inner surface subtly lifts

Duration:

`120ms–180ms`

On error:

- red edge activation
- small status pulse
- no aggressive shake

---

## 19. Toggle Motion

Toggles should feel like a power switch.

### Off to On

1. knob moves
2. track charges
3. status light activates
4. glow settles

Duration:

`160ms–240ms`

### On to Off

1. glow dims
2. knob moves
3. track returns to black chrome
4. status light powers down

No bounce.

---

## 20. Progress Charge

Progress should charge like energy entering a system.

Sequence:

1. track activates
2. gradient begins filling
3. leading edge glows
4. ticks light up
5. final value locks
6. glow settles

Duration depends on context:

- short action: `400ms–600ms`
- onboarding or mission progress: `600ms–900ms`
- major launch readiness: `900ms–1400ms`

Avoid looping progress animation after completion.

---

## 21. Gauge Animation

Gauge motion should feel instrument-driven.

Sequence:

1. ring or ticks illuminate
2. active arc charges
3. number counts up
4. endpoint glows
5. state label resolves

Use tabular numerals.

Duration:

`600ms–1000ms`

Do not use dramatic needle bounce.

---

## 22. Metric Count-Up

Use for:

- Founder Score
- revenue
- completion
- launch speed
- success rate
- streaks

Rules:

- start near the previous value when known
- do not always count from zero
- use fast deceleration
- duration: `400ms–800ms`
- no continuous looping
- preserve exact final value

---

## 23. Hero Entrance

The landing page hero may use a Level 3 sequence.

Recommended order:

1. atmosphere fades in
2. chrome framing appears
3. logo platform activates
4. headline reveals
5. CTA buttons deploy
6. proof or metrics resolve
7. subtle ambient motion begins

Total duration:

`900ms–1600ms`

Do not delay interaction until the sequence ends.

The primary CTA must be usable immediately.

---

## 24. Logo Ignition

Use for:

- app launch
- loading screen
- hero centerpiece
- Founder Mode activation

Sequence:

1. black screen or deep background
2. faint chrome silhouette
3. lime energy activates on one side
4. pink energy activates on the other
5. chrome reflection sweeps across the logo
6. logo locks into full brightness
7. interface deploys

Duration:

`800ms–1600ms`

Use sparingly.

Do not replay it on every route change.

---

## 25. Launch Sequence

Use for a major launch action.

Sequence:

1. CTA compresses
2. glow collapses inward
3. progress or ignition rail activates
4. panel or screen transitions
5. status changes to LAUNCHING
6. success state resolves
7. optional reward appears

The sequence must always provide:

- clear progress
- cancel or recovery where relevant
- success or failure state
- no fake waiting animation

---

## 26. Mission Complete

Use when a meaningful founder mission is completed.

Recommended sequence:

1. completion control activates
2. lime charge runs across the card
3. mission label changes
4. Founder XP or progress updates
5. small chrome highlight flashes
6. optional badge appears

Duration:

`500ms–1000ms`

Use a larger sequence only for major milestones.

---

## 27. Achievement Unlock

Achievement Unlock is a Level 3 reward.

Sequence:

1. background dims slightly
2. badge silhouette appears
3. chrome frame forms
4. neon core activates
5. badge rotates or tilts minimally
6. rank label appears
7. gold or neon pulse resolves
8. next milestone is shown

Duration:

`900ms–1400ms`

Do not use for routine task completion.

---

## 28. Founder Mode Activation

Founder Mode is a signature state change.

Sequence:

1. interface briefly darkens
2. navigation rails illuminate
3. key metrics charge
4. primary CTA shifts to active mode
5. logo or emblem receives a glow
6. status updates to FOUNDER MODE ACTIVE

Duration:

`700ms–1200ms`

This should feel powerful but not block the user.

---

## 29. Loading Motion

Approved loading patterns:

- segmented energy rail
- scanning chrome line
- rotating mechanical ring
- pulsing launch core
- logo ignition
- skeleton with chrome sweep

Rules:

- always indicate that work is happening
- show progress when measurable
- avoid infinite loops for known-duration tasks
- keep text visible for long operations
- provide cancel or retry when appropriate

---

## 30. Skeleton Loading

Skeletons should use:

- Black Chrome base
- subtle chrome highlight
- low-intensity moving reflection
- no white flashing
- shape matching final content

Sweep duration:

`1200ms–1800ms`

Under reduced motion:

- use static tone difference
- no moving sweep

---

## 31. Error Motion

Errors must feel clear, not theatrical.

Approved:

- red edge activation
- short status pulse
- icon illumination
- subtle panel emphasis

Avoid:

- aggressive shake
- flashing red screen
- repeated pulsing
- loud celebratory motion

---

## 32. Success Motion

Success should reinforce progress.

Approved:

- lime charge
- chrome sweep
- metric update
- badge reveal
- restrained gold accent
- brief glow pulse

Routine success:

`300ms–600ms`

Milestone success:

`700ms–1400ms`

---

## 33. Ambient Motion

Ambient motion adds life without requiring interaction.

Approved:

- slow background particle drift
- subtle neon bloom movement
- occasional chrome reflection
- faint grid parallax
- soft energy line movement
- slow gauge pulse for active system state

Rules:

- low contrast
- low speed
- no more than two ambient systems in one region
- never distract from reading
- disable under reduced motion
- reduce on mobile and low-power devices

---

## 34. Cursor-Reactive Motion

Optional on desktop only.

Approved:

- slight glow response
- shallow card perspective
- reflective highlight shift
- local particle attraction
- edge light movement

Rules:

- maximum rotation: `1deg–2deg`
- maximum translation: `2px–4px`
- no custom cursor required
- no laggy trailing effects
- disable on touch devices
- disable under reduced motion

---

## 35. Parallax

Use sparingly in:

- landing-page hero
- logo stage
- major feature showcase
- cinematic background

Maximum depth layers:

- 3 primary layers
- 1 optional atmospheric layer

Keep movement subtle.

Do not use parallax inside dense dashboard workflows.

---

## 36. Page Transition

Preferred route transition:

1. current content dims slightly
2. chrome rail or scan line activates
3. new content deploys
4. active navigation locks in

Duration:

`220ms–360ms`

Do not replay the full logo ignition sequence.

---

## 37. Reduced Motion

FounderLaunch_OS must support `prefers-reduced-motion`.

When reduced motion is enabled:

- disable particles
- disable parallax
- disable continuous chrome sweeps
- remove large scaling
- remove cursor-reactive motion
- replace slide transitions with short fades
- show progress instantly or with minimal fill
- preserve state changes clearly
- retain focus and active-state visibility

Example:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

Do not rely solely on the global override. Components should also have intentional reduced-motion variants.

---

## 38. Mobile Motion Rules

Mobile motion must preserve brand identity without harming performance.

Reduce:

- glow radius
- particle count
- parallax
- simultaneous animations
- large travel distance
- long cinematic sequences

Preserve:

- tactile press
- active rails
- progress charge
- modal docking
- chrome edge response
- mission completion feedback

---

## 39. Performance Rules

Required:

- prefer `transform` and `opacity`
- avoid animating layout-heavy properties
- use GPU-friendly effects
- minimize large blurred shadows in motion
- limit simultaneous filters
- lazy-load decorative animation
- pause ambient animation when off-screen
- reduce effects on low-power devices
- avoid large autoplay video backgrounds where CSS can achieve the result

A motion system that drops frames is not premium.

---

## 40. Motion Tokens

```css
:root {
  --fl-ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --fl-ease-exit: cubic-bezier(0.7, 0, 0.84, 0);
  --fl-ease-snap: cubic-bezier(0.2, 0.8, 0.2, 1);
  --fl-ease-ignition: cubic-bezier(0.1, 0.9, 0.2, 1);

  --fl-duration-instant: 80ms;
  --fl-duration-fast: 120ms;
  --fl-duration-standard: 180ms;
  --fl-duration-medium: 260ms;
  --fl-duration-slow: 360ms;
  --fl-duration-cinematic: 700ms;
  --fl-duration-celebration: 1200ms;

  --fl-lift-small: 2px;
  --fl-lift-medium: 4px;
  --fl-scale-hover: 1.02;
  --fl-scale-press: 0.985;
}
```

---

## 41. Example Button Motion

```css
.launch-button {
  transform: translateY(0) scale(1);
  transition:
    transform var(--fl-duration-standard) var(--fl-ease-snap),
    box-shadow var(--fl-duration-standard) var(--fl-ease-enter),
    filter var(--fl-duration-standard) var(--fl-ease-enter);
}

.launch-button:hover {
  transform:
    translateY(calc(var(--fl-lift-small) * -1))
    scale(var(--fl-scale-hover));
  filter: brightness(1.08);
}

.launch-button:active {
  transform:
    translateY(1px)
    scale(var(--fl-scale-press));
  filter: brightness(0.92);
}
```

---

## 42. Example Panel Deployment

```css
@keyframes fl-panel-deploy {
  0% {
    opacity: 0;
    transform: translateY(14px) scale(0.985);
    filter: brightness(0.72);
  }

  70% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: brightness(1.08);
  }

  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: brightness(1);
  }
}

.panel-deploy {
  animation:
    fl-panel-deploy
    var(--fl-duration-medium)
    var(--fl-ease-enter)
    both;
}
```

---

## 43. Example Chrome Sweep

```css
.chrome-sweep {
  position: relative;
  overflow: hidden;
}

.chrome-sweep::after {
  content: "";
  position: absolute;
  inset: -20%;
  width: 24%;
  transform: translateX(-220%) rotate(18deg);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.72),
    transparent
  );
  pointer-events: none;
}

.chrome-sweep:hover::after {
  animation:
    fl-chrome-sweep
    720ms
    var(--fl-ease-enter);
}

@keyframes fl-chrome-sweep {
  to {
    transform: translateX(520%) rotate(18deg);
  }
}
```

---

## 44. AI Motion Directive

Use this instruction when generating FounderLaunch_OS motion:

> Apply the FounderLaunch_OS LaunchChrome™ motion system. Motion should feel fast, tactile, mechanical, cinematic, and responsive. Panels deploy, progress charges, controls lock into place, chrome highlights sweep, neon edges activate, and major actions ignite. Use subtle functional motion for routine interactions and reserve dramatic multi-stage animation for launches, milestones, Founder Mode, and achievement unlocks. Avoid slow floaty transitions, cartoon bounce, random particles, excessive scaling, and animation that delays interaction. Include reduced-motion behavior and prioritize transform and opacity for performance.

---

## 45. Motion Approval Checklist

Before approving motion, confirm:

1. Does the motion communicate state or cause?
2. Is the timing fast enough?
3. Does the easing feel controlled?
4. Is the travel distance appropriate?
5. Does it match the component’s importance?
6. Is motion branded without being distracting?
7. Is there only one dominant signature animation at a time?
8. Does the interface remain immediately usable?
9. Is reduced motion supported?
10. Does it perform smoothly on mobile?
11. Does it feel mechanical rather than floaty?
12. Does it reinforce FounderLaunch_OS momentum?
13. Is flashy motion reserved for meaningful moments?
14. Would removing the motion make the state less clear?

If the answer to questions 1, 8, 9, or 10 is “no,” the motion is not ready.

---

## 46. Final Standard

FounderLaunch_OS motion should make the interface feel alive without making it harder to use.

Every interaction should feel:

- deliberate
- responsive
- premium
- energetic
- rewarding

The final rule is:

> Motion must increase clarity, confidence, or momentum—or it does not belong.
