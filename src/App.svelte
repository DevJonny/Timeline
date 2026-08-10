<script lang="ts">
  // Step 1 placeholder: exists to prove the GitHub Pages deploy pipeline end to
  // end before any of the real timeline machinery lands.
  const year = new Date().getFullYear();
</script>

<main>
  <h1>Timeline</h1>
  <p>From the Stone Age to {year}.</p>
  <p class="muted">Scaffold deployed. Timeline coming next.</p>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: max(1rem, env(safe-area-inset-top)) 1rem
      max(1rem, env(safe-area-inset-bottom));
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 8vw, 3rem);
    letter-spacing: -0.02em;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
  }

  .muted {
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
