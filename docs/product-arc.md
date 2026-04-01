# Wassily Product Arc

## Core Idea

Wassily is the bridge from visual taste to production UI color.

The product arc is:

**moodboard -> color exploration -> UI implementation**

This keeps Wassily focused. It is not a general design tool and not a generic AI chat surface. It is an instrument for turning references, feelings, and loose color intuition into a usable color system.

## The Three Stages

### 1. Moodboard

Start with references, not tokens.

Users drop in screenshots, photography, artwork, brand references, or existing UI. They collect swatches, cluster color families, pin anchors, and arrange material spatially on the canvas.

Goal: capture taste.

### 2. Color Exploration

Turn taste into structure.

Users purify colors, harmonize selections, promote swatches into ramps, compare branches, connect related colors, and test contrast. This is the heart of Wassily: a canvas for thinking through color as a system, not just picking values.

Goal: evolve a palette into a coherent, expressive, accessible system.

### 3. UI Implementation

Turn structure into production output.

Users export ramps and semantic aliases as CSS variables, Tailwind tokens, design tokens, or Figma-ready variables. The output is not just "nice colors" but implementation-ready color roles for real interfaces.

Goal: ship the palette.

## Role of the Agent

The agent should feel like a creative partner inside the studio, not a sidebar chatbot.

Its role changes by stage:

- In moodboard mode, it is a curator.
- In exploration mode, it is a collaborator.
- In implementation mode, it is a systems designer.

Examples:

- "What is the color story here?"
- "Keep this green anchor, but push the rest toward early evening."
- "Turn this board into a usable product palette."
- "Propose semantic roles for these ramps."

The agent should mostly orchestrate and critique. Wassily's own engine should remain the source of truth for color science, ramp generation, harmonization, contrast, and export logic.

## Multiplayer Direction

Multiplayer makes Wassily feel less like an editor and more like a studio.

Humans should share a room with live presence, shared canvas state, and lightweight conversation around the work. The agent should appear as another participant in that room: able to inspect, suggest, and, when allowed, edit.

Subagents are useful, but they should work as background helpers, not extra personalities on the canvas. Good delegated tasks include:

- accessibility audits
- semantic token proposals
- reference research
- naming suggestions
- palette comparisons
- export preparation

## Claude Code Reuse Strategy

If we want to use as much of `claudecode/src` as possible, the best move is not to port the app into the browser. The best move is to use Claude Code as the **agent host** and let Wassily be the specialized canvas frontend and tool environment.

### Recommended Architecture

- Wassily owns the canvas, room state, presence, and UI.
- Wassily owns the color engine and remains the source of truth for color behavior.
- Claude Code runs as a sidecar or service that hosts the agent runtime.
- The agent talks to Wassily through MCP tools and room operations.

This gives us the most leverage with the least distortion.

### Reuse Heavily

These are the parts of Claude Code worth reusing deeply:

- tool contracts and metadata
- model and tool orchestration
- MCP client and tool plumbing
- task execution
- subagent and coordinator patterns

These pieces are the real asset. They provide the agent runtime, permissions model, and delegation model we want for a creative partner that can also launch background helpers.

### Do Not Reuse Directly

These parts should not be carried over as-is:

- terminal UI
- REPL screens
- CLI bootstrap
- command registry
- terminal-specific app state

Those parts are shaped around a terminal product, not an embedded multiplayer canvas.

### What Wassily Needs To Add

To make this architecture work, Wassily should add:

- write-capable MCP tools, not just advisory/read tools
- a room-aware document/action layer for multiplayer
- an embedded assistant surface in the canvas UI
- proposal and preview states so the agent can suggest before applying
- a task tray for delegated background work

### Practical Principle

The key question is not "what code can we copy into React?"

The key question is:

**How can Wassily become a specialized frontend and tool environment for the Claude Code runtime?**

That is the path that uses the most of Claude Code while still keeping Wassily coherent.

## Product Principle

Wassily should own color decisions, not try to become a full UI builder.

The handoff to implementation matters, but Wassily stays strongest when it remains focused on:

- reference collection
- palette system design
- token generation
- implementation guidance

Not:

- full layout design
- general vector editing
- full app prototyping

## Working Model

The right mental model is:

**Wassily is where a visual instinct becomes a production-ready color system.**

That is the product.
