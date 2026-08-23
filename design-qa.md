# Static Agriculture Login QA

- source visual truth path: `design-references/login-plant-concept.png`
- implementation screenshot paths:
  - `design-qa-evidence/login-concept-final.png`
  - `design-qa-evidence/login-concept-mobile.png`
- combined comparison evidence: `design-qa-evidence/comparison-login-concept-final.png`
- source pixels: 1672 x 941
- implementation pixels: 1280 x 720 desktop and 390 x 844 mobile
- CSS viewport: 1280 x 720 desktop and 390 x 844 mobile
- density normalization: source resized to 1280 x 720 at the same 16:9 ratio; implementation captured at CSS pixel density 1
- state: empty login form, static mature tomato background, light agriculture theme

## Findings

- No actionable P0, P1, or P2 difference remains.
- Fonts and typography: the serif heading, compact sans-serif labels, weight hierarchy, line height and letter spacing remain clear against the bright scene.
- Spacing and layout rhythm: the tomato and exposed roots dominate the left side while the 356px login surface stays in the source image's intentional right-side negative space.
- Colors and tokens: warm ivory, pale sage, botanical green, natural soil brown and tomato red match the selected concept; the green submit action remains the only saturated control.
- Image quality and asset fidelity: the runtime uses the exact approved concept image, with no generated substitute, CSS illustration, WebGL distortion, background video or frame sequence.
- Copy and content: only the brand, login title, credential fields, primary action, demo identity and password help remain visible.
- Interaction states: password visibility, validation, demo identity, loading, live login, offline demo login and logout remain functional; continuous scene motion and mouse parallax were intentionally removed.
- Responsive behavior: at 390 x 844 the canopy remains visible, the form is fully contained within the viewport, and horizontal overflow is absent.
- Accessibility: semantic labels, alert/status regions, visible keyboard focus and reduced-motion handling remain present.

## Focused Region Comparison

Not required. At 1280 x 720 the combined board keeps the complete plant, roots, brand, form typography and primary action readable; the separate 390 x 844 capture covers mobile spacing.

## Comparison History

### Final pass — passed

- The source and implementation use the same plant artwork and crop.
- The only intentional addition is the functional AgriLoop brand and right-side login form.
- No visual fix was required after the current static-background capture.

## Runtime Checks

- Vite production build passed.
- Empty form and incorrect-password validation remain on the login page.
- Correct backend credentials create a live session and enter `index.html`.
- Backend-unavailable seeded credentials enter clearly labelled demo mode.
- Logout clears the session and returns to the current `login.html`.
- Direct dashboard access without a valid session returns to `login.html`.
- Desktop and 390 x 844 mobile layouts were inspected.
- Current login-page browser warning/error log was empty.
- `git diff --check` passed.

final result: passed
